import { prisma } from '../../config/database';
import { getRedis } from '../../config/redis';
import { logger } from '../../utils/logger';
import { generateQuestionFingerprint } from './fingerprint';
import { SEED_TOPICS, classifyTopic, evaluateTopicClassification, formatCapitalizedTopicName } from './taxonomy';
import { OFFICIAL_2026_EXAM_FORECAST_BANK, RawCandidateQuestion, VERIFIED_CRAWLER_TARGETS } from './sources';
import { webCrawlerService } from './webCrawlerService';
import { generateCanonicalSemanticKey, isSemanticDuplicate } from './semanticMatcher';

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
    customUrl?: string;
    deepCrawl?: boolean;
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

      // Also load any custom topics already created by admin
      const allDbTopics = await prisma.ieltsTopic.findMany({ select: { id: true, slug: true } });
      for (const t of allDbTopics) {
        topicMap.set(t.slug, t.id);
      }

      // 4. Pre-cache existing questions for semantic deduplication (grouped by topicId_part)
      const existingDbQuestions = await prisma.ieltsQuestion.findMany({
        select: { id: true, topicId: true, part: true, questionText: true },
      });

      const semanticBankMap = new Map<string, Array<{ questionText: string; canonicalKey: string }>>();
      for (const q of existingDbQuestions) {
        const groupKey = `${q.topicId}_${q.part}`;
        if (!semanticBankMap.has(groupKey)) {
          semanticBankMap.set(groupKey, []);
        }
        semanticBankMap.get(groupKey)!.push({
          questionText: q.questionText,
          canonicalKey: generateCanonicalSemanticKey(q.questionText),
        });
      }

      // 5. Ingest questions from:
      // a) Verified 2026 Forecast Bank (120+ authentic questions)
      // b) Custom URL crawl if requested
      // c) Deep web crawl if requested
      // d) Custom source payload
      const candidateQuestions: RawCandidateQuestion[] = [
        ...OFFICIAL_2026_EXAM_FORECAST_BANK,
        ...(options?.customSources ?? []),
      ];
      sourcesProcessed++; // 1 for the official forecast feed

      // Custom URL Crawl on-demand
      if (options?.customUrl && options.customUrl.startsWith('http')) {
        try {
          const crawledFromUrl = await webCrawlerService.fetchAndExtractUrl(options.customUrl);
          candidateQuestions.push(...crawledFromUrl);
          sourcesProcessed++;
        } catch (err) {
          logger.warn('Custom URL crawl encountered error', { service: 'crawler', url: options.customUrl }, err);
        }
      }

      // Deep Crawl configured sources if flag set
      if (options?.deepCrawl) {
        try {
          const crawledFromWeb = await webCrawlerService.crawlAllConfiguredSources();
          candidateQuestions.push(...crawledFromWeb);
          sourcesProcessed += VERIFIED_CRAWLER_TARGETS.filter(t => t.enabled).length;
        } catch (err) {
          logger.warn('Deep web crawl encountered error', { service: 'crawler' }, err);
        }
      }

      questionsDiscovered = candidateQuestions.length;

      for (const item of candidateQuestions) {
        const text = item.questionText.trim();
        if (!text || text.length < 10) continue;

        const bullets = item.cueCardBullets ? item.cueCardBullets.trim() : null;
        const fingerprint = generateQuestionFingerprint(item.part, text, bullets);

        // Check Layer 1: Exact SHA-256 fingerprint
        const existing = await prisma.ieltsQuestion.findUnique({
          where: { sourceHash: fingerprint },
        });

        if (existing) {
          duplicatesSkipped++;
          continue;
        }

        // Determine matching topic with dynamic emergence
        const classification = evaluateTopicClassification(text, bullets, item.extractedTopicName);

        let targetSlug: string;
        if (item.source === 'IELTS_2026_EXAM_FORECAST' && item.suggestedTopicSlug && item.suggestedTopicSlug !== 'daily-life-habits') {
          targetSlug = item.suggestedTopicSlug;
        } else if (classification.isEmergent && classification.emergentTopic) {
          targetSlug = classification.emergentTopic.slug;
        } else if (classification.score >= 3) {
          targetSlug = classification.slug;
        } else if (item.suggestedTopicSlug && item.suggestedTopicSlug !== 'daily-life-habits') {
          targetSlug = item.suggestedTopicSlug;
        } else {
          targetSlug = classification.slug;
        }

        let topicId = topicMap.get(targetSlug);
        if (!topicId) {
          // Dynamically create a new IeltsTopic in PostgreSQL
          const emergent = classification.emergentTopic;
          const topicName = emergent ? emergent.name : formatCapitalizedTopicName(targetSlug);
          const topicSlug = emergent ? emergent.slug : targetSlug;
          const topicDescription = emergent
            ? emergent.description
            : `IELTS speaking practice questions and discussion regarding ${topicName}.`;
          const topicRelevance = emergent ? emergent.relevance : 6;

          try {
            let dbTopic =
              (await prisma.ieltsTopic.findUnique({ where: { slug: topicSlug } })) ||
              (await prisma.ieltsTopic.findUnique({ where: { name: topicName } }));

            if (!dbTopic) {
              dbTopic = await prisma.ieltsTopic.create({
                data: {
                  name: topicName,
                  slug: topicSlug,
                  description: topicDescription,
                  relevance: topicRelevance,
                  isActive: true,
                },
              });
              topicsCreated++;
              newlyCreatedTopics.push(dbTopic.name);
              logger.info('Dynamically created emergent IELTS topic in PostgreSQL', {
                service: 'crawler',
                name: dbTopic.name,
                slug: dbTopic.slug,
              });
            }

            topicId = dbTopic.id;
            topicMap.set(dbTopic.slug, topicId);
            topicMap.set(targetSlug, topicId);
          } catch (err: unknown) {
            logger.warn('Failed creating dynamic IELTS topic, falling back', {
              service: 'crawler',
              slug: targetSlug,
              error: err instanceof Error ? err.message : String(err),
            });
            topicId = topicMap.get('daily-life-habits')!;
          }
        }

        // Check Layer 2 & 3: Semantic Paraphrase Deduplication against same topic & part
        const groupKey = `${topicId}_${item.part}`;
        const groupQuestions = semanticBankMap.get(groupKey) || [];

        const semanticCheck = isSemanticDuplicate(text, groupQuestions, 0.75);
        if (semanticCheck.isDuplicate) {
          duplicatesSkipped++;
          logger.info('Skipping semantic paraphrase duplicate question', {
            service: 'crawler',
            candidate: text,
            matchedWith: semanticCheck.matchedQuestion,
            similarityScore: semanticCheck.score,
          });
          continue;
        }

        // Insert new verified question into DB
        await prisma.ieltsQuestion.create({
          data: {
            topicId,
            part: item.part,
            questionText: text,
            cueCardBullets: bullets,
            questionType: item.questionType || (item.part === 'PART_2' ? 'CUE_CARD' : 'GENERAL'),
            source: item.source || 'WEB_CRAWLER',
            sourceUrl: item.sourceUrl || null,
            sourceHash: fingerprint,
            isActive: true,
          },
        });

        // Add to in-memory semantic cache for subsequent checks in this run
        if (!semanticBankMap.has(groupKey)) {
          semanticBankMap.set(groupKey, []);
        }
        semanticBankMap.get(groupKey)!.push({
          questionText: text,
          canonicalKey: generateCanonicalSemanticKey(text),
        });

        questionsAccepted++;
      }

      const durationMs = Date.now() - startTime;

      // 6. Update sync log to SUCCESS
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
        }).catch(() => undefined);
      }

      // 7. Notify admin or telegram subscribers if new topics emerged
      if (topicsCreated > 0 && options?.onNewTopics) {
        await options.onNewTopics(topicsCreated, newlyCreatedTopics).catch(() => undefined);
      }

      logger.info('Question ingestion cycle completed successfully with semantic deduplication', {
        service: 'crawler',
        event: 'crawler_sync_success',
        durationMs,
        questionsAccepted,
        duplicatesSkipped,
        topicsCreated,
      });

      return {
        status: 'SUCCESS',
        sourcesProcessed,
        questionsDiscovered,
        questionsAccepted,
        duplicatesSkipped,
        topicsCreated,
        durationMs,
      };
    } catch (error: any) {
      const durationMs = Date.now() - startTime;
      const errMsg = error?.message || String(error);

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

      logger.error('Question ingestion cycle failed', {
        service: 'crawler',
        event: 'crawler_sync_failed',
      }, error);

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
      // Release distributed lock
      try {
        await redis.del(this.crawlerLockKey);
      } catch {
        // ignore
      }
    }
  }
}

export const questionIngestionService = new QuestionIngestionService();
