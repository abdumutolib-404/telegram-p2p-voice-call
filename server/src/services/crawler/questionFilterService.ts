import { prisma } from '../../config/database';
import { getRedis } from '../../config/redis';
import { logger } from '../../utils/logger';
import {
  classifyTopic,
  evaluateTopicClassification,
  SEED_TOPICS,
  normalizeToCanonicalSlug,
  CanonicalTopicSlug,
} from './taxonomy';
import { isSemanticDuplicate, generateCanonicalSemanticKey } from './semanticMatcher';
import { generateQuestionFingerprint } from './fingerprint';

export interface FilterResult {
  status: 'SUCCESS' | 'FAILED' | 'LOCKED';
  totalReviewed: number;
  reclassifiedCount: number;
  duplicatesPrunedCount: number;
  cleanedCount: number;
  orphansPurgedCount: number;
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
    .replace(/\?\s+and\s+how\?/gi, ', and how?')
    .replace(/\?\s+why\s+or\s+why\s+not\?/gi, '? Why or why not?')
    .replace(/\?\s+and\s+why\?/gi, ', and why?')
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
        orphansPurgedCount: 0,
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
    let orphansPurgedCount = 0;

    try {
      // 2. Canonical Seed Topic Verification & Consolidation: Ensure all 15 canonical seed topics exist
      const canonicalSlugs = new Set(SEED_TOPICS.map((s) => s.slug));
      const topicSlugToId = new Map<string, string>();
      const topicIdToSlug = new Map<string, string>();

      for (const seed of SEED_TOPICS) {
        let topic = await prisma.ieltsTopic.findUnique({ where: { slug: seed.slug } });
        if (!topic) {
          // Check by name to avoid duplicate name unique constraint violations
          topic = await prisma.ieltsTopic.findUnique({ where: { name: seed.name } });
          if (topic) {
            topic = await prisma.ieltsTopic.update({
              where: { id: topic.id },
              data: {
                slug: seed.slug,
                description: seed.description,
                relevance: seed.relevance,
                isActive: true,
              },
            });
          } else {
            topic = await prisma.ieltsTopic.create({
              data: {
                name: seed.name,
                slug: seed.slug,
                description: seed.description,
                relevance: seed.relevance,
                isActive: true,
              },
            });
          }
        }
        topicSlugToId.set(seed.slug, topic.id);
        topicIdToSlug.set(topic.id, seed.slug);
      }

      // Load all database topics to map non-canonical topics for reclassification
      const allTopics = await prisma.ieltsTopic.findMany();
      for (const t of allTopics) {
        if (!topicSlugToId.has(t.slug)) {
          topicSlugToId.set(t.slug, t.id);
        }
        if (!topicIdToSlug.has(t.id)) {
          topicIdToSlug.set(t.id, t.slug);
        }
      }

      // 3. Load all questions to guarantee full consolidation into the 15 canonical families
      const questions = await prisma.ieltsQuestion.findMany({
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
          try {
            await prisma.ieltsQuestion.update({
              where: { id: q.id },
              data: {
                questionText: cleaned,
                sourceHash: generateQuestionFingerprint(q.part, cleaned, q.cueCardBullets),
              },
            });
            cleanedCount++;
            currentText = cleaned;
          } catch (updateErr: any) {
            // Gracefully handle P2002 duplicate collisions when cleaned text matches an existing question
            if (
              updateErr?.code === 'P2002' ||
              String(updateErr?.message).includes('sourceHash') ||
              String(updateErr?.message).includes('Unique constraint failed')
            ) {
              logger.info('Pass A duplicate collision on cleaned question, gracefully removing duplicate', {
                service: 'crawler_filter',
                questionId: q.id,
                duplicateHash: generateQuestionFingerprint(q.part, cleaned, q.cueCardBullets),
              });
              await prisma.ieltsQuestion.delete({ where: { id: q.id } }).catch(() => undefined);
              duplicatesPrunedCount++;
              continue;
            } else {
              throw updateErr;
            }
          }
        }

        // --- PASS B: Re-classify Question into the 15 Canonical Families ---
        const currentTopicSlug = topicIdToSlug.get(q.topicId);
        // Evaluate the question text itself without biasing with currentTopicSlug
        const decision = evaluateTopicClassification(currentText, q.cueCardBullets);
        let targetCanonicalSlug: CanonicalTopicSlug;

        if (decision.score > 0) {
          // Question text matched keywords of a canonical topic family
          targetCanonicalSlug = normalizeToCanonicalSlug(decision.slug);
        } else if (currentTopicSlug) {
          // Question text had 0 keyword matches; retain or map from existing database topic if possible
          targetCanonicalSlug = normalizeToCanonicalSlug(currentTopicSlug);
        } else {
          targetCanonicalSlug = 'leisure-habits-daily';
        }

        const targetTopicId = topicSlugToId.get(targetCanonicalSlug);
        let activeTopicId = q.topicId;

        if (
          targetTopicId &&
          (q.topicId !== targetTopicId || (currentTopicSlug && !canonicalSlugs.has(currentTopicSlug)))
        ) {
          await prisma.ieltsQuestion.update({
            where: { id: q.id },
            data: { topicId: targetTopicId },
          });

          reclassifiedCount++;
          activeTopicId = targetTopicId;
          logger.info('Question re-classified to canonical IELTS topic family', {
            service: 'crawler_filter',
            question: currentText,
            from: currentTopicSlug,
            to: targetCanonicalSlug,
          });
        }

        // --- PASS C: Semantic Paraphrase & Duplicate Pruning (Active Questions Only) ---
        if (q.isActive) {
          const groupKey = `${activeTopicId}_${q.part}`;
          if (!topicPartBuckets.has(groupKey)) {
            topicPartBuckets.set(groupKey, []);
          }

          const bucket = topicPartBuckets.get(groupKey)!;
          const semanticCheck = isSemanticDuplicate(currentText, bucket, 0.75);

          if (semanticCheck.isDuplicate) {
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
      }

      // --- PASS D: Orphan Purge Routine ---
      // Deletes any orphan IeltsTopic records that have 0 questions and are not in the 15 canonical families.
      const nonCanonicalTopics = await prisma.ieltsTopic.findMany({
        where: {
          slug: { notIn: Array.from(canonicalSlugs) },
        },
        include: {
          _count: {
            select: { questions: true },
          },
        },
      });

      for (const t of nonCanonicalTopics) {
        const questionCount =
          t._count?.questions ?? (await prisma.ieltsQuestion.count({ where: { topicId: t.id } }));
        if (questionCount === 0) {
          await prisma.ieltsTopic.delete({ where: { id: t.id } });
          orphansPurgedCount++;
          logger.info('Purged orphan non-canonical IELTS topic record', {
            service: 'crawler_filter',
            topicId: t.id,
            name: t.name,
            slug: t.slug,
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

      logger.info('Daily Question Filter completed successfully with topic consolidation & orphan purge', {
        service: 'crawler_filter',
        totalReviewed,
        reclassifiedCount,
        duplicatesPrunedCount,
        cleanedCount,
        orphansPurgedCount,
        durationMs,
      });

      return {
        status: 'SUCCESS',
        totalReviewed,
        reclassifiedCount,
        duplicatesPrunedCount,
        cleanedCount,
        orphansPurgedCount,
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
        orphansPurgedCount,
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
