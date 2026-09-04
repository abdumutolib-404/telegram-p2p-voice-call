import { describe, it, expect } from 'vitest';
import { prisma } from '../config/database';
import { createManualPaymentRequest, isDowngrade, PLAN_WEIGHTS } from '../services/plan';
import { matchmakingService } from '../services/matchmaking';
import { sweepZombieSessions } from '../socket/signaling';
import { getRedis } from '../config/redis';

describe('Circulation & Upgrade Lifecycle Repair Test Suite', () => {
  const testUserId = 'circ_user_' + Date.now();
  const testTgId = BigInt(9988776655);

  describe('1. Plan Upgrade & Transition Rules', () => {
    it('1.1 correctly defines plan hierarchy weights', () => {
      expect(PLAN_WEIGHTS.FREE).toBe(0);
      expect(PLAN_WEIGHTS.PLUS).toBe(1);
      expect(PLAN_WEIGHTS.PRO).toBe(2);
      expect(PLAN_WEIGHTS.BOSS).toBe(3);
    });

    it('1.2 allows valid upgrades and identifies downgrades', () => {
      // Upgrades
      expect(isDowngrade('FREE', 'PLUS')).toBe(false);
      expect(isDowngrade('PLUS', 'PRO')).toBe(false);
      expect(isDowngrade('PRO', 'BOSS')).toBe(false);
      expect(isDowngrade('PLUS', 'BOSS')).toBe(false);

      // Downgrades
      expect(isDowngrade('BOSS', 'PRO')).toBe(true);
      expect(isDowngrade('BOSS', 'PLUS')).toBe(true);
      expect(isDowngrade('BOSS', 'FREE')).toBe(true);
      expect(isDowngrade('PRO', 'PLUS')).toBe(true);
      expect(isDowngrade('PLUS', 'FREE')).toBe(true);

      // Same tier
      expect(isDowngrade('PLUS', 'PLUS')).toBe(false);
    });

    it('1.3 createManualPaymentRequest allows valid upgrade for active PLUS user to PRO', async () => {
      // Mock user with active PLUS plan
      const user = await prisma.user.create({
        data: {
          id: testUserId,
          telegramId: testTgId,
          alias: 'UpgradeTester',
          band: 6.5,
          plan: 'PLUS',
          subscriptionStatus: 'ACTIVE',
          subscriptionExpiresAt: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
        },
      });

      // Attempt upgrade to PRO
      const upgradeRes = await createManualPaymentRequest({
        userId: user.id,
        telegramId: user.telegramId,
        alias: user.alias,
        plan: 'PRO',
        uzsAmount: 99000,
      });

      expect(upgradeRes.success).toBe(true);
      expect(upgradeRes.request).toBeDefined();
      expect(upgradeRes.request?.plan).toBe('PRO');

      // Clean up the created request
      if (upgradeRes.request?.id) {
        await prisma.manualPaymentRequest.deleteMany({ where: { id: upgradeRes.request.id } });
      }
    });

    it('1.4 createManualPaymentRequest rejects duplicate same-tier repurchase for active user', async () => {
      const sameRes = await createManualPaymentRequest({
        userId: testUserId,
        telegramId: testTgId,
        alias: 'UpgradeTester',
        plan: 'PLUS',
        uzsAmount: 49000,
      });

      expect(sameRes.success).toBe(false);
      expect(sameRes.error?.code).toBe('ACTIVE_SUBSCRIPTION_EXISTS');
    });

    it('1.5 createManualPaymentRequest rejects downgrade for active PRO user to PLUS', async () => {
      // Update user to PRO
      await prisma.user.update({
        where: { id: testUserId },
        data: { plan: 'PRO' },
      });

      const downRes = await createManualPaymentRequest({
        userId: testUserId,
        telegramId: testTgId,
        alias: 'UpgradeTester',
        plan: 'PLUS',
        uzsAmount: 49000,
      });

      expect(downRes.success).toBe(false);
      expect(downRes.error?.code).toBe('ACTIVE_SUBSCRIPTION_EXISTS');

      // Cleanup test user
      await prisma.user.deleteMany({ where: { id: testUserId } });
    });
  });

  describe('2. Matchmaking Queue Restore with Priority & Band Pools', () => {
    it('2.1 restoreQueue re-registers user into bucket, band, and priority pools', async () => {
      const redis = getRedis();
      const testUser = 'restore_user_' + Date.now();
      const bucketKey = matchmakingService.getBucketKey(7.0, 'P', 'FC');

      await matchmakingService.restoreQueue(testUser, bucketKey, { band: 7.0, plan: 'BOSS' });

      // Verify bucket registration
      const inBucket = await redis.sismember(bucketKey, testUser);
      expect(inBucket).toBe(1);

      // Verify band pool registration
      const bandPoolKey = matchmakingService.getBandPoolKey(7.0);
      const inBand = await redis.sismember(bandPoolKey, testUser);
      expect(inBand).toBe(1);

      // Verify priority pool registration
      const priorityPoolKey = matchmakingService.getPriorityPoolKey('BOSS');
      const inPriority = await redis.sismember(priorityPoolKey, testUser);
      expect(inPriority).toBe(1);

      // Clean up
      await matchmakingService.cancelQueue(testUser);
    });
  });

  describe('3. Zombie Session Sweeper Circulation', () => {
    it('3.1 sweepZombieSessions cleans up stale PENDING calls without error', async () => {
      const swept = await sweepZombieSessions();
      expect(typeof swept).toBe('number');
    });
  });
});
