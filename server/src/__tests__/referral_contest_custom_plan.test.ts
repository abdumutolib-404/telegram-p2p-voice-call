import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../config/database';
import {
  bindReferral,
  onCallFinishedCheckReferralReward,
  getActiveBonusCallsCount,
  consumeOldestBonusCall,
  getReferralStats,
  getContestStatus,
} from '../services/referralService';
import { getEffectiveEntitlement } from '../services/plan';

describe('Referral Engine, Hall of Fame & Custom Plan Maker Test Suite', () => {
  beforeEach(async () => {
    // Clear mock storage where applicable
  });

  describe('1. Referral Registration & Anti-Abuse Guards', () => {
    it('1.1 Binds referral correctly to a valid inviter by Telegram ID', async () => {
      const inviter = await prisma.user.create({
        data: {
          telegramId: 11111111n,
          alias: 'P2P-Inviter1',
          plan: 'FREE',
          onboarded: true,
        },
      });

      const invited = await prisma.user.create({
        data: {
          telegramId: 22222222n,
          alias: 'P2P-InvitedFriend',
          plan: 'FREE',
          onboarded: false,
        },
      });

      const result = await bindReferral(22222222n, 'ref_11111111');
      expect(result.success).toBe(true);
      expect(result.inviterAlias).toBe(inviter.alias);

      const refreshed = await prisma.user.findUnique({ where: { id: invited.id } });
      expect(refreshed?.referredByUserId).toBe(inviter.id);
    });

    it('1.2 Strictly prevents self-referrals', async () => {
      const user = await prisma.user.create({
        data: {
          telegramId: 33333333n,
          alias: 'P2P-SelfReferrer',
          plan: 'FREE',
          onboarded: true,
        },
      });

      const result = await bindReferral(33333333n, 'ref_33333333');
      expect(result.success).toBe(false);

      const refreshed = await prisma.user.findUnique({ where: { id: user.id } });
      expect(refreshed?.referredByUserId).toBeFalsy();
    });

    it('1.3 Prevents re-referral of an already referred user', async () => {
      const inviter1 = await prisma.user.create({
        data: {
          telegramId: 44444444n,
          alias: 'P2P-FirstInviter',
          plan: 'FREE',
        },
      });

      const inviter2 = await prisma.user.create({
        data: {
          telegramId: 55555555n,
          alias: 'P2P-SecondInviter',
          plan: 'FREE',
        },
      });

      const friend = await prisma.user.create({
        data: {
          telegramId: 66666666n,
          alias: 'P2P-FriendOnce',
          plan: 'FREE',
        },
      });

      // First bind succeeds
      const res1 = await bindReferral(66666666n, 'ref_44444444');
      expect(res1.success).toBe(true);

      // Second bind attempt fails
      const res2 = await bindReferral(66666666n, 'ref_55555555');
      expect(res2.success).toBe(false);

      const refreshed = await prisma.user.findUnique({ where: { id: friend.id } });
      expect(refreshed?.referredByUserId).toBe(inviter1.id);
    });
  });

  describe('2. Qualifying Call Rewards (Duration >= 30s) & Expiration', () => {
    it('2.1 Does not grant reward if call duration is under 30 seconds', async () => {
      const inviter = await prisma.user.create({
        data: { telegramId: 77777777n, alias: 'P2P-InviterShort', plan: 'FREE' },
      });
      const friend = await prisma.user.create({
        data: { telegramId: 88888888n, alias: 'P2P-FriendShort', plan: 'FREE', referredByUserId: inviter.id },
      });
      const partner = await prisma.user.create({
        data: { telegramId: 99999999n, alias: 'P2P-PartnerRandom', plan: 'FREE' },
      });

      await onCallFinishedCheckReferralReward({
        id: 'call_session_short',
        userAId: friend.id,
        userBId: partner.id,
        duration: 25, // Less than 30s
      });

      const bonusCalls = await getActiveBonusCallsCount(inviter.id);
      expect(bonusCalls).toBe(0);
    });

    it('2.2 Grants 1 bonus call valid for 7 days when duration is >= 30s', async () => {
      const inviter = await prisma.user.create({
        data: { telegramId: 10101010n, alias: 'P2P-InviterValid', plan: 'FREE' },
      });
      const friend = await prisma.user.create({
        data: { telegramId: 20202020n, alias: 'P2P-FriendValid', plan: 'FREE', referredByUserId: inviter.id },
      });
      const partner = await prisma.user.create({
        data: { telegramId: 30303030n, alias: 'P2P-PartnerGood', plan: 'FREE' },
      });

      await onCallFinishedCheckReferralReward({
        id: 'call_session_qualifying',
        userAId: friend.id,
        userBId: partner.id,
        duration: 45, // >= 30s
      });

      const bonusCalls = await getActiveBonusCallsCount(inviter.id);
      expect(bonusCalls).toBe(1);

      const stats = await getReferralStats(inviter.id);
      expect(stats.activeBonusCalls).toBe(1);
      expect(stats.qualifyingCompleted).toBe(1);
      expect(stats.rewards[0].status).toBe('AVAILABLE');

      // 2.3 Subsequent calls by the same friend do NOT grant a second reward
      await onCallFinishedCheckReferralReward({
        id: 'call_session_second',
        userAId: friend.id,
        userBId: partner.id,
        duration: 120,
      });

      const bonusCallsAfter = await getActiveBonusCallsCount(inviter.id);
      expect(bonusCallsAfter).toBe(1);
    });
  });

  describe('3. FIFO Bonus Calls Consumption', () => {
    it('3.1 Consumes bonus calls in strict FIFO order (earliest expiration first)', async () => {
      const user = await prisma.user.create({
        data: { telegramId: 40404040n, alias: 'P2P-BonusUser', plan: 'FREE' },
      });

      const now = new Date();
      const earlierExp = new Date(now.getTime() + 2 * 86400000); // 2 days
      const laterExp = new Date(now.getTime() + 6 * 86400000); // 6 days

      const r1 = await prisma.referralReward.create({
        data: {
          userId: user.id,
          referredUserId: 'dummy_friend_1',
          status: 'AVAILABLE',
          expiresAt: laterExp,
        },
      });

      const r2 = await prisma.referralReward.create({
        data: {
          userId: user.id,
          referredUserId: 'dummy_friend_2',
          status: 'AVAILABLE',
          expiresAt: earlierExp,
        },
      });

      expect(await getActiveBonusCallsCount(user.id)).toBe(2);

      // Consume one bonus call
      const consumed = await consumeOldestBonusCall(user.id);
      expect(consumed).toBe(true);
      expect(await getActiveBonusCallsCount(user.id)).toBe(1);

      // Verify the earlier expiring one (r2) was marked USED
      const checkR2 = await prisma.referralReward.findUnique({ where: { id: r2.id } });
      const checkR1 = await prisma.referralReward.findUnique({ where: { id: r1.id } });

      expect(checkR2?.status).toBe('USED');
      expect(checkR1?.status).toBe('AVAILABLE');
    });
  });

  describe('4. Ephemeral Contest & Hall of Fame Leaderboard', () => {
    it('4.1 Aggregates leaderboard correctly for active contest window', async () => {
      // Create contest with fresh timestamp
      const contestStart = new Date(Date.now() + 50);
      await prisma.contest.create({
        data: {
          title: 'Autumn 2026 Contest',
          description: 'Top referrers win exclusive plans!',
          prizes: '🥇 1st: 60d VIP\n🥈 2nd: 30d BOSS',
          isActive: true,
          startsAt: contestStart,
        },
      });

      const topUser = await prisma.user.create({
        data: { telegramId: 50505050n, alias: 'P2P-ChampUser', plan: 'FREE' },
      });
      const runnerUp = await prisma.user.create({
        data: { telegramId: 60606060n, alias: 'P2P-RunnerUpUser', plan: 'FREE' },
      });

      // Grant 3 rewards to topUser, 1 to runnerUp within contest window
      for (let i = 0; i < 3; i++) {
        await prisma.referralReward.create({
          data: {
            userId: topUser.id,
            referredUserId: `f_top_${i}`,
            status: 'AVAILABLE',
            expiresAt: new Date(Date.now() + 7 * 86400000),
            createdAt: new Date(contestStart.getTime() + 100 + i),
          },
        });
      }

      await prisma.referralReward.create({
        data: {
          userId: runnerUp.id,
          referredUserId: 'f_runner_1',
          status: 'AVAILABLE',
          expiresAt: new Date(Date.now() + 7 * 86400000),
          createdAt: new Date(contestStart.getTime() + 200),
        },
      });

      const status = await getContestStatus();
      expect(status.isActive).toBe(true);
      expect(status.contest?.title).toBe('Autumn 2026 Contest');
      expect(status.leaderboard.length).toBe(2);
      expect(status.leaderboard[0].alias).toBe(topUser.alias);
      expect(status.leaderboard[0].invitesCount).toBe(3);
      expect(status.leaderboard[1].alias).toBe(runnerUp.alias);
      expect(status.leaderboard[1].invitesCount).toBe(1);
    });

    it('4.2 Returns isActive: false when no contest is currently active', async () => {
      await prisma.contest.updateMany({
        data: { isActive: false },
      });

      const status = await getContestStatus();
      expect(status.isActive).toBe(false);
      expect(status.contest).toBeNull();
      expect(status.leaderboard).toHaveLength(0);
    });
  });

  describe('5. Custom Plan Maker & Overrides', () => {
    it('5.1 Accurately computes custom entitlements with custom duration, recording limits, and plan label', async () => {
      const customUser = {
        id: 'u_custom_1',
        telegramId: 70707070n,
        alias: 'P2P-VIPWinner',
        plan: 'BOSS',
        customPlanName: '🥇 Contest 1st Place (VIP)',
        dailyLimit: 50,
        maxDuration: 90,
        retentionOverride: 90,
        recordingLimitOverride: 15,
        subscriptionStatus: 'ACTIVE',
        subscriptionExpiresAt: new Date(Date.now() + 60 * 86400000),
      };

      const entitlement = getEffectiveEntitlement(customUser);
      expect(entitlement.planDisplayName).toBe('🥇 Contest 1st Place (VIP)');
      expect(entitlement.dailyLimit).toBe(50);
      expect(entitlement.maxDurationMinutes).toBe(90);
      expect(entitlement.retentionDays).toBe(90);
      expect(entitlement.recordingLimit).toBe(15);
      expect(entitlement.source).toBe('CUSTOM_PLAN');
    });
  });
});
