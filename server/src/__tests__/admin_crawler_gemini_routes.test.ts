import { describe, it, expect, beforeAll, vi, afterEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../index';
import { env } from '../config/env';
import { aiCurationService } from '../services/crawler/aiCurationService';
import { GoogleGenerativeAI } from '@google/generative-ai';

describe('Admin IELTS Crawler & Gemini Check Routes', () => {
  let adminJwtToken: string;
  let nonAdminJwtToken: string;
  const originalEnv = process.env.GEMINI_API_KEY;

  beforeAll(async () => {
    const adminTgId = env.ADMIN_TELEGRAM_IDS[0] || '12345678';
    adminJwtToken = jwt.sign(
      { role: 'admin', telegramId: adminTgId },
      env.JWT_SECRET,
      { expiresIn: '1h', algorithm: 'HS256' }
    );

    nonAdminJwtToken = jwt.sign(
      { role: 'user', telegramId: '99999999' },
      env.JWT_SECRET,
      { expiresIn: '1h', algorithm: 'HS256' }
    );
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.GEMINI_API_KEY = originalEnv;
    } else {
      delete process.env.GEMINI_API_KEY;
    }
    aiCurationService._setCachedState(null);
    vi.restoreAllMocks();
  });

  describe('Security guards', () => {
    it('rejects /crawler/status without token (401)', async () => {
      const res = await request(app).get('/api/admin/ielts/crawler/status');
      expect(res.status).toBe(401);
    });

    it('rejects /crawler/gemini-check without token (401)', async () => {
      const res = await request(app).post('/api/admin/ielts/crawler/gemini-check');
      expect(res.status).toBe(401);
    });

    it('rejects /crawler/gemini-check with non-admin token (403)', async () => {
      const res = await request(app)
        .post('/api/admin/ielts/crawler/gemini-check')
        .set('Authorization', `Bearer ${nonAdminJwtToken}`);
      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/admin/ielts/crawler/status', () => {
    it('returns crawler status with gemini telemetry', async () => {
      delete process.env.GEMINI_API_KEY;
      aiCurationService._setCachedState(null);

      const res = await request(app)
        .get('/api/admin/ielts/crawler/status')
        .set('Authorization', `Bearer ${adminJwtToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.gemini).toBeDefined();
      expect(res.body.gemini.status).toBe('NOT_CONFIGURED');
      expect(res.body.gemini.model).toBe('gemini-2.5-flash');
      expect(res.body.status.gemini).toBeDefined();
    });
  });

  describe('POST /api/admin/ielts/crawler/gemini-check', () => {
    it('returns CONNECTED state when live ping succeeds', async () => {
      process.env.GEMINI_API_KEY = 'test_live_key_999';

      const mockGenerate = vi.fn().mockResolvedValue({
        response: { text: () => 'pong' },
      });
      vi.spyOn(GoogleGenerativeAI.prototype, 'getGenerativeModel').mockReturnValue({
        generateContent: mockGenerate,
      } as any);

      const res = await request(app)
        .post('/api/admin/ielts/crawler/gemini-check')
        .set('Authorization', `Bearer ${adminJwtToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.gemini).toBeDefined();
      expect(res.body.gemini.status).toBe('CONNECTED');
      expect(res.body.gemini.model).toBe('gemini-2.5-flash');
      expect(res.body.gemini.lastError).toBeNull();
      expect(typeof res.body.gemini.latencyMs).toBe('number');
      expect(mockGenerate).toHaveBeenCalledWith('ping');
    });

    it('returns FAILED state when live ping fails', async () => {
      process.env.GEMINI_API_KEY = 'test_failing_key';

      vi.spyOn(GoogleGenerativeAI.prototype, 'getGenerativeModel').mockReturnValue({
        generateContent: vi.fn().mockRejectedValue(new Error('API quota reached: 429')),
      } as any);

      const res = await request(app)
        .post('/api/admin/ielts/crawler/gemini-check')
        .set('Authorization', `Bearer ${adminJwtToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.gemini).toBeDefined();
      expect(res.body.gemini.status).toBe('FAILED');
      expect(res.body.gemini.lastError).toContain('429');
    });
  });
});
