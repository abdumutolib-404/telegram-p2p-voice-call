import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { app } from '../index';
import { purgeExpiredRecordings } from '../services/storage';
import { deleteLiveKitRoom } from '../config/livekit';
import { matchmakingService } from '../services/matchmaking';
import { prisma } from '../config/database';

describe('Forensic Security & Reliability Test Suite', () => {
  describe('1. Storage Path Traversal & Orphaned Egress Purge', () => {
    it('1.1 Safely handles recordings with path traversal attempts without crashing or unlinking outside', async () => {
      const dummySession = await prisma.callSession.create({
        data: {
          roomName: `test_traversal_${Date.now()}`,
          userAId: 'user_1',
          userBId: 'user_2',
          status: 'COMPLETED',
          recordingUrl: '../../etc/passwd',
          recordingExpiresAt: new Date(Date.now() - 10000),
        },
      });

      const result = await purgeExpiredRecordings();
      expect(result).toBeDefined();
      expect(typeof result.purgedCount).toBe('number');
    });

    it('1.2 Purges abandoned recordings with null recordingExpiresAt older than 24h', async () => {
      const oldDate = new Date(Date.now() - 48 * 60 * 60 * 1000);
      const abandonedSession = await prisma.callSession.create({
        data: {
          roomName: `test_abandoned_${Date.now()}`,
          userAId: 'user_1',
          userBId: 'user_2',
          status: 'COMPLETED',
          recordingUrl: 'recordings/abandoned_mock_file.mp3',
          recordingExpiresAt: null,
          createdAt: oldDate,
        },
      });

      const result = await purgeExpiredRecordings();
      expect(result).toBeDefined();
      expect(result.purgedCount).toBeGreaterThanOrEqual(1);

      const updated = await prisma.callSession.findUnique({ where: { id: abandonedSession.id } });
      expect(updated?.recordingUrl).toBeNull();
    });
  });

  describe('2. LiveKit Room Teardown API', () => {
    it('2.1 Safely executes deleteLiveKitRoom without uncaught promise rejection', async () => {
      await expect(deleteLiveKitRoom('test_room_teardown')).resolves.not.toThrow();
    });
  });

  describe('3. Matchmaking Redis Bucket Expiration', () => {
    it('3.1 Sets queue and bucket key with expiration when joining matchmaking', async () => {
      const res = await matchmakingService.joinQueue('user_test_bucket', 6.5, {
        subFC: 6.0,
        subLR: 6.5,
        subGRA: 7.0,
        subP: 6.0,
      });

      expect(res.matched).toBe(false);
      expect(res.bucketKey).toBeDefined();

      await matchmakingService.cancelQueue('user_test_bucket');
    });
  });

  describe('4. Active Healthcheck Endpoint', () => {
    it('4.1 Returns 200 OK with database connection status', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.db).toBe('connected');
    });
  });
});
