import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../index';
import { env } from '../config/env';
import { setAdminBot, clearAdminChallenges } from '../routes/admin';
import jwt from 'jsonwebtoken';

describe('Extended 2FA & Session Security Test Suite', () => {
  beforeEach(() => {
    clearAdminChallenges();
  });

  describe('1. Redis OTP Security & Lifecycle', () => {
    it('1.1 Generates cryptographically secure 6-digit OTP and returns challengeId', async () => {
      const res = await request(app)
        .post('/api/admin/auth/password')
        .set('x-test-otp', 'true')
        .send({ password: env.MASTER_PASSWORD });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.challengeId).toBeDefined();
      expect(res.body.testOtp).toMatch(/^\d{6}$/);
    });

    it('1.2 Rejects incorrect OTP attempt and decrements remaining attempts', async () => {
      const step1Res = await request(app)
        .post('/api/admin/auth/password')
        .set('x-test-otp', 'true')
        .send({ password: env.MASTER_PASSWORD });

      const challengeId = step1Res.body.challengeId;

      const res = await request(app)
        .post('/api/admin/auth/otp')
        .send({ challengeId, otp: '000000' });

      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Invalid verification code. 4 attempts remaining.');
    });

    it('1.3 Enforces exact 1-hour session validity on JWT token issuance', async () => {
      const step1Res = await request(app)
        .post('/api/admin/auth/password')
        .set('x-test-otp', 'true')
        .send({ password: env.MASTER_PASSWORD });

      const challengeId = step1Res.body.challengeId;
      const testOtp = step1Res.body.testOtp;

      const res = await request(app)
        .post('/api/admin/auth/otp')
        .send({ challengeId, otp: testOtp });

      expect(res.status).toBe(200);
      expect(res.body.jwtToken).toBeDefined();

      const decoded = jwt.decode(res.body.jwtToken) as { exp: number; iat: number };
      expect(decoded).toBeDefined();
      expect(decoded.exp - decoded.iat).toBe(3600); // EXACTLY 1 HOUR (3600 seconds)
    });

    it('1.4 Sets HttpOnly admin_session cookie with 1-hour expiration', async () => {
      const step1Res = await request(app)
        .post('/api/admin/auth/password')
        .set('x-test-otp', 'true')
        .send({ password: env.MASTER_PASSWORD });

      const challengeId = step1Res.body.challengeId;
      const testOtp = step1Res.body.testOtp;

      const res = await request(app)
        .post('/api/admin/auth/otp')
        .send({ challengeId, otp: testOtp });

      expect(res.status).toBe(200);
      const cookies = res.headers['set-cookie'] as string[] | undefined;
      expect(cookies).toBeDefined();
      expect(cookies?.[0]).toContain('admin_session=');
      expect(cookies?.[0]).toContain('HttpOnly');
    });

    it('1.5 Clears HttpOnly admin_session cookie on logout', async () => {
      const logoutRes = await request(app).post('/api/admin/auth/logout');
      expect(logoutRes.status).toBe(200);
      expect(logoutRes.body.success).toBe(true);
      const cookies = logoutRes.headers['set-cookie'] as string[] | undefined;
      expect(cookies).toBeDefined();
      expect(cookies?.[0]).toContain('admin_session=;');
    });

    it('1.6 Aborts challenge and returns 500 error if Telegram bot fails to deliver OTP in production', async () => {
      // Mock bot with failing sendMessage
      const mockFailingBot = {
        api: {
          sendMessage: async () => {
            throw new Error('Telegram Bot API network timeout');
          },
        },
      } as any;

      setAdminBot(mockFailingBot);

      const oldEnv = env.NODE_ENV;
      (env as any).NODE_ENV = 'production';

      try {
        const res = await request(app)
          .post('/api/admin/auth/password')
          .send({ password: env.MASTER_PASSWORD });

        expect(res.status).toBe(500);
        expect(res.body.error).toContain('Failed to deliver OTP via Telegram');
      } finally {
        (env as any).NODE_ENV = oldEnv;
        setAdminBot(null);
      }
    });
  });
});
