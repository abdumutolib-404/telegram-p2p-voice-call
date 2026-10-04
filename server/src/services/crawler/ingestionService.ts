import { prisma } from '../../config/database';
import { CrawlerLease } from './lease';
import { logger } from '../../utils/logger';
import { generateQuestionFingerprint } from './fingerprint';
import { SEED_TOPICS, classifyTopic, evaluateTopicClassification, formatCapitalizedTopicName, normalizeToCanonicalSlug } from './taxonomy';
import { OFFICIAL_2026_EXAM_FORECAST_BANK, RawCandidateQuestion, VERIFIED_CRAWLER_TARGETS } from './sources';
import { webCrawlerService } from './webCrawlerService';
import { generateCanonicalSemanticKey, isSemanticDuplicate } from './semanticMatcher';
import { aiCurationService } from './aiCurationService';
import { IeltsPart } from '@prisma/client';

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

  public async runIngestion(options?: {
    customSources?: RawCandidateQuestion[];
    customUrl?: string;
    deepCrawl?: boolean;
    force?: boolean;
    onNewTopics?: (newCount: number, topics: string[]) => Promise<void>;
  }): Promise<IngestionResult> {
    const startTime = Date.now();
    const lease = new CrawlerLease();

    // A manual force request still respects active distributed ownership.
    if (!await lease.acquire()) {
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
      // 3. Ensure all 15 Canonical Cambridge IELTS Topic Families exist in database
      const topicMap = new Map<string, string>(); // slug -> topicId
      for (const t of SEED_TOPICS) {
        await lease.assertOwned();
        let topic = await prisma.ieltsTopic.findUnique({ where: { slug: t.slug } });
        if (!topic) {
          // Guard against name uniqueness collision if legacy record has same name
          topic = await prisma.ieltsTopic.findUnique({ where: { name: t.name } });
          if (topic) {
            await lease.assertOwned();
            topic = await prisma.ieltsTopic.update({
              where: { id: topic.id },
              data: {
                slug: t.slug,
                description: t.description,
                relevance: t.relevance,
                isActive: true,
              },
            });
          } else {
            await lease.assertOwned();
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
        }
        topicMap.set(t.slug, topic.id);
      }

      // Also load any existing custom topics already created in DB
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
          await lease.assertOwned();
          const crawledFromUrl = await webCrawlerService.fetchAndExtractUrl(options.customUrl);
          await lease.assertOwned();
          candidateQuestions.push(...crawledFromUrl);
          sourcesProcessed++;
        } catch (err) {
          logger.warn('Custom URL crawl encountered error', { service: 'crawler', url: options.customUrl }, err);
        }
      }

      // Deep Crawl configured sources if flag set
      if (options?.deepCrawl) {
        try {
          await lease.assertOwned();
          const crawledFromWeb = await webCrawlerService.crawlAllConfiguredSources();
          await lease.assertOwned();
          candidateQuestions.push(...crawledFromWeb);
          sourcesProcessed += VERIFIED_CRAWLER_TARGETS.filter(t => t.enabled).length;
        } catch (err) {
          logger.warn('Deep web crawl encountered error', { service: 'crawler' }, err);
        }
      }

      questionsDiscovered = candidateQuestions.length;

      // Pass raw candidate batches through aiCurationService.curateQuestionBatch
      const curationInputs = candidateQuestions.map((item) => {
        let bullets: string[] | undefined;
        if (item.cueCardBullets) {
          try {
            const parsed = JSON.parse(item.cueCardBullets);
            if (Array.isArray(parsed)) {
              bullets = parsed;
            }
          } catch {
            bullets = [item.cueCardBullets];
          }
        }
        return {
          text: item.questionText,
          bullets,
          contextTopic: item.extractedTopicName,
        };
      });

      await lease.assertOwned();
      const curatedResults = await aiCurationService.curateQuestionBatch(curationInputs);
      await lease.assertOwned();

      for (let i = 0; i < candidateQuestions.length; i++) {
        await lease.assertOwned();
        const item = candidateQuestions[i];
        const curated = curatedResults[i];

        // Drop rejected candidates with structured logger info
        if (curated && !curated.isValidIeltsSpeaking) {
          logger.info('Dropped invalid candidate question during AI curation', {
            service: 'crawler',
            candidate: item.questionText,
            rejectionReason: curated.rejectionReason,
          });
          continue;
        }

        const text = (curated?.cleanedText || item.questionText).trim();
        if (!text || text.length < 10) continue;

        const bullets = item.cueCardBullets ? item.cueCardBullets.trim() : null;
        const part = (curated?.part || item.part) as IeltsPart;
        const fingerprint = generateQuestionFingerprint(part, text, bullets);

        // Determine matching topic aligned with the 15 Canonical Cambridge IELTS Families
        let targetSlug: string;
        if (item.source === 'IELTS_2026_EXAM_FORECAST' && item.suggestedTopicSlug) {
          targetSlug = normalizeToCanonicalSlug(item.suggestedTopicSlug);
        } else if (curated?.canonicalTopicSlug) {
          targetSlug = normalizeToCanonicalSlug(curated.canonicalTopicSlug);
        } else {
          const classification = evaluateTopicClassification(text, bullets, item.extractedTopicName);
          targetSlug = normalizeToCanonicalSlug(
            classification.score > 0 ? classification.slug : item.suggestedTopicSlug || classification.slug,
          );
        }

        let topicId = topicMap.get(targetSlug);
        if (!topicId) {
          // Guaranteed to be one of SEED_TOPICS
          const seed =
            SEED_TOPICS.find((s) => s.slug === targetSlug) ||
            SEED_TOPICS.find((s) => s.slug === 'leisure-habits-daily')!;
          let dbTopic = await prisma.ieltsTopic.findUnique({ where: { slug: seed.slug } });
          if (!dbTopic) {
            await lease.assertOwned();
            dbTopic = await prisma.ieltsTopic.create({
              data: {
                name: seed.name,
                slug: seed.slug,
                description: seed.description,
                relevance: seed.relevance,
                isActive: true,
              },
            });
            topicsCreated++;
            newlyCreatedTopics.push(dbTopic.name);
          }
          topicId = dbTopic.id;
          topicMap.set(seed.slug, topicId);
        }

        // Check Layer 1: Exact SHA-256 fingerprint
        const existing = await prisma.ieltsQuestion.findUnique({
          where: { sourceHash: fingerprint },
        });

        if (existing) {
          if (existing.topicId !== topicId || !existing.isActive || existing.part !== part) {
            await lease.assertOwned();
            await prisma.ieltsQuestion.update({
              where: { id: existing.id },
              data: {
                topicId,
                part,
                isActive: true,
                questionType: item.questionType || (part === 'PART_2' ? 'CUE_CARD' : 'GENERAL'),
              },
            });
            questionsAccepted++;
          } else {
            duplicatesSkipped++;
          }
          continue;
        }

        // Check Layer 2 & 3: Semantic Paraphrase Deduplication against same topic & part
        const groupKey = `${topicId}_${part}`;
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

        // Upsert accepted candidates into their respective canonical topic family with clean text and verified Part
        await prisma.ieltsQuestion.upsert({
          where: { sourceHash: fingerprint },
          update: {
            topicId,
            part,
            questionText: text,
            cueCardBullets: bullets,
            questionType: item.questionType || (part === 'PART_2' ? 'CUE_CARD' : 'GENERAL'),
            isActive: true,
          },
          create: {
            topicId,
            part,
            questionText: text,
            cueCardBullets: bullets,
            questionType: item.questionType || (part === 'PART_2' ? 'CUE_CARD' : 'GENERAL'),
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
      await lease.release();
    }
  }
}

export const questionIngestionService = new QuestionIngestionService();
