import { Router, Request, Response } from 'express';
import { prisma } from '../config/database';
import { IeltsPart } from '@prisma/client';
import { logger } from '../utils/logger';

const router = Router();

// GET /api/ielts/topics
router.get('/topics', async (_req: Request, res: Response): Promise<void> => {
  try {
    const topics = await prisma.ieltsTopic.findMany({
      where: { isActive: true },
      orderBy: { relevance: 'desc' },
      include: {
        _count: {
          select: { questions: true },
        },
      },
    });
    res.json({ success: true, topics });
  } catch (err: unknown) {
    logger.error('Failed fetching IELTS topics', { service: 'ielts_api' }, err);
    res.status(500).json({ error: 'Internal server error fetching topics' });
  }
});

// GET /api/ielts/questions
router.get('/questions', async (req: Request, res: Response): Promise<void> => {
  try {
    const { part, topicId, limit = '30', page = '1' } = req.query;
    const parsedLimit = Math.min(50, Math.max(1, parseInt(String(limit), 10) || 30));
    const parsedPage = Math.max(1, parseInt(String(page), 10) || 1);
    const skip = (parsedPage - 1) * parsedLimit;

    const where: any = { isActive: true };
    if (part && ['PART_1', 'PART_2', 'PART_3'].includes(String(part).toUpperCase())) {
      where.part = String(part).toUpperCase() as IeltsPart;
    }
    if (topicId && typeof topicId === 'string' && topicId !== 'all') {
      where.topicId = topicId;
    }

    const [questions, total] = await Promise.all([
      prisma.ieltsQuestion.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: parsedLimit,
        include: {
          topic: true,
        },
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
    logger.error('Failed fetching IELTS questions', { service: 'ielts_api' }, err);
    res.status(500).json({ error: 'Internal server error fetching questions' });
  }
});

export default router;
