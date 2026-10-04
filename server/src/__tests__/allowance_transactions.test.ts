import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReferralReward } from '@prisma/client';
import { prisma } from '../config/database';
import { env } from '../config/env';
import { getUserCallsUsedThisPeriod } from '../services/plan';
import { consumeOldestBonusCall, getActiveBonusCallsCount } from '../services/referralService';

beforeEach(() => { vi.restoreAllMocks(); });

describe('transactional allowance helpers', () => {
  it('reads call usage through the provided transaction instead of taking another pool connection', async () => {
    vi.spyOn(prisma.callSession, 'count').mockRejectedValue(new Error('Unexpected pool query'));
    const count = vi.fn(async () => 4);
    const transaction = {
      user: prisma.user,
      callSession: new Proxy(prisma.callSession, { get: (target, key) => key === 'count' ? count : Reflect.get(target, key) }),
    };
    const used = await getUserCallsUsedThisPeriod('synthetic-user', { lastCallDate: null }, transaction);
    expect(used).toBe(4);
    expect(count).toHaveBeenCalledOnce();
  });

  it('reports a lost reward claim instead of consuming an already used reward twice', async () => {
    const reward: ReferralReward = {
      id: 'synthetic-reward', userId: 'synthetic-user', referredUserId: 'synthetic-friend',
      qualifyingCallId: null, status: 'AVAILABLE', expiresAt: null, usedAt: null, createdAt: new Date(),
    };
    vi.spyOn(prisma.referralReward, 'findFirst').mockResolvedValue(reward);
    let claimed = false;
    vi.spyOn(prisma.referralReward, 'updateMany').mockImplementation(async () => {
      if (claimed) return { count: 0 };
      claimed = true;
      return { count: 1 };
    });
    const results = await Promise.all([consumeOldestBonusCall(reward.userId), consumeOldestBonusCall(reward.userId)]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it('propagates production bonus storage failures instead of fabricating zero or a failed claim', async () => {
    const previous = env.NODE_ENV;
    env.NODE_ENV = 'development';
    try {
      vi.spyOn(prisma.referralReward, 'count').mockRejectedValue(new Error('Synthetic storage unavailable'));
      vi.spyOn(prisma.referralReward, 'findFirst').mockRejectedValue(new Error('Synthetic storage unavailable'));
      await expect(getActiveBonusCallsCount('synthetic-user')).rejects.toThrow('Synthetic storage unavailable');
      await expect(consumeOldestBonusCall('synthetic-user')).rejects.toThrow('Synthetic storage unavailable');
    } finally {
      env.NODE_ENV = previous;
    }
  });

  it('also propagates explicit transaction failures in the test environment', async () => {
    vi.spyOn(prisma.callSession, 'count').mockRejectedValue(new Error('Synthetic transaction failure'));
    vi.spyOn(prisma.referralReward, 'count').mockRejectedValue(new Error('Synthetic transaction failure'));
    const transaction = { user: prisma.user, callSession: prisma.callSession, referralReward: prisma.referralReward };
    await expect(getUserCallsUsedThisPeriod('synthetic-user', { lastCallDate: null }, transaction)).rejects.toThrow('Synthetic transaction failure');
    await expect(getActiveBonusCallsCount('synthetic-user', transaction)).rejects.toThrow('Synthetic transaction failure');
  });
});
