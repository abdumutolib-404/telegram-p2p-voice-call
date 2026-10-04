import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma } from '../config/database';
import { getRedis } from '../config/redis';
import {
  checkAndProcessSubscriptionExpirations,
  notifyQuotaLimitReachedIfExhausted,
} from '../services/subscriptionExpiry';

describe('Automatic Subscription Expiry & Limit Reminder Suite', () => {
  const mockBot: any = {
    api: {
      sendMessage: vi.fn().mockResolvedValue({ message_id: 123 }),
    },
  };

  beforeEach(() => {
    vi.restoreAllMocks(); vi.clearAllMocks();
  });

  it('persists expiry and advance-warning notices while the bot is temporarily unavailable', async () => {
    const expired = await prisma.user.create({ data: { telegramId: 998877670n, alias: 'ExpiryOffline', plan: 'PLUS', subscriptionExpiresAt: new Date(Date.now() - 1000) } });
    const soon = await prisma.user.create({ data: { telegramId: 998877671n, alias: 'WarningOffline', plan: 'PLUS', subscriptionExpiresAt: new Date(Date.now() + 3600000) } });
    await checkAndProcessSubscriptionExpirations(null);
    expect((await prisma.user.findUnique({ where: { id: expired.id } }))?.plan).toBe('FREE');
    for (const user of [expired, soon]) expect(await prisma.notificationJob.count({ where: { telegramId: user.telegramId.toString(), status: 'QUEUED' } })).toBe(1);
    await checkAndProcessSubscriptionExpirations(mockBot);
    for (const user of [expired, soon]) expect(await prisma.notificationJob.count({ where: { telegramId: user.telegramId.toString() } })).toBe(1);
  });

  it('retries expiry when the notice cannot be durably persisted', async () => {
    const expired = await prisma.user.create({ data: { telegramId: 998877672n, alias: 'ExpiryQueueFailure', plan: 'PLUS', subscriptionExpiresAt: new Date(Date.now() - 1000) } });
    vi.spyOn(prisma.notificationJob, 'create').mockRejectedValueOnce(new Error('Synthetic notification persistence failure'));
    await checkAndProcessSubscriptionExpirations(null);
    expect((await prisma.user.findUnique({ where: { id: expired.id } }))?.plan).toBe('PLUS');
    expect(await prisma.auditLog.count({ where: { targetId: expired.id, action: 'SUBSCRIPTION_EXPIRED' } })).toBe(0);
    await checkAndProcessSubscriptionExpirations(null);
    expect((await prisma.user.findUnique({ where: { id: expired.id } }))?.plan).toBe('FREE');
    expect(await prisma.notificationJob.count({ where: { telegramId: expired.telegramId.toString() } })).toBe(1);
  });

  it('1. Reverts expired subscriptions to FREE and enqueues expiry notification', async () => {
    const expiredUser = await prisma.user.create({
      data: {
        telegramId: BigInt(998877661),
        alias: 'P2P-EXPIRED1',
        band: 7.0,
        subFC: 7.0,
        subLR: 7.0,
        subGRA: 7.0,
        subP: 7.0,
        plan: 'PLUS',
        dailyLimit: 10,
        subscriptionExpiresAt: new Date(Date.now() - 3600 * 1000), // expired 1 hour ago
      },
    });

    const res = await checkAndProcessSubscriptionExpirations(mockBot);
    expect(res.expiredCount).toBeGreaterThanOrEqual(1);

    const refreshed = await prisma.user.findUnique({ where: { id: expiredUser.id } });
    expect(refreshed?.plan).toBe('FREE');
    expect(refreshed?.dailyLimit).toBe(3);
    expect(refreshed?.subscriptionExpiresAt).toBeNull();
  });

  it('2. Sends 24-hour advance warning exactly once for expiring subscriptions', async () => {
    const expiringSoonUser = await prisma.user.create({
      data: {
        telegramId: BigInt(998877662),
        alias: 'P2P-SOON1',
        band: 7.5,
        subFC: 7.5,
        subLR: 7.5,
        subGRA: 7.5,
        subP: 7.5,
        plan: 'PRO',
        dailyLimit: 25,
        subscriptionExpiresAt: new Date(Date.now() + 12 * 3600 * 1000), // expires in 12 hours
      },
    });

    // First run should send warning
    const res1 = await checkAndProcessSubscriptionExpirations(mockBot);
    expect(res1.warnedCount).toBeGreaterThanOrEqual(1);

    // Second run should deduplicate against the saved notification and queue no additional warnings.
    const res2 = await checkAndProcessSubscriptionExpirations(mockBot);
    expect(res2.warnedCount).toBe(0);

    const userStillPro = await prisma.user.findUnique({ where: { id: expiringSoonUser.id } });
    expect(userStillPro?.plan).toBe('PRO'); // still PRO until actually expired
  });

  it('3. Sends monthly limit reached notification when quota is exhausted', async () => {
    const freeUser = await prisma.user.create({
      data: {
        telegramId: BigInt(998877663),
        alias: 'P2P-QUOTA1',
        band: 6.5,
        subFC: 6.5,
        subLR: 6.5,
        subGRA: 6.5,
        subP: 6.5,
        plan: 'FREE',
        dailyLimit: 3,
      },
    });

    // Create 3 completed call sessions (limit is 3 for FREE)
    for (let i = 0; i < 3; i++) {
      await prisma.callSession.create({
        data: {
          userAId: freeUser.id,
          userBId: 'dummy-partner-' + i,
          status: 'COMPLETED',
          duration: 300,
          startedAt: new Date(),
          endedAt: new Date(),
        },
      });
    }

    const notified = await notifyQuotaLimitReachedIfExhausted(mockBot, freeUser.id);
    expect(notified).toBe(true);

    // Duplicate notification within 24h is suppressed by Redis lock
    const notifiedAgain = await notifyQuotaLimitReachedIfExhausted(mockBot, freeUser.id);
    expect(notifiedAgain).toBe(false);
  });
});
