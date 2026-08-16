import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { prisma } from '../config/database';
import { livekitWebhookRouter } from '../routes/livekitWebhook';
import { EgressStatus, WebhookReceiver } from 'livekit-server-sdk';
import { getPlansConfig, getPaidUserProfile } from '../services/plan';
import { isS3Configured, generatePresignedDownloadUrl } from '../services/s3Storage';
import { env } from '../config/env';

describe('LiveKit Egress Webhook, S3 Pipeline & UX Hardening Test Suite', () => {
  let app: express.Application;

  beforeEach(async () => {
    vi.restoreAllMocks();
    app = express();
    app.use('/api/livekit/webhook', express.raw({ type: '*/*', limit: '1mb' }));
    app.use(express.json());
    app.use('/api/livekit', livekitWebhookRouter);
  });

  describe('1. LiveKit Webhook Egress Lifecycle & S3 Finalization', () => {
    it('1.1 Rejects webhook request with invalid signature (401)', async () => {
      const res = await request(app)
        .post('/api/livekit/webhook')
        .set('Authorization', 'invalid_token')
        .send(JSON.stringify({ event: 'egress_ended' }));

      expect(res.status).toBe(401);
    });

    it('1.2 Processes egress_started event and marks egress active', async () => {
      const testUser = await prisma.user.create({
        data: {
          telegramId: 8811223344n,
          alias: 'WebhookTesterA',
          band: 7.0,
          plan: 'PRO',
        },
      });

      const partnerUser = await prisma.user.create({
        data: {
          telegramId: 8811223355n,
          alias: 'WebhookTesterB',
          band: 7.0,
          plan: 'PRO',
        },
      });

      const session = await prisma.callSession.create({
        data: {
          roomName: 'room_webhook_start_1',
          userAId: testUser.id,
          userBId: partnerUser.id,
          status: 'ACTIVE',
          egressId: 'EG_TEST_START_123',
        },
      });

      // Mock WebhookReceiver.receive to bypass auth in test environment
      vi.spyOn(WebhookReceiver.prototype, 'receive').mockResolvedValue({
        event: 'egress_started',
        egressInfo: {
          egressId: 'EG_TEST_START_123',
          roomName: 'room_webhook_start_1',
          status: EgressStatus.EGRESS_ACTIVE,
        } as any,
      } as any);

      const res = await request(app)
        .post('/api/livekit/webhook')
        .set('Authorization', 'mock_valid')
        .send(JSON.stringify({ event: 'egress_started' }));

      expect(res.status).toBe(200);

      const updated = await prisma.callSession.findUnique({ where: { id: session.id } });
      expect(updated?.egressId).toBe('EG_TEST_START_123');
    });

    it('1.3 Finalizes recording when egress_ended arrives with EGRESS_COMPLETE (status 3)', async () => {
      const userA = await prisma.user.create({
        data: {
          telegramId: 9911223344n,
          alias: 'FinalizeUserA',
          band: 7.5,
          plan: 'BOSS',
        },
      });

      const userB = await prisma.user.create({
        data: {
          telegramId: 9911223355n,
          alias: 'FinalizeUserB',
          band: 7.5,
          plan: 'BOSS',
        },
      });

      const session = await prisma.callSession.create({
        data: {
          roomName: 'room_webhook_complete_1',
          userAId: userA.id,
          userBId: userB.id,
          status: 'ACTIVE',
          egressId: 'EG_COMPLETE_888',
          recordingUrl: 'recordings/predicted_temp.mp3',
        },
      });

      vi.spyOn(WebhookReceiver.prototype, 'receive').mockResolvedValue({
        event: 'egress_ended',
        egressInfo: {
          egressId: 'EG_COMPLETE_888',
          roomName: 'room_webhook_complete_1',
          status: EgressStatus.EGRESS_COMPLETE,
          fileResults: [
            {
              filename: 'recordings/room_webhook_complete_1_1723456789.mp3',
              location: 'https://pairtalk-bucket.s3.eu-north-1.amazonaws.com/recordings/room_webhook_complete_1_1723456789.mp3',
              size: BigInt(4500000),
              duration: BigInt(300),
            },
          ],
        } as any,
      } as any);

      const res = await request(app)
        .post('/api/livekit/webhook')
        .set('Authorization', 'mock_valid')
        .send(JSON.stringify({ event: 'egress_ended' }));

      expect(res.status).toBe(200);

      const updated = await prisma.callSession.findUnique({ where: { id: session.id } });
      expect(updated?.recordingUrl).toBe('recordings/room_webhook_complete_1_1723456789.mp3');
    });

    it('1.4 Handles egress_ended with EGRESS_FAILED (status 4) safely without throwing', async () => {
      const userA = await prisma.user.create({
        data: {
          telegramId: 7711223344n,
          alias: 'FailUserA',
          band: 6.5,
          plan: 'PLUS',
        },
      });

      const userB = await prisma.user.create({
        data: {
          telegramId: 7711223355n,
          alias: 'FailUserB',
          band: 6.5,
          plan: 'PLUS',
        },
      });

      const session = await prisma.callSession.create({
        data: {
          roomName: 'room_webhook_failed_1',
          userAId: userA.id,
          userBId: userB.id,
          status: 'ACTIVE',
          egressId: 'EG_FAILED_999',
          recordingUrl: 'recordings/predicted_fail.mp3',
        },
      });

      vi.spyOn(WebhookReceiver.prototype, 'receive').mockResolvedValue({
        event: 'egress_ended',
        egressInfo: {
          egressId: 'EG_FAILED_999',
          roomName: 'room_webhook_failed_1',
          status: EgressStatus.EGRESS_FAILED,
          error: 'Egress upload failed: connection reset',
        } as any,
      } as any);

      const res = await request(app)
        .post('/api/livekit/webhook')
        .set('Authorization', 'mock_valid')
        .send(JSON.stringify({ event: 'egress_ended' }));

      expect(res.status).toBe(200);

      const updated = await prisma.callSession.findUnique({ where: { id: session.id } });
      expect(updated?.recordingUrl).toBeNull();
    });
  });

  describe('2. Canonical Plan Naming & Price Map', () => {
    it('2.1 Default plan names are canonical: Free, Plus, Pro, Boss', () => {
      const plans = getPlansConfig();
      expect(plans.FREE.name).toBe('Free');
      expect(plans.PLUS.name).toBe('Plus');
      expect(plans.PRO.name).toBe('Pro');
      expect(plans.BOSS.name).toBe('Boss');
    });

    it('2.2 Paid user profile formats canonical plan name and clean remaining counters', () => {
      const profile = getPaidUserProfile({
        plan: 'PRO',
        subscriptionStatus: 'ACTIVE',
        subscriptionExpiresAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
        dailyCallsUsed: 2,
        recordingsUsed: 1,
      });

      expect(profile.planDisplayName).toBe('Pro');
      expect(profile.callsRemaining).toBe('23 / 25');
      expect(profile.recordingsRemaining).toBe('6 / 7');
      expect(profile.isActivePaid).toBe(true);
    });
  });

  describe('3. S3 Presigned URL & Configuration', () => {
    it('3.1 Generates signed presigned URL when S3 is configured', async () => {
      const originalKey = env.S3_KEY;
      const originalSecret = env.S3_SECRET;
      const originalBucket = env.S3_BUCKET;

      (env as any).S3_KEY = 'AKIA_TEST_KEY';
      (env as any).S3_SECRET = 'SECRET_TEST_KEY_VALUE';
      (env as any).S3_BUCKET = 'pairtalk-test-bucket';
      (env as any).S3_REGION = 'eu-north-1';

      try {
        expect(isS3Configured()).toBe(true);
        const signedUrl = await generatePresignedDownloadUrl('recordings/test_rec.mp3', 3600);
        expect(signedUrl).toContain('pairtalk-test-bucket');
        expect(signedUrl).toContain('X-Amz-Signature');
        expect(signedUrl).toContain('X-Amz-Expires=3600');
      } finally {
        (env as any).S3_KEY = originalKey;
        (env as any).S3_SECRET = originalSecret;
        (env as any).S3_BUCKET = originalBucket;
      }
    });
  });
});
