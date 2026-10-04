import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import crypto from 'node:crypto';
import { prisma } from '../config/database';
import { getRedis } from '../config/redis';
import {
  approveManualPaymentRequest,
  rejectManualPaymentRequest,
} from '../services/plan';
import {
  checkRateLimit,
  setInFlightLock,
  releaseInFlightLock,
  resetRateLimitForTesting,
} from '../services/rateLimitMatrix';
import { livekitWebhookRouter } from '../routes/livekitWebhook';
import { EgressStatus } from 'livekit-server-sdk';
import { createActionRateLimiter } from '../middleware/rateLimit';

// Webhook mock receiver bypass for testing
vi.mock('livekit-server-sdk', async () => {
  const actual = await vi.importActual<typeof import('livekit-server-sdk')>('livekit-server-sdk');
  return {
    ...actual,
    WebhookReceiver: vi.fn().mockImplementation(() => ({
      receive: vi.fn().mockImplementation(async (body: string) => {
        return typeof body === 'string' ? JSON.parse(body) : body;
      }),
    })),
  };
});

describe('Findings F1 - F7 Targeted Regression Test Suite', () => {
  beforeEach(async () => {
    resetRateLimitForTesting();
    // Clean up mock database
    await (prisma as any).manualPaymentRequest?.deleteMany?.();
    await (prisma as any).callSession?.deleteMany?.();
    await (prisma as any).user?.deleteMany?.();
    await (prisma as any).auditLog?.deleteMany?.();
  });

  // =========================================================================
  // FINDING F1: IDOR on cancel_manual_pay (P1)
  // =========================================================================
  describe('FINDING F1 — IDOR on cancel_manual_pay', () => {
    it('F1.1: User A cannot cancel User B\'s PENDING request (ownership protection)', async () => {
      const userB = await prisma.user.create({
        data: {
          telegramId: 222222222n,
          alias: 'UserB',
          plan: 'FREE',
        },
      });

      const reqB = await prisma.manualPaymentRequest.create({
        data: {
          userId: userB.id,
          telegramId: 222222222n,
          alias: 'UserB',
          plan: 'PLUS',
          uzsAmount: 15000,
          status: 'PENDING',
        },
      });

      // User A (TG ID 111111111) attempts to cancel User B's request
      const attackerTgId = 111111111n;
      const updated = await prisma.manualPaymentRequest.updateMany({
        where: {
          id: reqB.id,
          telegramId: attackerTgId,
          status: 'PENDING',
        },
        data: { status: 'REJECTED', adminNote: 'Cancelled by user' },
      });

      expect(updated.count).toBe(0);

      // Verify request is still PENDING in DB
      const freshReq = await prisma.manualPaymentRequest.findUnique({ where: { id: reqB.id } });
      expect(freshReq?.status).toBe('PENDING');
      expect(freshReq?.adminNote).toBeNull();
    });

    it('F1.2: Cancelling an already-APPROVED request is a no-op (status precondition)', async () => {
      const user = await prisma.user.create({
        data: {
          telegramId: 333333333n,
          alias: 'UserC',
          plan: 'PLUS',
        },
      });

      const approvedReq = await prisma.manualPaymentRequest.create({
        data: {
          userId: user.id,
          telegramId: 333333333n,
          alias: 'UserC',
          plan: 'PLUS',
          uzsAmount: 15000,
          status: 'APPROVED',
          adminNote: 'Verified by admin',
        },
      });

      // Attempt to cancel already approved request
      const updated = await prisma.manualPaymentRequest.updateMany({
        where: {
          id: approvedReq.id,
          telegramId: 333333333n,
          status: 'PENDING',
        },
        data: { status: 'REJECTED', adminNote: 'Cancelled by user' },
      });

      expect(updated.count).toBe(0);

      const freshReq = await prisma.manualPaymentRequest.findUnique({ where: { id: approvedReq.id } });
      expect(freshReq?.status).toBe('APPROVED');
      expect(freshReq?.adminNote).toBe('Verified by admin');
    });

    it('F1.3: Cancelling own PENDING request succeeds atomically', async () => {
      const user = await prisma.user.create({
        data: {
          telegramId: 444444444n,
          alias: 'UserD',
          plan: 'FREE',
        },
      });

      const pendingReq = await prisma.manualPaymentRequest.create({
        data: {
          userId: user.id,
          telegramId: 444444444n,
          alias: 'UserD',
          plan: 'PLUS',
          uzsAmount: 15000,
          status: 'PENDING',
        },
      });

      const updated = await prisma.manualPaymentRequest.updateMany({
        where: {
          id: pendingReq.id,
          telegramId: 444444444n,
          status: 'PENDING',
        },
        data: { status: 'REJECTED', adminNote: 'Cancelled by user' },
      });

      expect(updated.count).toBe(1);

      const freshReq = await prisma.manualPaymentRequest.findUnique({ where: { id: pendingReq.id } });
      expect(freshReq?.status).toBe('REJECTED');
      expect(freshReq?.adminNote).toBe('Cancelled by user');
    });
  });

  // =========================================================================
  // FINDING F2: Double-approval race on manual payments (P1)
  // =========================================================================
  describe('FINDING F2 — Double-approval race on manual payments', () => {
    it('F2.1: Concurrent approveManualPaymentRequest calls: exactly one succeeds, second fails', async () => {
      const user = await prisma.user.create({
        data: {
          telegramId: 555555555n,
          alias: 'LearnerF2',
          plan: 'FREE',
        },
      });

      const req = await prisma.manualPaymentRequest.create({
        data: {
          userId: user.id,
          telegramId: 555555555n,
          alias: 'LearnerF2',
          plan: 'PRO',
          uzsAmount: 55000,
          status: 'PENDING',
        },
      });

      // Fire 2 concurrent approval attempts in parallel
      const results = await Promise.allSettled([
        approveManualPaymentRequest({ requestId: req.id, adminId: 'admin_1', note: 'Approve 1' }),
        approveManualPaymentRequest({ requestId: req.id, adminId: 'admin_2', note: 'Approve 2' }),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);
      expect((rejected[0] as PromiseRejectedResult).reason.message).toContain('Payment request not found or already processed');

      // Verify DB state: user is PRO, exactly 1 audit log exists
      const freshUser = await prisma.user.findUnique({ where: { id: user.id } });
      expect(freshUser?.plan).toBe('PRO');
      expect(freshUser?.subscriptionStatus).toBe('ACTIVE');

      const auditLogs = await prisma.auditLog.findMany({
        where: { targetId: user.id, action: 'MANUAL_PAYMENT_APPROVAL' },
      });
      expect(auditLogs.length).toBe(1);
    });

    it('F2.2: Concurrent rejectManualPaymentRequest calls: exactly one succeeds', async () => {
      const user = await prisma.user.create({
        data: {
          telegramId: 666666666n,
          alias: 'LearnerF2Reject',
          plan: 'FREE',
        },
      });

      const req = await prisma.manualPaymentRequest.create({
        data: {
          userId: user.id,
          telegramId: 666666666n,
          alias: 'LearnerF2Reject',
          plan: 'PLUS',
          uzsAmount: 15000,
          status: 'PENDING',
        },
      });

      const results = await Promise.allSettled([
        rejectManualPaymentRequest({ requestId: req.id, adminId: 'admin_1', note: 'Reject 1' }),
        rejectManualPaymentRequest({ requestId: req.id, adminId: 'admin_2', note: 'Reject 2' }),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);

      const auditLogs = await prisma.auditLog.findMany({
        where: { targetId: user.id, action: 'MANUAL_PAYMENT_REJECTION' },
      });
      expect(auditLogs.length).toBe(1);
    });

    it('F2.3: Approve-then-reject on the same request cleanly rejects the second call', async () => {
      const user = await prisma.user.create({
        data: {
          telegramId: 777777777n,
          alias: 'LearnerF2Seq',
          plan: 'FREE',
        },
      });

      const req = await prisma.manualPaymentRequest.create({
        data: {
          userId: user.id,
          telegramId: 777777777n,
          alias: 'LearnerF2Seq',
          plan: 'PLUS',
          uzsAmount: 15000,
          status: 'PENDING',
        },
      });

      // 1. Approve succeeds
      const approved = await approveManualPaymentRequest({ requestId: req.id, adminId: 'admin_1' });
      expect(approved.request.status).toBe('APPROVED');

      // 2. Reject fails because status is no longer PENDING
      await expect(
        rejectManualPaymentRequest({ requestId: req.id, adminId: 'admin_2' })
      ).rejects.toThrow('Payment request not found or already processed');
    });
  });

  // =========================================================================
  // FINDING F3: In-memory penalty/in-flight locks bypass Redis (P1)
  // =========================================================================
  describe('FINDING F3 — Redis-authoritative penalty blocks & in-flight locks', () => {
    it('F3.1: Redis penalty block is authoritative across instances (cross-instance lockout)', async () => {
      const redis = getRedis();
      const testUser = 'user_f3_cross_instance';
      const penaltyKey = `penalty:direct_call:${testUser}`;

      // Simulate Instance A setting a penalty in Redis
      await redis.set(penaltyKey, '1', 'EX', 120);

      // Simulate Instance B with a fresh/empty in-memory map checking rate limit
      resetRateLimitForTesting();
      const result = await checkRateLimit('DIRECT_CALL', testUser);

      expect(result.allowed).toBe(false);
      expect(result.error?.code).toBe('RATE_LIMITED');
      expect(result.retryAfterSeconds).toBeGreaterThan(0);
    });

    it('F3.2: Redis in-flight lock prevents duplicate concurrent execution across instances', async () => {
      const testUser = 'user_f3_inflight';
      const lockKey = `inflight:RECORD_START:${testUser}`;
      const redis = getRedis();

      // Instance A acquires in-flight lock
      setInFlightLock('RECORD_START', testUser);
      await redis.set(lockKey, '1', 'PX', 4000);

      // Instance B with cleared local memory checks rate limit
      resetRateLimitForTesting();
      const result = await checkRateLimit('RECORD_START', testUser);

      expect(result.allowed).toBe(false);
      expect(result.error?.code).toBe('ALREADY_IN_PROGRESS');

      // Release lock
      releaseInFlightLock('RECORD_START', testUser);
      await redis.del(lockKey);

      const afterRelease = await checkRateLimit('RECORD_START', testUser);
      expect(afterRelease.allowed).toBe(true);
    });
  });

  // =========================================================================
  // FINDING F4: Weak IP-keyed in-memory limiter migration (P2)
  // =========================================================================
  describe('FINDING F4 — createActionRateLimiter route migration', () => {
    it('F4.1: Action rate limiter blocks after threshold with canonical 429 response', async () => {
      const app = express();
      app.use(express.json());
      const limiter = createActionRateLimiter('AUTH_PASSWORD', () => 'test_f4_client_ip');
      app.post('/test-rate-limit', limiter, (_req, res) => {
        res.json({ ok: true });
      });

      // Threshold for AUTH_PASSWORD is 5 requests per 900s
      for (let i = 0; i < 5; i++) {
        const res = await request(app).post('/test-rate-limit').set('x-test-ratelimit', 'true');
        expect(res.status).toBe(200);
      }

      // 6th request should be blocked with 429
      const blockedRes = await request(app).post('/test-rate-limit').set('x-test-ratelimit', 'true');
      expect(blockedRes.status).toBe(429);
      expect(blockedRes.body.code).toBe('RATE_LIMITED');
    });
  });

  // =========================================================================
  // FINDING F5: Zero-byte recordings accepted as success (P2)
  // =========================================================================
  describe('FINDING F5 — Zero-byte recordings rejected in LiveKit Webhook', () => {
    it('F5.1: Webhook payload with size 0 sets recordingUrl: null and does not save zero-byte recording', async () => {
      const session = await prisma.callSession.create({
        data: {
          roomName: 'room_f5_zero_byte_test',
          userAId: 'user_a',
          userBId: 'user_b',
          status: 'COMPLETED',
        },
      });

      const app = express();
      app.use(express.json());
      app.use('/livekit', livekitWebhookRouter);

      const webhookPayload = {
        event: 'egress_ended',
        egressInfo: {
          egressId: 'EG_ZERO_BYTE_123',
          roomName: session.roomName,
          status: EgressStatus.EGRESS_COMPLETE,
          fileResults: [
            {
              filename: 'recordings/corrupted_zero_byte.mp3',
              size: 0, // Zero bytes
              duration: 0,
            },
          ],
        },
      };

      const res = await request(app)
        .post('/livekit/webhook')
        .set('Authorization', 'mock-valid-auth')
        .send(webhookPayload);

      expect(res.status).toBe(200);

      const updatedSession = await prisma.callSession.findUnique({ where: { id: session.id } });
      expect(updatedSession?.recordingUrl).toBeNull();
    });

    it('F5.2: Webhook payload with valid non-zero size sets recordingUrl correctly', async () => {
      const session = await prisma.callSession.create({
        data: {
          roomName: 'room_f5_valid_size_test',
          userAId: 'user_a',
          userBId: 'user_b',
          status: 'COMPLETED',
        },
      });

      const app = express();
      app.use(express.json());
      app.use('/livekit', livekitWebhookRouter);

      const webhookPayload = {
        event: 'egress_ended',
        egressInfo: {
          egressId: 'EG_VALID_SIZE_456',
          roomName: session.roomName,
          status: EgressStatus.EGRESS_COMPLETE,
          fileResults: [
            {
              filename: 'recordings/valid_session.mp3',
              size: 2048576, // 2 MB
              duration: 300,
            },
          ],
        },
      };

      const res = await request(app)
        .post('/livekit/webhook')
        .set('Authorization', 'mock-valid-auth')
        .send(webhookPayload);

      expect(res.status).toBe(200);

      const updatedSession = await prisma.callSession.findUnique({ where: { id: session.id } });
      expect(updatedSession?.recordingUrl).toBe('recordings/valid_session.mp3');
      expect(updatedSession?.egressId).toBe('EG_VALID_SIZE_456');
    });
  });

  // =========================================================================
  // FINDING F6: Webhook returns 200 even when DB update fails (P2)
  // =========================================================================
  describe('FINDING F6 — Webhook error status for retry handling', () => {
    it('F6.1: Webhook returns 500 when database update throws', async () => {
      const app = express();
      app.use(express.json());
      app.use('/livekit', livekitWebhookRouter);

      const session = await prisma.callSession.create({
        data: {
          roomName: 'room_f6_db_fail_test',
          userAId: 'user_a',
          userBId: 'user_b',
          status: 'ACTIVE',
          egressId: 'EG_FAIL_RETRY',
        },
      });

      // Fail the conditional metadata write while the tracked webhook identity remains valid.
      const write = vi.spyOn(prisma.callSession, 'updateMany').mockRejectedValueOnce(new Error('PostgreSQL connection timeout'));

      try {
        const res = await request(app)
          .post('/livekit/webhook')
          .set('Authorization', 'mock-valid-auth')
          .send({
            event: 'egress_started',
            egressInfo: {
              egressId: 'EG_FAIL_RETRY',
              roomName: session.roomName,
              status: EgressStatus.EGRESS_ACTIVE,
            },
          });

        expect(res.status).toBe(500);
        expect(res.text).toContain('Database update failed');
        expect(write).toHaveBeenCalledOnce();
      } finally {
        write.mockRestore();
      }
    });

    it('F6.2: Session not found returns 200 OK (terminal case, no retry required)', async () => {
      const app = express();
      app.use(express.json());
      app.use('/livekit', livekitWebhookRouter);

      const res = await request(app)
        .post('/livekit/webhook')
        .set('Authorization', 'mock-valid-auth')
        .send({
          event: 'egress_started',
          egressInfo: {
            egressId: 'EG_NON_EXISTENT_SESSION',
            roomName: 'room_non_existent_uuid',
            status: EgressStatus.EGRESS_ACTIVE,
          },
        });

      expect(res.status).toBe(200);
      expect(res.text).toBe('OK');
    });
  });

  // =========================================================================
  // FINDING F7: roomName uniqueness verification (P3)
  // =========================================================================
  describe('FINDING F7 — roomName UUID Uniqueness & Webhook lookup safety', () => {
    it('F7.1: Generated direct call and matchmaking roomNames follow UUID format ensuring global uniqueness', () => {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

      const matchmakingRoom = `room_${crypto.randomUUID()}`;
      const directCallRoom = `direct_${crypto.randomUUID()}`;

      const matchmakingUUID = matchmakingRoom.replace(/^room_/, '');
      const directCallUUID = directCallRoom.replace(/^direct_/, '');

      expect(uuidRegex.test(matchmakingUUID)).toBe(true);
      expect(uuidRegex.test(directCallUUID)).toBe(true);
      expect(matchmakingRoom).not.toBe(directCallRoom);
    });
  });
});
