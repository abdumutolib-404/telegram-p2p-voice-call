import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { IeltsPart } from '@prisma/client';
import { logger } from '../utils/logger';
import { getRedis } from '../config/redis';
import { escapeCsvField as escapeCsv } from '../utils/csv';
import { createActionRateLimiter } from '../middleware/rateLimit';

const router = Router();
const MAX_PUBLIC_EXPORT_ROWS = 1000;

function limitConcurrency(maximum: number) {
  let active = 0;
  return (_req: Request, res: Response, next: NextFunction) => {
    if (active >= maximum) {
      res.setHeader('Retry-After', '5');
      res.status(429).json({ error: 'Question service is busy. Please retry shortly.' });
      return;
    }
    active++;
    let released = false;
    const release = () => {
      if (!released) { released = true; active--; }
    };
    res.once('finish', release);
    res.once('close', release);
    next();
  };
}

function parseFilters(query: Request['query']): { part: IeltsPart | null; topicId: string | null } {
  const rawPart = query.part;
  if (rawPart !== undefined && typeof rawPart !== 'string') throw new TypeError('part must be a single value');
  const part = rawPart?.toUpperCase();
  if (part && !['ALL', 'PART_1', 'PART_2', 'PART_3'].includes(part)) throw new TypeError('Unsupported question part');
  const rawTopic = query.topicId;
  if (rawTopic !== undefined && (typeof rawTopic !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(rawTopic))) throw new TypeError('Invalid topic ID or slug');
  return { part: !part || part === 'ALL' ? null : part as IeltsPart, topicId: !rawTopic || rawTopic === 'all' ? null : rawTopic as string };
}

function parseInteger(value: unknown, fallback: number, maximum: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^[1-9][0-9]{0,8}$/.test(value)) throw new TypeError('Invalid pagination');
  const number = Number(value);
  if (number > maximum) throw new TypeError('Pagination exceeds supported limit');
  return number;
}

router.use(createActionRateLimiter('PUBLIC_IELTS_READ'), limitConcurrency(16));

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
    const { part, topicId } = parseFilters(req.query);
    const parsedLimit = parseInteger(req.query.limit, 30, 50);
    const parsedPage = parseInteger(req.query.page, 1, 10000);
    const skip = (parsedPage - 1) * parsedLimit;

    const cacheKey = `cache:ielts:questions:${topicId || 'all'}:${part || 'all'}:${parsedPage}:${parsedLimit}`;
    // The public cache has a finite key space: 4 parts × 10 pages × 50 sizes.
    // User-selected topic IDs and arbitrarily deep pages never create cache entries.
    const cacheable = topicId === null && parsedPage <= 10;
    const bypassCache = req.headers['x-bypass-cache'] === 'true' || req.query.fresh === 'true';

    if (cacheable && !bypassCache) {
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
    if (part) where.part = part;
    if (topicId) {
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

    if (cacheable && questions.length > 0) try {
      const redis = getRedis();
      await redis.set(cacheKey, JSON.stringify(result), 'EX', 300); // 5-minute TTL
    } catch {}

    res.json(result);
  } catch (err: unknown) {
    if (err instanceof TypeError) { res.status(400).json({ error: err.message }); return; }
    logger.error('Failed fetching IELTS questions', { service: 'ielts_api' }, err);
    res.status(500).json({ error: 'Internal server error fetching questions' });
  }
});

// GET /api/ielts/questions/export
router.get('/questions/export', createActionRateLimiter('PUBLIC_IELTS_EXPORT'), limitConcurrency(2), async (req: Request, res: Response): Promise<void> => {
  try {
    const { topicId, part } = parseFilters(req.query);
    const format = req.query.format ?? 'json';
    if (typeof format !== 'string' || !['json', 'csv'].includes(format.toLowerCase())) throw new TypeError('Unsupported export format');
    const where: any = { isActive: true };

    if (part) where.part = part;

    if (topicId) {
      where.OR = [{ topicId }, { topic: { slug: topicId } }];
    }

    const questions = await prisma.ieltsQuestion.findMany({
      where,
      orderBy: [{ topic: { name: 'asc' } }, { part: 'asc' }, { createdAt: 'desc' }],
      include: { topic: true },
      take: MAX_PUBLIC_EXPORT_ROWS + 1,
    });

    if (questions.length > MAX_PUBLIC_EXPORT_ROWS) {
      res.status(413).json({ error: `Public exports support at most ${MAX_PUBLIC_EXPORT_ROWS} questions. Select a topic or part to narrow the export.` });
      return;
    }

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
    if (err instanceof TypeError) { res.status(400).json({ error: err.message }); return; }
    logger.error('Public export questions failed', { service: 'ielts_api' }, err);
    res.status(500).json({ error: 'Internal server error exporting questions' });
  }
});

export default router;
