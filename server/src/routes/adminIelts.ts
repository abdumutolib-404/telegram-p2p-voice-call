import { Router, type Response } from 'express';
import type { AdminAuthenticatedRequest } from '../middleware/adminAuth';
import { prisma } from '../config/database';
import { IeltsPart } from '@prisma/client';
import { generateQuestionFingerprint } from '../services/crawler/fingerprint';
import { questionIngestionService } from '../services/crawler/ingestionService';
import { questionFilterService } from '../services/crawler/questionFilterService';
import { aiCurationService } from '../services/crawler/aiCurationService';
import { topicNotificationService } from '../services/topicNotificationService';
import { webCrawlerService } from '../services/crawler/webCrawlerService';
import { getAdminBot } from './admin';
import { logger } from '../utils/logger';
import { escapeCsvField as escapeCsv } from '../utils/csv';

const router = Router();

// --- TOPICS ---
// GET /api/admin/ielts/topics
router.get('/topics', async (_req: AdminAuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const topics = await prisma.ieltsTopic.findMany({
      orderBy: { relevance: 'desc' },
      include: {
        _count: {
          select: { questions: true },
        },
      },
    });
    res.json({ success: true, topics });
  } catch (err: unknown) {
    logger.error('Admin fetch topics failed', { service: 'admin_ielts' }, err);
    res.status(500).json({ error: 'Internal server error fetching topics' });
  }
});

// POST /api/admin/ielts/topics
router.post('/topics', async (req: AdminAuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { name, slug, description, relevance } = req.body;
    if (!name || !slug) {
      res.status(400).json({ error: 'Name and slug are required' });
      return;
    }

    const cleanSlug = String(slug).toLowerCase().trim().replace(/[^a-z0-9-]/g, '-');
    const existing = await prisma.ieltsTopic.findUnique({ where: { slug: cleanSlug } });
    if (existing) {
      res.status(409).json({ error: 'Topic slug already exists' });
      return;
    }

    const topic = await prisma.ieltsTopic.create({
      data: {
        name: String(name).trim(),
        slug: cleanSlug,
        description: description ? String(description).trim() : null,
        relevance: Number(relevance) || 5,
        isActive: true,
      },
    });

    res.status(201).json({ success: true, topic });
  } catch (err: unknown) {
    logger.error('Admin create topic failed', { service: 'admin_ielts' }, err);
    res.status(500).json({ error: 'Internal server error creating topic' });
  }
});

// PATCH /api/admin/ielts/topics/:id
router.patch('/topics/:id', async (req: AdminAuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, description, relevance, isActive } = req.body;

    const existing = await prisma.ieltsTopic.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: 'Topic not found' });
      return;
    }

    const data: any = {};
    if (name !== undefined) data.name = String(name).trim();
    if (description !== undefined) data.description = String(description).trim();
    if (relevance !== undefined) data.relevance = Number(relevance);
    if (isActive !== undefined) data.isActive = Boolean(isActive);

    const updated = await prisma.ieltsTopic.update({
      where: { id },
      data,
    });

    res.json({ success: true, topic: updated });
  } catch (err: unknown) {
    logger.error('Admin update topic failed', { service: 'admin_ielts' }, err);
    res.status(500).json({ error: 'Internal server error updating topic' });
  }
});

// DELETE /api/admin/ielts/topics/:id
router.delete('/topics/:id', async (req: AdminAuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const existing = await prisma.ieltsTopic.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: 'Topic not found' });
      return;
    }

    await prisma.ieltsTopic.delete({ where: { id } });
    res.json({ success: true, message: 'Topic deleted successfully' });
  } catch (err: unknown) {
    logger.error('Admin delete topic failed', { service: 'admin_ielts' }, err);
    res.status(500).json({ error: 'Internal server error deleting topic' });
  }
});

// --- QUESTIONS ---
// GET /api/admin/ielts/questions
router.get('/questions', async (req: AdminAuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { part, topicId, isActive, search, limit = '50', page = '1' } = req.query;
    const parsedLimit = Math.min(100, Math.max(1, parseInt(String(limit), 10) || 50));
    const parsedPage = Math.max(1, parseInt(String(page), 10) || 1);
    const skip = (parsedPage - 1) * parsedLimit;

    const where: any = {};
    if (part && ['PART_1', 'PART_2', 'PART_3'].includes(String(part).toUpperCase())) {
      where.part = String(part).toUpperCase() as IeltsPart;
    }
    if (topicId && typeof topicId === 'string' && topicId !== 'all') {
      where.topicId = topicId;
    }
    if (isActive !== undefined && isActive !== 'all') {
      where.isActive = isActive === 'true';
    }
    if (search && typeof search === 'string' && search.trim().length > 0) {
      where.questionText = { contains: search.trim() };
    }

    const [questions, total] = await Promise.all([
      prisma.ieltsQuestion.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: parsedLimit,
        include: { topic: true },
      }),
      prisma.ieltsQuestion.count({ where }),
    ]);

    res.json({
      success: true,
      questions,
      pagination: {
        page: parsedPage,
        limit: parsedLimit,
        total,
        totalPages: Math.ceil(total / parsedLimit),
      },
    });
  } catch (err: unknown) {
    logger.error('Admin fetch questions failed', { service: 'admin_ielts' }, err);
    res.status(500).json({ error: 'Internal server error fetching questions' });
  }
});

// POST /api/admin/ielts/questions
router.post('/questions', async (req: AdminAuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { topicId, part, questionText, cueCardBullets, questionType, source } = req.body;
    if (!topicId || !part || !questionText) {
      res.status(400).json({ error: 'topicId, part, and questionText are required' });
      return;
    }

    const validParts: IeltsPart[] = ['PART_1', 'PART_2', 'PART_3'];
    if (!validParts.includes(part)) {
      res.status(400).json({ error: 'Invalid part' });
      return;
    }

    const bullets = cueCardBullets ? String(cueCardBullets).trim() : null;
    const fingerprint = generateQuestionFingerprint(part, String(questionText).trim(), bullets);

    const existing = await prisma.ieltsQuestion.findUnique({ where: { sourceHash: fingerprint } });
    if (existing) {
      res.status(409).json({ error: 'Duplicate question already exists' });
      return;
    }

    const question = await prisma.ieltsQuestion.create({
      data: {
        topicId,
        part,
        questionText: String(questionText).trim(),
        cueCardBullets: bullets,
        questionType: questionType || (part === 'PART_2' ? 'CUE_CARD' : 'GENERAL'),
        source: source || 'ADMIN_MANUAL',
        sourceHash: fingerprint,
        isActive: true,
      },
      include: { topic: true },
    });

    res.status(201).json({ success: true, question });
  } catch (err: unknown) {
    logger.error('Admin create question failed', { service: 'admin_ielts' }, err);
    res.status(500).json({ error: 'Internal server error creating question' });
  }
});

// PATCH /api/admin/ielts/questions/:id
router.patch('/questions/:id', async (req: AdminAuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { questionText, cueCardBullets, topicId, part, isActive } = req.body;

    const existing = await prisma.ieltsQuestion.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: 'Question not found' });
      return;
    }

    const data: any = {};
    if (topicId !== undefined) data.topicId = topicId;
    if (part !== undefined) data.part = part;
    if (isActive !== undefined) data.isActive = Boolean(isActive);
    if (questionText !== undefined) data.questionText = String(questionText).trim();
    if (cueCardBullets !== undefined) data.cueCardBullets = cueCardBullets ? String(cueCardBullets).trim() : null;

    if (questionText || cueCardBullets || part) {
      const p = data.part || existing.part;
      const t = data.questionText || existing.questionText;
      const b = data.cueCardBullets !== undefined ? data.cueCardBullets : existing.cueCardBullets;
      data.sourceHash = generateQuestionFingerprint(p, t, b);
    }

    const updated = await prisma.ieltsQuestion.update({
      where: { id },
      data,
      include: { topic: true },
    });

    res.json({ success: true, question: updated });
  } catch (err: unknown) {
    logger.error('Admin update question failed', { service: 'admin_ielts' }, err);
    res.status(500).json({ error: 'Internal server error updating question' });
  }
});

// DELETE /api/admin/ielts/questions/:id
router.delete('/questions/:id', async (req: AdminAuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const existing = await prisma.ieltsQuestion.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: 'Question not found' });
      return;
    }

    await prisma.ieltsQuestion.delete({ where: { id } });
    res.json({ success: true, message: 'Question deleted successfully' });
  } catch (err: unknown) {
    logger.error('Admin delete question failed', { service: 'admin_ielts' }, err);
    res.status(500).json({ error: 'Internal server error deleting question' });
  }
});

// GET /api/admin/ielts/questions/export
router.get('/questions/export', async (req: AdminAuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { topicId, part, format = 'json' } = req.query;
    const where: any = { isActive: true };

    if (part && ['PART_1', 'PART_2', 'PART_3'].includes(String(part).toUpperCase())) {
      where.part = String(part).toUpperCase() as IeltsPart;
    }

    if (topicId && typeof topicId === 'string' && topicId !== 'all') {
      where.OR = [{ topicId }, { topic: { slug: topicId } }];
    }

    const questions = await prisma.ieltsQuestion.findMany({
      where,
      orderBy: [{ topic: { name: 'asc' } }, { part: 'asc' }, { createdAt: 'desc' }],
      include: { topic: true },
    });

    const isCsv = String(format).toLowerCase() === 'csv';
    const timestamp = new Date().toISOString().slice(0, 10);
    const filenameTopic = topicId ? String(topicId).replace(/[^a-z0-9_-]/gi, '_') : 'all';

    if (isCsv) {
      const headers = [
        'ID',
        'Part',
        'Topic Name',
        'Topic Slug',
        'Question Text',
        'Cue Card Bullets',
        'Question Type',
        'Source',
        'Created At',
      ];

      const rows = questions.map((q) => [
        escapeCsv(q.id),
        escapeCsv(q.part),
        escapeCsv(q.topic?.name ?? ''),
        escapeCsv(q.topic?.slug ?? ''),
        escapeCsv(q.questionText),
        escapeCsv(q.cueCardBullets ?? ''),
        escapeCsv(q.questionType),
        escapeCsv(q.source),
        escapeCsv(q.createdAt.toISOString()),
      ]);

      const csvData = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="ielts_questions_${filenameTopic}_${timestamp}.csv"`);
      res.send(csvData);
      return;
    }

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="ielts_questions_${filenameTopic}_${timestamp}.json"`);
    res.json({
      success: true,
      total: questions.length,
      exportedAt: new Date().toISOString(),
      filter: { topicId: topicId || 'all', part: part || 'all' },
      questions,
    });
  } catch (err: unknown) {
    logger.error('Admin export questions failed', { service: 'admin_ielts' }, err);
    res.status(500).json({ error: 'Internal server error exporting questions' });
  }
});

// --- BULK QUESTIONS IMPORT ---
// POST /api/admin/ielts/questions/bulk
router.post('/questions/bulk', async (req: AdminAuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { items, defaultTopicId } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: 'Items array is required' });
      return;
    }

    let defaultTopic = defaultTopicId ? await prisma.ieltsTopic.findUnique({ where: { id: defaultTopicId } }) : null;
    if (!defaultTopic) {
      defaultTopic =
        (await prisma.ieltsTopic.findFirst({ where: { slug: 'leisure-habits-daily' } })) ||
        (await prisma.ieltsTopic.findFirst({ where: { slug: 'daily-life-habits' } })) ||
        (await prisma.ieltsTopic.findFirst());
    }

    let importedCount = 0;
    let skippedCount = 0;

    for (const raw of items) {
      const text = typeof raw === 'string' ? raw.trim() : (raw.questionText || raw.text || '').trim();
      if (!text || text.length < 5) continue;

      const part: IeltsPart = raw.part === 'PART_2' ? 'PART_2' : raw.part === 'PART_3' ? 'PART_3' : 'PART_1';
      let bulletsJson: string | null = null;
      if (raw.cueCardBullets) {
        bulletsJson = Array.isArray(raw.cueCardBullets) ? JSON.stringify(raw.cueCardBullets) : String(raw.cueCardBullets);
      }

      const fingerprint = generateQuestionFingerprint(part, text, bulletsJson);
      const existing = await prisma.ieltsQuestion.findUnique({ where: { sourceHash: fingerprint } });
      if (existing) {
        skippedCount++;
        continue;
      }

      await prisma.ieltsQuestion.create({
        data: {
          topicId: raw.topicId || defaultTopic?.id || 'default',
          part,
          questionText: text,
          cueCardBullets: bulletsJson,
          questionType: part === 'PART_2' ? 'CUE_CARD' : part === 'PART_3' ? 'DISCUSSION' : 'GENERAL',
          source: raw.source || 'ADMIN_BULK_IMPORT',
          sourceHash: fingerprint,
          isActive: true,
        },
      });
      importedCount++;
    }

    res.json({
      success: true,
      importedCount,
      skippedCount,
      totalProcessed: items.length,
    });
  } catch (err: unknown) {
    logger.error('Admin bulk question import failed', { service: 'admin_ielts' }, err);
    res.status(500).json({ error: 'Internal server error importing questions' });
  }
});

// --- CRAWLER CONTROL & TELEMETRY ---
// GET /api/admin/ielts/crawler/status
router.get('/crawler/status', async (_req: AdminAuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const [latestLog, totalQuestions, totalTopics] = await Promise.all([
      prisma.crawlerSyncLog.findFirst({
        orderBy: { startedAt: 'desc' },
      }),
      prisma.ieltsQuestion.count(),
      prisma.ieltsTopic.count(),
    ]);

    const gemini = aiCurationService.getGeminiStatus();

    res.json({
      success: true,
      latestLog,
      totalQuestions,
      totalTopics,
      gemini,
      status: {
        latestLog,
        totalQuestions,
        totalTopics,
        gemini,
      },
    });
  } catch (err: unknown) {
    logger.error('Admin fetch crawler status failed', { service: 'admin_ielts' }, err);
    res.status(500).json({ error: 'Internal server error fetching crawler status' });
  }
});

// POST /api/admin/ielts/crawler/gemini-check
router.post('/crawler/gemini-check', async (_req: AdminAuthenticatedRequest, res: Response): Promise<void> => {
  try {
    logger.info('Admin triggered manual Gemini connection check', { service: 'admin_ielts' });
    const gemini = await aiCurationService.checkGeminiConnection(true);
    res.json({ success: true, gemini });
  } catch (err: unknown) {
    logger.error('Admin Gemini connection check failed', { service: 'admin_ielts' }, err);
    res.status(500).json({ error: 'Internal server error checking Gemini connection' });
  }
});

// GET /api/admin/ielts/crawler/logs
router.get('/crawler/logs', async (_req: AdminAuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const logs = await prisma.crawlerSyncLog.findMany({
      orderBy: { startedAt: 'desc' },
      take: 20,
    });
    res.json({ success: true, logs });
  } catch (err: unknown) {
    logger.error('Admin fetch crawler logs failed', { service: 'admin_ielts' }, err);
    res.status(500).json({ error: 'Internal server error fetching crawler logs' });
  }
});

// POST /api/admin/ielts/crawler/run
router.post('/crawler/run', async (req: AdminAuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { customUrl, deepCrawl } = req.body || {};
    const cleanCustomUrl = typeof customUrl === 'string' && customUrl.startsWith('http') ? customUrl.trim() : undefined;
    if (cleanCustomUrl && !webCrawlerService.isSafeCrawlerUrl(cleanCustomUrl)) {
      res.status(400).json({ error: 'Unsafe custom URL: Target must be a public HTTP/HTTPS URL and cannot target private or cloud-metadata IPs.' });
      return;
    }

    logger.info('Admin triggered manual crawler ingestion run', { service: 'admin_ielts', customUrl: cleanCustomUrl, deepCrawl });
    const result = await questionIngestionService.runIngestion({
      force: true,
      customUrl: cleanCustomUrl,
      deepCrawl: Boolean(deepCrawl),
      onNewTopics: async (newCount, topics) => {
        const bot = getAdminBot();
        if (bot) {
          await topicNotificationService.broadcastNewTopics(newCount, topics, bot);
        }
      },
    });
    res.json({ success: true, result });
  } catch (err: unknown) {
    logger.error('Admin trigger crawler failed', { service: 'admin_ielts' }, err);
    res.status(500).json({ error: 'Internal server error triggering crawler' });
  }
});

// POST /api/admin/ielts/crawler/filter-run
router.post('/crawler/filter-run', async (_req: AdminAuthenticatedRequest, res: Response): Promise<void> => {
  try {
    logger.info('Admin triggered manual daily question filter cycle', { service: 'admin_ielts' });
    const result = await questionFilterService.runFilterCycle({ force: true });
    res.json({ success: true, result });
  } catch (err: unknown) {
    logger.error('Admin trigger question filter failed', { service: 'admin_ielts' }, err);
    res.status(500).json({ error: 'Internal server error triggering question filter' });
  }
});

export default router;
