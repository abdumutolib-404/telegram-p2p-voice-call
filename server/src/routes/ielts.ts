import { Router, Request, Response } from 'express';
import { prisma } from '../config/database';
import { IeltsPart } from '@prisma/client';
import { logger } from '../utils/logger';
import { getRedis } from '../config/redis';

const router = Router();

export async function invalidateIeltsQuestionCache(): Promise<void> {
  try {
    const redis = getRedis();
    // Non-blocking iterative SCAN cursor to prevent blocking Redis single-threaded event loop
    let cursor = '0';
    do {
      if (typeof (redis as any).scan === 'function') {
        const res = await (redis as any).scan(cursor, 'MATCH', 'cache:ielts:questions:*', 'COUNT', 100);
        cursor = Array.isArray(res) ? res[0] : '0';
        const keys = Array.isArray(res) && Array.isArray(res[1]) ? res[1] : [];
        if (keys.length > 0) {
          await redis.del(...keys);
        }
      } else {
        // Fallback for test harness / in-memory mock
        const keys = await redis.keys('cache:ielts:questions:*');
        if (keys.length > 0) {
          await redis.del(...keys);
        }
        break;
      }
    } while (cursor !== '0');
  } catch {}
}

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

    const cacheKey = `cache:ielts:questions:${topicId || 'all'}:${part || 'all'}:${parsedPage}:${parsedLimit}`;
    const bypassCache = req.headers['x-bypass-cache'] === 'true' || req.query.fresh === 'true';

    if (!bypassCache) {
      try {
        const redis = getRedis();
        const cached = await redis.get(cacheKey);
        if (cached) {
          res.json(JSON.parse(cached));
          return;
        }
      } catch {
        // Fallback to database query on cache miss or error
      }
    }

    const where: any = { isActive: true };
    if (part && ['PART_1', 'PART_2', 'PART_3'].includes(String(part).toUpperCase())) {
      where.part = String(part).toUpperCase() as IeltsPart;
    }
    if (topicId && typeof topicId === 'string' && topicId !== 'all') {
      where.OR = [{ topicId }, { topic: { slug: topicId } }];
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

    const result = {
      success: true,
      questions,
      pagination: {
        page: parsedPage,
        limit: parsedLimit,
        total,
        totalPages: Math.ceil(total / parsedLimit),
      },
    };

    try {
      const redis = getRedis();
      await redis.set(cacheKey, JSON.stringify(result), 'EX', 300); // 5-minute TTL
    } catch {}

    res.json(result);
  } catch (err: unknown) {
    logger.error('Failed fetching IELTS questions', { service: 'ielts_api' }, err);
    res.status(500).json({ error: 'Internal server error fetching questions' });
  }
});

// GET /api/ielts/questions/export
router.get('/questions/export', async (req: Request, res: Response): Promise<void> => {
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
      const escapeCsv = (val: unknown) => {
        if (val === null || val === undefined) return '""';
        return `"${String(val).replace(/"/g, '""')}"`;
      };

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
    logger.error('Public export questions failed', { service: 'ielts_api' }, err);
    res.status(500).json({ error: 'Internal server error exporting questions' });
  }
});

export default router;
