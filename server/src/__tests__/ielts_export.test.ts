import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../index';
import { prisma } from '../config/database';
import { env } from '../config/env';
import { generateQuestionFingerprint } from '../services/crawler/fingerprint';

describe('IELTS Question Database Export API', () => {
  let adminToken: string;
  let testTopicId: string;

  beforeAll(async () => {
    const adminTelegramId = env.ADMIN_TELEGRAM_IDS?.[0] || '12345678';
    if (!env.ADMIN_TELEGRAM_IDS || !env.ADMIN_TELEGRAM_IDS.includes(adminTelegramId)) {
      (env as any).ADMIN_TELEGRAM_IDS = [adminTelegramId];
    }
    adminToken = jwt.sign({ telegramId: adminTelegramId, role: 'admin' }, env.JWT_SECRET);

    // Ensure a test topic exists
    const topic = await prisma.ieltsTopic.upsert({
      where: { slug: 'hometown-urban-life' },
      update: {},
      create: {
        name: 'Hometown, Cities & Urban Life',
        slug: 'hometown-urban-life',
        description: 'Cities and hometowns in IELTS speaking.',
        relevance: 9,
        isActive: true,
      },
    });
    testTopicId = topic.id;

    // Seed test question
    const qText = 'Where are you living now and how long have you lived there?';
    const hash = generateQuestionFingerprint('PART_1', qText);
    await prisma.ieltsQuestion.upsert({
      where: { sourceHash: hash },
      update: {},
      create: {
        topicId: topic.id,
        part: 'PART_1',
        questionText: qText,
        questionType: 'GENERAL',
        source: 'TEST_EXPORT',
        sourceHash: hash,
        isActive: true,
      },
    });
  });

  describe('Public Export API (/api/ielts/questions/export)', () => {
    it('exports questions in JSON format by default', async () => {
      const res = await request(app).get('/api/ielts/questions/export?topicId=hometown-urban-life');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/application\/json/);
      expect(res.headers['content-disposition']).toContain('.json');
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.questions)).toBe(true);
      expect(res.body.total).toBeGreaterThan(0);

      const found = res.body.questions.find((q: any) => q.questionText.includes('Where are you living now'));
      expect(found).toBeDefined();
      expect(found.topic.slug).toBe('hometown-urban-life');
    });

    it('exports questions in CSV format when format=csv is specified', async () => {
      const res = await request(app).get('/api/ielts/questions/export?topicId=hometown-urban-life&format=csv');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/csv/);
      expect(res.headers['content-disposition']).toContain('.csv');
      expect(res.text).toContain('ID,Part,Topic Name,Topic Slug,Question Text');
      expect(res.text).toContain('Hometown, Cities & Urban Life');
      expect(res.text).toContain('Where are you living now');
    });

    it('filters questions by part', async () => {
      const res = await request(app).get('/api/ielts/questions/export?part=PART_1');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      for (const q of res.body.questions) {
        expect(q.part).toBe('PART_1');
      }
    });
  });

  describe('Admin Export API (/api/admin/ielts/questions/export)', () => {
    it('rejects unauthorized requests without token', async () => {
      const res = await request(app).get('/api/admin/ielts/questions/export');
      expect(res.status).toBe(401);
    });

    it('allows authorized admin to export all questions in JSON', async () => {
      const res = await request(app)
        .get('/api/admin/ielts/questions/export')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.total).toBeGreaterThan(0);
    });

    it('allows authorized admin to export single topic in CSV', async () => {
      const res = await request(app)
        .get('/api/admin/ielts/questions/export?topicId=hometown-urban-life&format=csv')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/csv/);
      expect(res.text).toContain('ID,Part,Topic Name,Topic Slug,Question Text');
      expect(res.text).toContain('hometown-urban-life');
    });
  });
});