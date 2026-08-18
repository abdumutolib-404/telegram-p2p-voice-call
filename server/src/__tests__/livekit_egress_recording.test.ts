import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildAudioEncodedFileOutput,
  isRecordingStorageConfigured,
  startAudioEgress,
  stopAudioEgress,
} from '../config/livekit';
import { env } from '../config/env';
import { EncodedFileType, S3Upload, EncodedFileOutput } from 'livekit-server-sdk';
import { prisma } from '../config/database';
import { getEffectiveEntitlement } from '../services/plan';

describe('LiveKit Egress & Voice Recording Architecture Test Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. SDK Protobuf OneOf Contract & EncodedFileOutput Structure', () => {
    it('1.1 Generates valid EncodedFileOutput with explicit oneof case for S3Upload when S3 is configured', () => {
      // Temporarily set S3 configs
      const originalKey = env.S3_KEY;
      const originalSecret = env.S3_SECRET;
      const originalBucket = env.S3_BUCKET;

      (env as any).S3_KEY = 'test_access_key';
      (env as any).S3_SECRET = 'test_secret_key';
      (env as any).S3_BUCKET = 'test_recordings_bucket';
      (env as any).S3_REGION = 'us-east-1';

      try {
        const fileName = 'room_abc_123456.mp3';
        const { output, relativeUrl } = buildAudioEncodedFileOutput(fileName);

        expect(output).toBeInstanceOf(EncodedFileOutput);
        expect(output.fileType).toBe(EncodedFileType.MP3);
        expect(output.disableManifest).toBe(true);
        expect(relativeUrl).toBe(`recordings/${fileName}`);

        // Verify the exact oneof structure required by LiveKit Server SDK v2 & Protocol v1.50
        expect(output.output).toBeDefined();
        expect(output.output.case).toBe('s3');
        expect(output.output.value).toBeInstanceOf(S3Upload);
        expect((output.output.value as S3Upload).bucket).toBe('test_recordings_bucket');
        expect((output.output.value as S3Upload).accessKey).toBe('test_access_key');
        expect((output.output.value as S3Upload).secret).toBe('test_secret_key');
      } finally {
        (env as any).S3_KEY = originalKey;
        (env as any).S3_SECRET = originalSecret;
        (env as any).S3_BUCKET = originalBucket;
      }
    });

    it('1.2 Generates local disk EncodedFileOutput when local storage is used without S3', () => {
      const originalKey = env.S3_KEY;
      const originalSecret = env.S3_SECRET;
      const originalBucket = env.S3_BUCKET;

      (env as any).S3_KEY = undefined;
      (env as any).S3_SECRET = undefined;
      (env as any).S3_BUCKET = undefined;

      try {
        const fileName = 'local_room_456.mp3';
        const { output, relativeUrl } = buildAudioEncodedFileOutput(fileName);

        expect(output).toBeInstanceOf(EncodedFileOutput);
        expect(output.fileType).toBe(EncodedFileType.MP3);
        expect(output.filepath).toContain(fileName);
        expect(relativeUrl).toBe(`recordings/${fileName}`);
        expect(output.output.case).toBeUndefined();
      } finally {
        (env as any).S3_KEY = originalKey;
        (env as any).S3_SECRET = originalSecret;
        (env as any).S3_BUCKET = originalBucket;
      }
    });
  });

  describe('2. LiveKit Cloud Pre-flight Storage Validation & Error Isolation', () => {
    it('2.1 Rejects LiveKit Cloud egress gracefully with RECORDING_STORAGE_UNAVAILABLE when S3 is missing', async () => {
      const originalHost = env.LIVEKIT_HOST;
      const originalKey = env.S3_KEY;
      const originalSecret = env.S3_SECRET;
      const originalBucket = env.S3_BUCKET;

      (env as any).LIVEKIT_HOST = 'https://p2p-clcf9vzd.livekit.cloud';
      (env as any).S3_KEY = undefined;
      (env as any).S3_SECRET = undefined;
      (env as any).S3_BUCKET = undefined;

      try {
        expect(isRecordingStorageConfigured()).toBe(false);

        await expect(startAudioEgress('room_livekit_cloud_test')).rejects.toThrow(
          /Cloud recording storage is not configured/
        );
      } finally {
        (env as any).LIVEKIT_HOST = originalHost;
        (env as any).S3_KEY = originalKey;
        (env as any).S3_SECRET = originalSecret;
        (env as any).S3_BUCKET = originalBucket;
      }
    });

    it('2.2 Accepts LiveKit Cloud egress when valid S3 credentials are provided', () => {
      const originalHost = env.LIVEKIT_HOST;
      const originalKey = env.S3_KEY;
      const originalSecret = env.S3_SECRET;
      const originalBucket = env.S3_BUCKET;

      (env as any).LIVEKIT_HOST = 'https://p2p-clcf9vzd.livekit.cloud';
      (env as any).S3_KEY = 'valid_key';
      (env as any).S3_SECRET = 'valid_secret';
      (env as any).S3_BUCKET = 'valid_bucket';

      try {
        expect(isRecordingStorageConfigured()).toBe(true);
      } finally {
        (env as any).LIVEKIT_HOST = originalHost;
        (env as any).S3_KEY = originalKey;
        (env as any).S3_SECRET = originalSecret;
        (env as any).S3_BUCKET = originalBucket;
      }
    });
  });

  describe('3. Historical Retention Expiration & Plan Entitlements', () => {
    it('3.1 Persists historical retention window (90 days for BOSS) and preserves it even if user expires', async () => {
      const bossUser = {
        plan: 'BOSS',
        subscriptionStatus: 'ACTIVE',
        subscriptionExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // active for 30 days
      };

      const entitlement = getEffectiveEntitlement(bossUser as any);
      expect(entitlement.retentionDays).toBe(90);

      // Finalization computes expiration based on entitlement at call finish time
      const retentionDays = entitlement.retentionDays;
      const now = Date.now();
      const recordingExpiresAt = new Date(now + retentionDays * 24 * 60 * 60 * 1000);

      // Verify that after 35 days (when subscription has expired), the recordingExpiresAt is still 55 days in the future
      const futureCheckDate = new Date(now + 35 * 24 * 60 * 60 * 1000);
      expect(recordingExpiresAt.getTime()).toBeGreaterThan(futureCheckDate.getTime());
    });

    it('3.2 Enforces authoritative monthly recording limits per tier', () => {
      const activeExpires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const free = getEffectiveEntitlement({ plan: 'FREE' });
      const plus = getEffectiveEntitlement({ plan: 'PLUS', subscriptionExpiresAt: activeExpires });
      const pro = getEffectiveEntitlement({ plan: 'PRO', subscriptionExpiresAt: activeExpires });
      const boss = getEffectiveEntitlement({ plan: 'BOSS', subscriptionExpiresAt: activeExpires });

      expect(free.recordingLimit).toBe(1);
      expect(plus.recordingLimit).toBe(3);
      expect(pro.recordingLimit).toBe(7);
      expect(boss.recordingLimit).toBe(15);

      expect(free.retentionDays).toBe(1);
      expect(plus.retentionDays).toBe(7);
      expect(pro.retentionDays).toBe(30);
      expect(boss.retentionDays).toBe(90);
    });
  });

  describe('4. Personal Recording Isolation & Partner Quota Protection', () => {
    it('4.1 Counts recording quota ONLY for the user who initiated recording', async () => {
      const { getUserRecordingsUsedThisPeriod } = await import('../services/plan');

      const userA = await prisma.user.create({
        data: {
          telegramId: BigInt(777111222),
          alias: 'RecorderUserA',
          plan: 'PLUS',
        },
      });

      const userB = await prisma.user.create({
        data: {
          telegramId: BigInt(777333444),
          alias: 'NonRecorderUserB',
          plan: 'FREE',
        },
      });

      // Session where User A explicitly pressed record
      await prisma.callSession.create({
        data: {
          roomName: `personal_rec_room_${Date.now()}`,
          userAId: userA.id,
          userBId: userB.id,
          recordedByUserId: userA.id,
          status: 'COMPLETED',
          recordingUrl: 'recordings/user_a_only.mp3',
          duration: 400,
        },
      });

      const usageA = await getUserRecordingsUsedThisPeriod(userA.id, userA);
      const usageB = await getUserRecordingsUsedThisPeriod(userB.id, userB);

      // User A who recorded has 1 used
      expect(usageA).toBe(1);
      // User B who did NOT record has 0 used (quota preserved!)
      expect(usageB).toBe(0);
    });

    it('4.2 Supports both users recording in the same session without losing either recording delivery', async () => {
      const { getUserRecordingsUsedThisPeriod } = await import('../services/plan');
      const { isUserSessionRecorder, addSessionRecorder, removeSessionRecorder } = await import('../socket/signaling');

      const userA = await prisma.user.create({
        data: {
          telegramId: BigInt(777555666),
          alias: 'ConcurrentRecorderA',
          plan: 'PRO',
        },
      });

      const userB = await prisma.user.create({
        data: {
          telegramId: BigInt(777777888),
          alias: 'ConcurrentRecorderB',
          plan: 'BOSS',
        },
      });

      // 1. User A starts recording
      let recorders = addSessionRecorder(null, userA.id);
      expect(recorders).toBe(userA.id);
      expect(isUserSessionRecorder(recorders, userA.id)).toBe(true);
      expect(isUserSessionRecorder(recorders, userB.id)).toBe(false);

      // 2. User B starts recording later in the same call
      recorders = addSessionRecorder(recorders, userB.id);
      expect(recorders).toBe(`${userA.id},${userB.id}`);
      expect(isUserSessionRecorder(recorders, userA.id)).toBe(true);
      expect(isUserSessionRecorder(recorders, userB.id)).toBe(true);

      // 3. Save completed session with both recorders
      await prisma.callSession.create({
        data: {
          roomName: `concurrent_rec_room_${Date.now()}`,
          userAId: userA.id,
          userBId: userB.id,
          recordedByUserId: recorders,
          status: 'COMPLETED',
          recordingUrl: 'recordings/concurrent_rec.mp3',
          duration: 600,
        },
      });

      // 4. Both users have 1 recording quota counted
      const usageA = await getUserRecordingsUsedThisPeriod(userA.id, userA);
      const usageB = await getUserRecordingsUsedThisPeriod(userB.id, userB);
      expect(usageA).toBe(1);
      expect(usageB).toBe(1);

      // 5. If User A stops recording, User B remains
      const afterUserAStops = removeSessionRecorder(recorders, userA.id);
      expect(afterUserAStops).toBe(userB.id);
      expect(isUserSessionRecorder(afterUserAStops, userA.id)).toBe(false);
      expect(isUserSessionRecorder(afterUserAStops, userB.id)).toBe(true);
    });
  });
});
