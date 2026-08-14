import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { app } from '../index';
import { env } from '../config/env';
import { prisma } from '../config/database';
import { validateTelegramInitData } from '../middleware/initDataLockdown';
import { getAdminChallenge, clearAdminChallenges } from '../routes/admin';
import { getRedis } from '../config/redis';

describe('Final Authentication Architecture Test Suite', () => {
  const botToken = env.BOT_TOKEN;

  function generateInitData(userObj: object): string {
    const userJson = JSON.stringify(userObj);
    const authDate = Math.floor(Date.now() / 1000).toString();
    const dataCheckString = `auth_date=${authDate}\nuser=${userJson}`;
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
    return `auth_date=${authDate}&user=${encodeURIComponent(userJson)}&hash=${hash}`;
  }

  // =========================================================================
  // SECTION 1: Public Client & Telegram Mini App Auth
  // =========================================================================
  describe('1. Public Client & Telegram Mini App Authentication', () => {
    it('1.1 Rejects browser access missing initData (403 Forbidden)', async () => {
      const res = await request(app).post('/api/auth/verify').send({});
      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Missing initData signature.');
    });

    it('1.2 Rejects invalid or tampered initData (403 Forbidden)', async () => {
      const tampered = 'auth_date=1600000000&user=%7B%22id%22%3A1%7D&hash=invalid_hash_value';
      const res = await request(app)
        .post('/api/auth/verify')
        .set('x-telegram-init-data', tampered)
        .send({});

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Invalid initData signature.');
    });

    it('1.3 Authenticates authentic Telegram Mini App user directly without requiring /start command', async () => {
      const tgUser = { id: 88812345, first_name: 'MiniAppUser', username: 'miniapp_user' };
      const initData = generateInitData(tgUser);

      const res = await request(app)
        .post('/api/auth/verify')
        .set('x-telegram-init-data', initData)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.telegramId).toBe('88812345');
      expect(res.body.user.alias).toMatch(/^P2P-/);

      // Verify DB record was created automatically
      const dbUser = await prisma.user.findUnique({ where: { telegramId: BigInt(88812345) } });
      expect(dbUser).toBeDefined();
      expect(dbUser?.telegramId).toBe(BigInt(88812345));
    });

    it('1.4 Allows user with exhausted daily quota to authenticate via /api/auth/verify', async () => {
      const tgUser = { id: 88812346, first_name: 'QuotaUser', username: 'quota_user' };
      const initData = generateInitData(tgUser);

      // First create user with exhausted call quota
      await prisma.user.create({
        data: {
          telegramId: BigInt(88812346),
          alias: 'P2P-Partner-Quota',
          band: 6.5,
          dailyLimit: 3,
          dailyCallsUsed: 3, // Exhausted quota
          lastCallDate: new Date().toISOString().slice(0, 10),
        },
      });

      const res = await request(app)
        .post('/api/auth/verify')
        .set('x-telegram-init-data', initData)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.user.telegramId).toBe('88812346');
    });
  });

  // =========================================================================
  // SECTION 2: Admin Panel 2-Step OTP Authentication
  // =========================================================================
  describe('2. Admin Panel 2-Step OTP Authentication', () => {
    let activeChallengeId: string;
    let activeOtp: string;

    beforeEach(() => {
      clearAdminChallenges();
    });

    it('2.1 Rejects Step 1 password request with invalid master password (401 Unauthorized)', async () => {
      const res = await request(app)
        .post('/api/admin/auth/password')
        .send({ password: 'wrong_master_password' });

      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Invalid master password.');
    });

    it('2.2 Accepts Step 1 password request and creates short-lived challengeId', async () => {
      const res = await request(app)
        .post('/api/admin/auth/password')
        .set('x-test-otp', 'true')
        .send({ password: env.MASTER_PASSWORD });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.challengeId).toBeDefined();
      expect(res.body.testOtp).toBeDefined();

      activeChallengeId = res.body.challengeId;
      activeOtp = res.body.testOtp;
    });

    it('2.3 Rejects Step 2 OTP verification with incorrect OTP code (401 Unauthorized)', async () => {
      const step1Res = await request(app)
        .post('/api/admin/auth/password')
        .set('x-test-otp', 'true')
        .send({ password: env.MASTER_PASSWORD });

      const challengeId = step1Res.body.challengeId;

      const res = await request(app)
        .post('/api/admin/auth/otp')
        .send({ challengeId, otp: '000000' });

      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Invalid verification code.');
    });

    it('2.4 Verifies valid OTP code and issues admin JWT token', async () => {
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
      expect(res.body.success).toBe(true);
      expect(res.body.jwtToken).toBeDefined();
    });

    it('2.5 Enforces single-use OTP replay protection (401 Unauthorized)', async () => {
      const step1Res = await request(app)
        .post('/api/admin/auth/password')
        .set('x-test-otp', 'true')
        .send({ password: env.MASTER_PASSWORD });

      const challengeId = step1Res.body.challengeId;
      const testOtp = step1Res.body.testOtp;

      // First verification succeeds
      const res1 = await request(app)
        .post('/api/admin/auth/otp')
        .send({ challengeId, otp: testOtp });
      expect(res1.status).toBe(200);

      // Replay attempt fails
      const res2 = await request(app)
        .post('/api/admin/auth/otp')
        .send({ challengeId, otp: testOtp });
      expect(res2.status).toBe(401);
      expect(res2.body.error).toContain('Invalid or consumed login challenge.');
    });

    it('2.6 Enforces 5-attempt limit on OTP challenge (401 Unauthorized)', async () => {
      const step1Res = await request(app)
        .post('/api/admin/auth/password')
        .set('x-test-otp', 'true')
        .send({ password: env.MASTER_PASSWORD });

      const challengeId = step1Res.body.challengeId;
      const testOtp = step1Res.body.testOtp;

      // Fail 5 consecutive times
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/admin/auth/otp')
          .send({ challengeId, otp: '999999' });
      }

      // 6th attempt with CORRECT OTP fails due to attempt limit
      const res = await request(app)
        .post('/api/admin/auth/otp')
        .send({ challengeId, otp: testOtp });

      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/Maximum OTP verification attempts exceeded|Invalid or consumed login challenge/);
    });

    it('2.7 Rejects expired OTP challenge (401 Unauthorized)', async () => {
      const step1Res = await request(app)
        .post('/api/admin/auth/password')
        .set('x-test-otp', 'true')
        .send({ password: env.MASTER_PASSWORD });

      const challengeId = step1Res.body.challengeId;
      const testOtp = step1Res.body.testOtp;

      // Manually set challenge expiration to 1 second in the past
      const challenge = getAdminChallenge(challengeId);
      if (challenge) {
        challenge.expiresAt = Date.now() - 1000;
        await getRedis().set(`otp:challenge:${challengeId}`, JSON.stringify(challenge), 'EX', 300);
      }

      const res = await request(app)
        .post('/api/admin/auth/otp')
        .send({ challengeId, otp: testOtp });

      expect(res.status).toBe(401);
      expect(res.body.error).toContain('OTP has expired.');
    });
  });

  // =========================================================================
  // SECTION 3: Admin Authorization & Cookie / JWT Verification
  // =========================================================================
  describe('3. Admin Endpoint Authorization & Cookie Verification', () => {
    it('3.1 Rejects access to admin endpoints without session cookie or JWT (401 Unauthorized)', async () => {
      const res = await request(app).get('/api/admin/stats');
      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Missing session cookie or Bearer token.');
    });

    it('3.2 Rejects access with expired admin session (401 Unauthorized)', async () => {
      const expiredJwt = jwt.sign(
        { role: 'admin', telegramId: '12345678' },
        env.JWT_SECRET,
        { expiresIn: '-1s', algorithm: 'HS256' }
      );

      const res = await request(app)
        .get('/api/admin/stats')
        .set('Cookie', [`admin_session=${expiredJwt}`]);

      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Token expired or invalid.');
    });

    it('3.3 Grants access to admin endpoints with valid HttpOnly admin_session cookie', async () => {
      const step1Res = await request(app)
        .post('/api/admin/auth/password')
        .set('x-test-otp', 'true')
        .send({ password: env.MASTER_PASSWORD });

      const challengeId = step1Res.body.challengeId;
      const testOtp = step1Res.body.testOtp;

      const otpRes = await request(app)
        .post('/api/admin/auth/otp')
        .send({ challengeId, otp: testOtp });

      expect(otpRes.status).toBe(200);
      const cookies = otpRes.headers['set-cookie'] as string[] | undefined;
      expect(cookies).toBeDefined();
      expect(cookies?.[0]).toContain('admin_session=');
      expect(cookies?.[0]).toContain('HttpOnly');

      const res = await request(app)
        .get('/api/admin/stats')
        .set('Cookie', cookies!);

      expect(res.status).toBe(200);
      expect(res.body.totalUsers).toBeDefined();
    });

    it('3.4 Clears session cookie on logout', async () => {
      const logoutRes = await request(app).post('/api/admin/auth/logout');
      expect(logoutRes.status).toBe(200);
      const cookies = logoutRes.headers['set-cookie'] as string[] | undefined;
      expect(cookies).toBeDefined();
      expect(cookies?.[0]).toContain('admin_session=;');
    });
  });
});
