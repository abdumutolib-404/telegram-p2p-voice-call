import { Router, type Response } from 'express';
import type { AdminAuthenticatedRequest } from '../middleware/adminAuth';
import { prisma } from '../config/database';
import { IeltsPart } from '@prisma/client';
import { generateQuestionFingerprint } from '../services/crawler/fingerprint';
import { questionIngestionService } from '../services/crawler/ingestionService';
import { topicNotificationService } from '../services/topicNotificationService';
import { getAdminBot } from './admin';
import { logger } from '../utils/logger';

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

    res.json({
      success: true,
      latestLog,
      totalQuestions,
      totalTopics,
    });
  } catch (err: unknown) {
    logger.error('Admin fetch crawler status failed', { service: 'admin_ielts' }, err);
    res.status(500).json({ error: 'Internal server error fetching crawler status' });
  }
});

// POST /api/admin/ielts/crawler/run
router.post('/crawler/run', async (_req: AdminAuthenticatedRequest, res: Response): Promise<void> => {
  try {
    logger.info('Admin triggered manual crawler ingestion run', { service: 'admin_ielts' });
    const result = await questionIngestionService.runIngestion({
      force: true,
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

export default router;
