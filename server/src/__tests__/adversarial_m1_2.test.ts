import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { matchmakingService, determineWeakAndStrongSkills } from '../services/matchmaking';
import { inMemoryRedis } from '../config/redis';
import { calculateMixedPlanDuration, getRetentionDaysForPlan, getPlansConfig, updatePlansConfig } from '../services/plan';
import { moderationService } from '../services/moderation';
import { prisma } from '../config/database';

describe('Adversarial Stress Test Suite - Milestone M1 (Challenger 2)', () => {

  // =========================================================================
  // SECTION 1: O(1) Redis Bucket Matchmaking Queue Stress & Edge Cases
  // =========================================================================
  describe('1. Redis Bucket Matchmaking Queue Stress & Edge Cases', () => {
    beforeEach(async () => {
      await inMemoryRedis.flushall();
    });

    it('1.1 Band rounding precision and boundary conditions (0.5 rounding)', () => {
      // Test rounding across half-band boundaries
      expect(matchmakingService.getBandKey(5.0)).toBe('5.0');
      expect(matchmakingService.getBandKey(5.24)).toBe('5.0');
      expect(matchmakingService.getBandKey(5.25)).toBe('5.5');
      expect(matchmakingService.getBandKey(5.74)).toBe('5.5');
      expect(matchmakingService.getBandKey(5.75)).toBe('6.0');
      expect(matchmakingService.getBandKey(6.0)).toBe('6.0');
      expect(matchmakingService.getBandKey(8.99)).toBe('9.0');
      expect(matchmakingService.getBandKey(0.0)).toBe('0.0');

      // Verify bucket keys format
      const key1 = matchmakingService.getBucketKey(6.25, 'FC', 'LR');
      expect(key1).toBe('match_queue:6.5:FC:LR');

      const key2 = matchmakingService.getBucketKey(6.24, 'FC', 'LR');
      expect(key2).toBe('match_queue:6.0:FC:LR');
    });

    it('1.2 Skill determination with tied scores and skill separation', () => {
      // All equal sub-scores
      const equalSkills = { subFC: 6.5, subLR: 6.5, subGRA: 6.5, subP: 6.5 };
      const resEqual = determineWeakAndStrongSkills(equalSkills);
      expect(resEqual.weakSkill).toBe('FC');
      expect(resEqual.strongSkill).toBe('P');
      expect(resEqual.weakSkill).not.toBe(resEqual.strongSkill);

      // Distinct min and max
      const mixedSkills = { subFC: 8.0, subLR: 5.0, subGRA: 6.5, subP: 7.0 };
      const resMixed = determineWeakAndStrongSkills(mixedSkills);
      expect(resMixed.weakSkill).toBe('LR');
      expect(resMixed.strongSkill).toBe('FC');
    });

    it('1.3 High-concurrency matching stress test (100 complementary user pairs)', async () => {
      const NUM_PAIRS = 100;
      const groupA: Array<{ id: string; band: number; skills: unknown }> = [];
      const groupB: Array<{ id: string; band: number; skills: unknown }> = [];

      for (let i = 0; i < NUM_PAIRS; i++) {
        groupA.push({
          id: `stress_user_a_${i}`,
          band: 6.5,
          skills: { subFC: 5.0, subLR: 7.5, subGRA: 6.5, subP: 6.5 }, // Weak FC, Strong LR -> Queue: 6.5:FC:LR
        });
        groupB.push({
          id: `stress_user_b_${i}`,
          band: 6.5,
          skills: { subFC: 7.5, subLR: 5.0, subGRA: 6.5, subP: 6.5 }, // Weak LR, Strong FC -> Bucket to POP: 6.5:FC:LR
        });
      }

      // 1. Group A all join queue (should all be queued without immediate match)
      const groupAResults = await Promise.all(
        groupA.map((u) => matchmakingService.joinQueue(u.id, u.band, u.skills))
      );

      for (const res of groupAResults) {
        expect(res.matched).toBe(false);
        expect(res.bucketKey).toBe('match_queue:6.5:FC:LR');
      }

      // Verify Redis set size for Group A bucket
      const membersBefore = await inMemoryRedis.smembers('match_queue:6.5:FC:LR');
      expect(membersBefore.length).toBe(NUM_PAIRS);

      // 2. Group B all join concurrently (all 100 should find complementary match from Group A)
      const groupBResults = await Promise.all(
        groupB.map((u) => matchmakingService.joinQueue(u.id, u.band, u.skills))
      );

      const matchedPartners = new Set<string>();
      for (const res of groupBResults) {
        expect(res.matched).toBe(true);
        expect(res.partnerId).toBeDefined();
        expect(res.roomName).toBeDefined();
        matchedPartners.add(res.partnerId!);
      }

      // Verify all 100 Group A users were uniquely matched without duplicates
      expect(matchedPartners.size).toBe(NUM_PAIRS);

      // Verify Redis queue is completely drained
      const membersAfter = await inMemoryRedis.smembers('match_queue:6.5:FC:LR');
      expect(membersAfter.length).toBe(0);
    });

    it('1.4 Instant cancellation and idempotency under queueing', async () => {
      const userId = 'cancel_stress_user_1';
      const skills = { subFC: 5.5, subLR: 7.0, subGRA: 6.5, subP: 6.5 };

      // Join queue
      const joinRes = await matchmakingService.joinQueue(userId, 7.0, skills);
      expect(joinRes.matched).toBe(false);
      expect(await inMemoryRedis.get(`user_queue:${userId}`)).toBe('match_queue:7.0:FC:LR');

      // First cancel returns true
      const cancel1 = await matchmakingService.cancelQueue(userId);
      expect(cancel1).toBe(true);

      // Subsequent cancel returns false (idempotent)
      const cancel2 = await matchmakingService.cancelQueue(userId);
      expect(cancel2).toBe(false);

      // Verify clean Redis state
      expect(await inMemoryRedis.get(`user_queue:${userId}`)).toBeNull();
      const membersAfter = await inMemoryRedis.smembers('match_queue:7.0:FC:LR');
      expect(membersAfter.length).toBe(0);

      // Re-joining queue should work cleanly after cancel
      const rejoinRes = await matchmakingService.joinQueue(userId, 7.0, skills);
      expect(rejoinRes.matched).toBe(false);
      expect(await inMemoryRedis.get(`user_queue:${userId}`)).toBe('match_queue:7.0:FC:LR');
    });

    it('1.5 No cross-talk between distant band brackets', async () => {
      // User A in Band 6.0 (Weak FC, Strong LR)
      const userA = { id: 'band_60_user', band: 6.0, skills: { subFC: 5.0, subLR: 8.0, subGRA: 6.5, subP: 6.5 } };
      // User B in Band 8.5 (Weak LR, Strong FC)
      const userB = { id: 'band_85_user', band: 8.5, skills: { subFC: 8.0, subLR: 5.0, subGRA: 6.5, subP: 6.5 } };

      await matchmakingService.joinQueue(userA.id, userA.band, userA.skills);
      const resB = await matchmakingService.joinQueue(userB.id, userB.band, userB.skills);

      // Should NOT match because bands are 6.0 vs 8.5 (diff > 1.0)
      expect(resB.matched).toBe(false);
    });

    it('1.6 Socket disconnect cleanup removes queued user from Redis', async () => {
      const userId = 'socket_disconnect_user';
      const skills = { subFC: 5.0, subLR: 8.0, subGRA: 6.5, subP: 6.5 };

      await matchmakingService.joinQueue(userId, 6.5, skills);
      const membersBefore = await inMemoryRedis.smembers('match_queue:6.5:FC:LR');
      expect(membersBefore.length).toBe(1);

      // Simulate socket disconnect handler execution
      await matchmakingService.cancelQueue(userId);

      // Redis bucket must be empty
      const membersAfter = await inMemoryRedis.smembers('match_queue:6.5:FC:LR');
      expect(membersAfter.length).toBe(0);
      expect(await inMemoryRedis.get(`user_queue:${userId}`)).toBeNull();
    });
  });

  // =========================================================================
  // SECTION 2: Mixed-Plan Call Duration & Retention Stress & Matrix
  // =========================================================================
  describe('2. Mixed-Plan Call Duration & Retention Matrix', () => {
    it('2.1 Exhaustive tier combination matrix testing max(limit_A, limit_B)', () => {
      // Matrix of expected max durations
      const expectedDurations: Record<string, Record<string, number>> = {
        FREE: { FREE: 15, PLUS: 30, PRO: 60 },
        PLUS: { FREE: 30, PLUS: 30, PRO: 60 },
        PRO:  { FREE: 60, PLUS: 60, PRO: 60 },
      };

      const tiers = ['FREE', 'PLUS', 'PRO'];
      for (const tierA of tiers) {
        for (const tierB of tiers) {
          const calculated = calculateMixedPlanDuration(tierA, tierB);
          const expected = expectedDurations[tierA][tierB];
          expect(calculated).toBe(expected);
        }
      }
    });

    it('2.2 Case insensitivity and unknown plan fallback handling', () => {
      expect(calculateMixedPlanDuration('free', 'pro')).toBe(60);
      expect(calculateMixedPlanDuration('Plus', 'FREE')).toBe(30);
      expect(calculateMixedPlanDuration('INVALID_PLAN', 'PRO')).toBe(60);
      expect(calculateMixedPlanDuration('UNKNOWN', 'INVALID')).toBe(15);
    });

    it('2.3 Exhaustive retention policy per tier and mixed call max retention', () => {
      expect(getRetentionDaysForPlan('FREE')).toBe(1);
      expect(getRetentionDaysForPlan('PLUS')).toBe(7);
      expect(getRetentionDaysForPlan('PRO')).toBe(30);

      // Mixed call max retention: max(retention_A, retention_B)
      const maxRetentionFreePlus = Math.max(getRetentionDaysForPlan('FREE'), getRetentionDaysForPlan('PLUS'));
      expect(maxRetentionFreePlus).toBe(7);

      const maxRetentionFreePro = Math.max(getRetentionDaysForPlan('FREE'), getRetentionDaysForPlan('PRO'));
      expect(maxRetentionFreePro).toBe(30);

      const maxRetentionPlusPro = Math.max(getRetentionDaysForPlan('PLUS'), getRetentionDaysForPlan('PRO'));
      expect(maxRetentionPlusPro).toBe(30);
    });

    it('2.4 Dynamic admin plan configuration updates propagate instantly', () => {
      // Admin updates FREE tier maxDuration to 25 and retention to 3
      updatePlansConfig({
        FREE: { maxDuration: 25, dailyLimit: 5, retentionDays: 3, starsPrice: 0 },
      });

      expect(getPlansConfig().FREE.maxDuration).toBe(25);
      expect(calculateMixedPlanDuration('FREE', 'FREE')).toBe(25);
      expect(calculateMixedPlanDuration('FREE', 'PLUS')).toBe(30); // max(25, 30) = 30
      expect(getRetentionDaysForPlan('FREE')).toBe(3);

      // Reset to standard defaults
      updatePlansConfig({
        FREE: { maxDuration: 15, dailyLimit: 3, retentionDays: 1, starsPrice: 0 },
      });
      expect(getPlansConfig().FREE.maxDuration).toBe(15);
    });
  });

  // =========================================================================
  // SECTION 3: Moderation Penalty Escalation Ladder Stress Test
  // =========================================================================
  describe('3. Moderation Penalty Escalation Ladder', () => {
    let targetUser: unknown;
    let reporterUser: unknown;
    let callSession: unknown;

    beforeAll(async () => {
      targetUser = await prisma.user.create({
        data: {
          telegramId: BigInt(88880001),
          alias: 'ModTargetUser',
          band: 6.0,
          onboarded: true,
        },
      });

      reporterUser = await prisma.user.create({
        data: {
          telegramId: BigInt(88880002),
          alias: 'ModReporterUser',
          band: 6.0,
          onboarded: true,
        },
      });

      callSession = await prisma.callSession.create({
        data: {
          roomName: 'room_adv_mod_test',
          userAId: targetUser.id,
          userBId: reporterUser.id,
          status: 'COMPLETED',
        },
      });
    });

    afterAll(async () => {
      await prisma.callRating.deleteMany({ where: { callId: callSession.id } });
      await prisma.callSession.deleteMany({ where: { id: callSession.id } });
      await prisma.user.deleteMany({ where: { id: { in: [targetUser.id, reporterUser.id] } } });
    });

    it('3.1 Step 1: 1st report triggers Warning notice only', async () => {
      const call = await prisma.callSession.create({
        data: { roomName: `room_mod_test_step_1`, userAId: targetUser.id, userBId: reporterUser.id, status: 'COMPLETED' },
      });
      const res1 = await moderationService.processReport(targetUser.id, reporterUser.id, call.id, '1st report reason');

      expect(res1.penaltyLevel).toBe('WARNING');
      expect(res1.warningCount).toBe(1);
      expect(res1.isPermanentlyBanned).toBe(false);
      expect(res1.bannedUntil).toBeUndefined();

      const banCheck = await moderationService.isUserBanned(targetUser.id);
      expect(banCheck.banned).toBe(false);
    });

    it('3.2 Step 2: 2nd report issues 2nd Warning (not banned yet)', async () => {
      const call = await prisma.callSession.create({
        data: { roomName: `room_mod_test_step_2`, userAId: targetUser.id, userBId: reporterUser.id, status: 'COMPLETED' },
      });
      const res2 = await moderationService.processReport(targetUser.id, reporterUser.id, call.id, '2nd report reason');

      expect(res2.penaltyLevel).toBe('WARNING');
      expect(res2.warningCount).toBe(2);
      expect(res2.isPermanentlyBanned).toBe(false);

      const banCheck = await moderationService.isUserBanned(targetUser.id);
      expect(banCheck.banned).toBe(false);
    });

    it('3.3 Step 3: 3rd report triggers 6-hour Temporary Ban', async () => {
      const call = await prisma.callSession.create({
        data: { roomName: `room_mod_test_step_3`, userAId: targetUser.id, userBId: reporterUser.id, status: 'COMPLETED' },
      });
      const res3 = await moderationService.processReport(targetUser.id, reporterUser.id, call.id, '3rd report reason');

      expect(res3.penaltyLevel).toBe('TEMP_BAN');
      expect(res3.warningCount).toBe(3);
      expect(res3.bannedUntil).toBeDefined();
      expect(res3.isPermanentlyBanned).toBe(false);

      const banCheck = await moderationService.isUserBanned(targetUser.id);
      expect(banCheck.banned).toBe(true);
      expect(banCheck.reason).toContain('Temporarily suspended');
    });

    it('3.4 Step 4: Auto-unban after temporary ban expiry', async () => {
      // Simulate ban expiry by manually setting bannedUntil 1 hour in the past
      await prisma.user.update({
        where: { id: targetUser.id },
        data: {
          bannedUntil: new Date(Date.now() - 3600 * 1000), // 1 hour ago
        },
      });

      // Checking ban status should detect expiry, clear ban flags in DB, and return banned: false
      const banCheck = await moderationService.isUserBanned(targetUser.id);
      expect(banCheck.banned).toBe(false);

      // Verify DB record was updated by isUserBanned auto-resolution
      const dbUser = await prisma.user.findUnique({ where: { id: targetUser.id } });
      expect(dbUser?.isBanned).toBe(false);
      expect(dbUser?.bannedUntil).toBeNull();
    });

    it('3.5 Step 5: 5th report triggers Permanent Lock', async () => {
      const call4 = await prisma.callSession.create({
        data: { roomName: `room_mod_test_step_4`, userAId: targetUser.id, userBId: reporterUser.id, status: 'COMPLETED' },
      });
      await moderationService.processReport(targetUser.id, reporterUser.id, call4.id, '4th report reason');

      const call5 = await prisma.callSession.create({
        data: { roomName: `room_mod_test_step_5`, userAId: targetUser.id, userBId: reporterUser.id, status: 'COMPLETED' },
      });
      const res5 = await moderationService.processReport(targetUser.id, reporterUser.id, call5.id, '5th report reason');

      expect(res5.penaltyLevel).toBe('PERM_BAN');
      expect(res5.warningCount).toBe(5);
      expect(res5.isPermanentlyBanned).toBe(true);

      const banCheck = await moderationService.isUserBanned(targetUser.id);
      expect(banCheck.banned).toBe(true);
      expect(banCheck.reason).toContain('Permanently banned');
    });

    it('3.6 Step 6: Permanent Lock persists on additional reports and cannot auto-expire', async () => {
      const call6 = await prisma.callSession.create({
        data: { roomName: `room_mod_test_step_6`, userAId: targetUser.id, userBId: reporterUser.id, status: 'COMPLETED' },
      });
      const res6 = await moderationService.processReport(targetUser.id, reporterUser.id, call6.id, '6th report reason');

      expect(res6.penaltyLevel).toBe('PERM_BAN');
      expect(res6.warningCount).toBe(6);
      expect(res6.isPermanentlyBanned).toBe(true);

      // Even if bannedUntil is set to the past, permanent ban overrules
      await prisma.user.update({
        where: { id: targetUser.id },
        data: { bannedUntil: new Date(Date.now() - 3600 * 1000) },
      });

      const banCheck = await moderationService.isUserBanned(targetUser.id);
      expect(banCheck.banned).toBe(true);
      expect(banCheck.reason).toContain('Permanently banned');
    });
  });
});
