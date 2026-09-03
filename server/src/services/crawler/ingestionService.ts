import { prisma } from '../../config/database';
import { getRedis } from '../../config/redis';
import { logger } from '../../utils/logger';
import { generateQuestionFingerprint } from './fingerprint';
import { SEED_TOPICS, classifyTopic } from './taxonomy';
import { OFFICIAL_2026_EXAM_FORECAST_BANK, RawCandidateQuestion } from './sources';

export interface IngestionResult {
  status: 'SUCCESS' | 'FAILED' | 'LOCKED';
  sourcesProcessed: number;
  questionsDiscovered: number;
  questionsAccepted: number;
  duplicatesSkipped: number;
  topicsCreated: number;
  durationMs: number;
  error?: string;
}

export class QuestionIngestionService {
  private readonly crawlerLockKey = 'pairtalk:crawler:lock';
  private readonly lockTtlMs = 60000; // 1 minute lock

  public async runIngestion(options?: {
    customSources?: RawCandidateQuestion[];
    force?: boolean;
    onNewTopics?: (newCount: number, topics: string[]) => Promise<void>;
  }): Promise<IngestionResult> {
    const startTime = Date.now();
    const redis = getRedis();

    // 1. Acquire distributed crawler lock
    let hasLock = false;
    try {
      const lockRes = await redis.set(this.crawlerLockKey, String(process.pid), 'PX', this.lockTtlMs, 'NX');
      hasLock = lockRes === 'OK';
    } catch {
      hasLock = true; // Fallback if redis unavailable
    }

    if (!hasLock && !options?.force) {
      logger.warn('Crawler execution skipped: another ingestion run is currently in progress.', {
        service: 'crawler',
        event: 'crawler_locked',
      });
      return {
        status: 'LOCKED',
        sourcesProcessed: 0,
        questionsDiscovered: 0,
        questionsAccepted: 0,
        duplicatesSkipped: 0,
        topicsCreated: 0,
        durationMs: 0,
        error: 'Crawler job is currently locked by another instance',
      };
    }

    // 2. Create sync log in database
    let syncLogId: string | null = null;
    try {
      const logEntry = await prisma.crawlerSyncLog.create({
        data: {
          status: 'RUNNING',
          startedAt: new Date(),
        },
      });
      syncLogId = logEntry.id;
    } catch (err: unknown) {
      logger.warn('Could not record initial CrawlerSyncLog entry', { service: 'crawler' }, err);
    }

    let sourcesProcessed = 0;
    let questionsDiscovered = 0;
    let questionsAccepted = 0;
    let duplicatesSkipped = 0;
    let topicsCreated = 0;
    const newlyCreatedTopics: string[] = [];

    try {
      // 3. Ensure all SEED_TOPICS exist in database
      const topicMap = new Map<string, string>(); // slug -> topicId
      for (const t of SEED_TOPICS) {
        let topic = await prisma.ieltsTopic.findUnique({ where: { slug: t.slug } });
        if (!topic) {
          topic = await prisma.ieltsTopic.create({
            data: {
              name: t.name,
              slug: t.slug,
              description: t.description,
              relevance: t.relevance,
              isActive: true,
            },
          });
          topicsCreated++;
          newlyCreatedTopics.push(t.name);
        }
        topicMap.set(t.slug, topic.id);
      }

      // 4. Ingest candidate questions
      const pool: RawCandidateQuestion[] = [
        ...OFFICIAL_2026_EXAM_FORECAST_BANK,
        ...(options?.customSources ?? []),
      ];

      sourcesProcessed = 1; // Verified 2026 Exam Recall Feed
      questionsDiscovered = pool.length;

      for (const item of pool) {
        const text = item.questionText.trim();
        if (!text) continue;

        const bullets = item.cueCardBullets ? item.cueCardBullets.trim() : null;
        const fingerprint = generateQuestionFingerprint(item.part, text, bullets);

        // Check deduplication via unique SHA-256 fingerprint
        const existing = await prisma.ieltsQuestion.findUnique({
          where: { sourceHash: fingerprint },
        });

        if (existing) {
          duplicatesSkipped++;
          continue;
        }

        // Determine matching topic
        let targetSlug = item.suggestedTopicSlug;
        if (!targetSlug || !topicMap.has(targetSlug)) {
          targetSlug = classifyTopic(text, bullets);
        }

        const topicId = topicMap.get(targetSlug) || topicMap.get('daily-life-habits')!;

        // Insert new verified question
        await prisma.ieltsQuestion.create({
          data: {
            topicId,
            part: item.part,
            questionText: text,
            cueCardBullets: bullets,
            questionType: item.questionType || (item.part === 'PART_2' ? 'CUE_CARD' : 'GENERAL'),
            source: item.source || 'OFFICIAL_RECALL',
            sourceUrl: item.sourceUrl || null,
            sourceHash: fingerprint,
            isActive: true,
          },
        });

        questionsAccepted++;
      }

      const durationMs = Date.now() - startTime;

      // 5. Update sync log
      if (syncLogId) {
        await prisma.crawlerSyncLog.update({
          where: { id: syncLogId },
          data: {
            status: 'SUCCESS',
            sourcesProcessed,
            questionsDiscovered,
            questionsAccepted,
            duplicatesSkipped,
            topicsCreated,
            durationMs,
            completedAt: new Date(),
          },
        });
      }

      logger.info('Crawler ingestion run completed successfully', {
        service: 'crawler',
        event: 'ingestion_success',
        sourcesProcessed,
        questionsDiscovered,
        questionsAccepted,
        duplicatesSkipped,
        topicsCreated,
        durationMs,
      });

      // 6. Trigger notification callback if new questions were added
      if (questionsAccepted > 0 && options?.onNewTopics) {
        void options.onNewTopics(questionsAccepted, newlyCreatedTopics).catch(() => undefined);
      }

      return {
        status: 'SUCCESS',
        sourcesProcessed,
        questionsDiscovered,
        questionsAccepted,
        duplicatesSkipped,
        topicsCreated,
        durationMs,
      };
    } catch (err: unknown) {
      const durationMs = Date.now() - startTime;
      const errMsg = err instanceof Error ? err.message : String(err);
      if (syncLogId) {
        await prisma.crawlerSyncLog.update({
          where: { id: syncLogId },
          data: {
            status: 'FAILED',
            errors: errMsg,
            durationMs,
            completedAt: new Date(),
          },
        }).catch(() => undefined);
      }
      logger.error('Crawler ingestion run failed', {
        service: 'crawler',
        event: 'ingestion_failed',
        error: errMsg,
        durationMs,
      }, err);
      return {
        status: 'FAILED',
        sourcesProcessed,
        questionsDiscovered,
        questionsAccepted,
        duplicatesSkipped,
        topicsCreated,
        durationMs,
        error: errMsg,
      };
    } finally {
      // 7. Release crawler lock
      try {
        await redis.del(this.crawlerLockKey);
      } catch {
        // ignore
      }
    }
  }
}

export const questionIngestionService = new QuestionIngestionService();
