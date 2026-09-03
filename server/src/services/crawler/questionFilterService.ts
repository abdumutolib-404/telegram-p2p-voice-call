import { prisma } from '../../config/database';
import { getRedis } from '../../config/redis';
import { logger } from '../../utils/logger';
import { classifyTopic, SEED_TOPICS } from './taxonomy';
import { isSemanticDuplicate, generateCanonicalSemanticKey } from './semanticMatcher';
import { generateQuestionFingerprint } from './fingerprint';

export interface FilterResult {
  status: 'SUCCESS' | 'FAILED' | 'LOCKED';
  totalReviewed: number;
  reclassifiedCount: number;
  duplicatesPrunedCount: number;
  cleanedCount: number;
  durationMs: number;
  error?: string;
}

function cleanTextArtifacts(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/&rdquo;/g, '"')
    .replace(/&ldquo;/g, '"')
    .replace(/&ndash;/g, '-')
    .replace(/&mdash;/g, '--')
    .replace(/^[•\-\d.]+\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export class QuestionFilterService {
  private readonly filterLockKey = 'pairtalk:crawler:filter_lock';
  private readonly lockTtlMs = 45000; // 45 seconds

  public async runFilterCycle(options?: { force?: boolean }): Promise<FilterResult> {
    const startTime = Date.now();
    const redis = getRedis();

    // 1. Acquire distributed lock
    let hasLock = false;
    try {
      const lockRes = await redis.set(this.filterLockKey, String(process.pid), 'PX', this.lockTtlMs, 'NX');
      hasLock = lockRes === 'OK';
    } catch {
      hasLock = true;
    }

    if (!hasLock && !options?.force) {
      logger.warn('Daily Question Filter skipped: another filter cycle is currently running.', {
        service: 'crawler_filter',
      });
      return {
        status: 'LOCKED',
        totalReviewed: 0,
        reclassifiedCount: 0,
        duplicatesPrunedCount: 0,
        cleanedCount: 0,
        durationMs: 0,
        error: 'Filter job is locked by another instance',
      };
    }

    // Record initial sync log
    let syncLogId: string | null = null;
    try {
      const log = await prisma.crawlerSyncLog.create({
        data: {
          status: 'RUNNING',
          startedAt: new Date(),
        },
      });
      syncLogId = log.id;
    } catch {
      // ignore
    }

    let totalReviewed = 0;
    let reclassifiedCount = 0;
    let duplicatesPrunedCount = 0;
    let cleanedCount = 0;

    try {
      // 2. Load topics map
      const allTopics = await prisma.ieltsTopic.findMany();
      const topicSlugToId = new Map<string, string>();
      const topicIdToSlug = new Map<string, string>();
      for (const t of allTopics) {
        topicSlugToId.set(t.slug, t.id);
        topicIdToSlug.set(t.id, t.slug);
      }

      // 3. Load all active questions
      const questions = await prisma.ieltsQuestion.findMany({
        where: { isActive: true },
        orderBy: { createdAt: 'asc' },
      });

      totalReviewed = questions.length;

      // In-memory buckets for duplicate detection: groupKey = topicId_part
      const topicPartBuckets = new Map<string, Array<{ id: string; questionText: string; canonicalKey: string }>>();

      for (const q of questions) {
        // --- PASS A: Clean Formatting & HTML Entities ---
        const cleaned = cleanTextArtifacts(q.questionText);
        let currentText = q.questionText;
        if (cleaned && cleaned !== q.questionText && cleaned.length >= 10) {
          await prisma.ieltsQuestion.update({
            where: { id: q.id },
            data: {
              questionText: cleaned,
              sourceHash: generateQuestionFingerprint(q.part, cleaned, q.cueCardBullets),
            },
          });
          cleanedCount++;
          currentText = cleaned;
        }

        // --- PASS B: Re-classify Topic ---
        const bestSlug = classifyTopic(currentText, q.cueCardBullets);
        let currentTopicSlug = topicIdToSlug.get(q.topicId);
        let activeTopicId = q.topicId;

        if (bestSlug && currentTopicSlug && bestSlug !== currentTopicSlug) {
          let targetTopicId = topicSlugToId.get(bestSlug);
          if (!targetTopicId) {
            // Create topic if missing
            const seed = SEED_TOPICS.find((s) => s.slug === bestSlug);
            const created = await prisma.ieltsTopic.create({
              data: {
                name: seed ? seed.name : bestSlug,
                slug: bestSlug,
                description: seed ? seed.description : null,
                relevance: seed ? seed.relevance : 7,
                isActive: true,
              },
            });
            targetTopicId = created.id;
            topicSlugToId.set(bestSlug, targetTopicId);
            topicIdToSlug.set(targetTopicId, bestSlug);
          }

          await prisma.ieltsQuestion.update({
            where: { id: q.id },
            data: { topicId: targetTopicId },
          });

          reclassifiedCount++;
          activeTopicId = targetTopicId;
          currentTopicSlug = bestSlug;
          logger.info('Question re-classified to correct domain', {
            service: 'crawler_filter',
            question: currentText,
            from: topicIdToSlug.get(q.topicId),
            to: bestSlug,
          });
        }

        // --- PASS C: Semantic Paraphrase & Duplicate Pruning ---
        const groupKey = `${activeTopicId}_${q.part}`;
        if (!topicPartBuckets.has(groupKey)) {
          topicPartBuckets.set(groupKey, []);
        }

        const bucket = topicPartBuckets.get(groupKey)!;
        const semanticCheck = isSemanticDuplicate(currentText, bucket, 0.75);

        if (semanticCheck.isDuplicate) {
          // Prune duplicate from active bank
          await prisma.ieltsQuestion.delete({ where: { id: q.id } });
          duplicatesPrunedCount++;
          logger.info('Pruned semantic duplicate IELTS question', {
            service: 'crawler_filter',
            deletedQuestion: currentText,
            matchedOriginal: semanticCheck.matchedQuestion,
            score: semanticCheck.score,
          });
        } else {
          bucket.push({
            id: q.id,
            questionText: currentText,
            canonicalKey: generateCanonicalSemanticKey(currentText),
          });
        }
      }

      const durationMs = Date.now() - startTime;

      if (syncLogId) {
        await prisma.crawlerSyncLog.update({
          where: { id: syncLogId },
          data: {
            status: 'SUCCESS',
            sourcesProcessed: 1,
            questionsDiscovered: totalReviewed,
            questionsAccepted: reclassifiedCount,
            duplicatesSkipped: duplicatesPrunedCount,
            topicsCreated: 0,
            durationMs,
            completedAt: new Date(),
          },
        }).catch(() => undefined);
      }

      logger.info('Daily Question Filter completed successfully', {
        service: 'crawler_filter',
        totalReviewed,
        reclassifiedCount,
        duplicatesPrunedCount,
        cleanedCount,
        durationMs,
      });

      return {
        status: 'SUCCESS',
        totalReviewed,
        reclassifiedCount,
        duplicatesPrunedCount,
        cleanedCount,
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

      logger.error('Daily Question Filter cycle failed', { service: 'crawler_filter' }, error);

      return {
        status: 'FAILED',
        totalReviewed,
        reclassifiedCount,
        duplicatesPrunedCount,
        cleanedCount,
        durationMs,
        error: errMsg,
      };
    } finally {
      try {
        await redis.del(this.filterLockKey);
      } catch {
        // ignore
      }
    }
  }
}

export const questionFilterService = new QuestionFilterService();
