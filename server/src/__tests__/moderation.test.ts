import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { moderationService } from '../services/moderation';
import { prisma } from '../config/database';
import { getRedis } from '../config/redis';

describe('Moderation Penalty Ladder', () => {
  let userAId: string;
  let userBId: string;
  let callSessionId: string;

  beforeAll(async () => {
    // Create test users in DB
    const userA = await prisma.user.create({
      data: {
        telegramId: BigInt(99990001),
        alias: 'P2P-Partner-ModA',
        band: 6.5,
        onboarded: true,
      },
    });

    const userB = await prisma.user.create({
      data: {
        telegramId: BigInt(99990002),
        alias: 'P2P-Partner-ModB',
        band: 6.5,
        onboarded: true,
      },
    });

    userAId = userA.id;
    userBId = userB.id;

    const call = await prisma.callSession.create({
      data: {
        roomName: 'room_mod_test_1',
        userAId,
        userBId,
        status: 'COMPLETED',
      },
    });

    callSessionId = call.id;
  });

  afterAll(async () => {
    await prisma.callRating.deleteMany({ where: { callId: callSessionId } });
    await prisma.callSession.deleteMany({ where: { id: callSessionId } });
    await prisma.user.deleteMany({ where: { id: { in: [userAId, userBId] } } });
  });

  it('1st and 2nd reports issue warning notice', async () => {
    const call1 = await prisma.callSession.create({
      data: { roomName: 'room_mod_test_1', userAId, userBId, status: 'COMPLETED' },
    });
    const res1 = await moderationService.processReport(userBId, userAId, call1.id, 'Inappropriate language');

    expect(res1.penaltyLevel).toBe('WARNING');
    expect(res1.warningCount).toBe(1);
    expect(res1.isPermanentlyBanned).toBe(false);

    const banCheck1 = await moderationService.isUserBanned(userBId);
    expect(banCheck1.banned).toBe(false);

    const call2 = await prisma.callSession.create({
      data: { roomName: 'room_mod_test_2', userAId, userBId, status: 'COMPLETED' },
    });
    const res2 = await moderationService.processReport(userBId, userAId, call2.id, 'Second offense');
    expect(res2.penaltyLevel).toBe('WARNING');
    expect(res2.warningCount).toBe(2);

    const banCheck2 = await moderationService.isUserBanned(userBId);
    expect(banCheck2.banned).toBe(false);
  });

  it('3rd report triggers 6-hour temporary ban', async () => {
    const call3 = await prisma.callSession.create({
      data: { roomName: 'room_mod_test_3', userAId, userBId, status: 'COMPLETED' },
    });
    const res3 = await moderationService.processReport(userBId, userAId, call3.id, 'Spamming');

    expect(res3.penaltyLevel).toBe('TEMP_BAN');
    expect(res3.warningCount).toBe(3);
    expect(res3.bannedUntil).toBeDefined();

    const banCheck = await moderationService.isUserBanned(userBId);
    expect(banCheck.banned).toBe(true);
    expect(banCheck.reason).toContain('Temporarily suspended');
  });

  it('5th report triggers permanent lock', async () => {
    const call4 = await prisma.callSession.create({
      data: { roomName: 'room_mod_test_4', userAId, userBId, status: 'COMPLETED' },
    });
    await moderationService.processReport(userBId, userAId, call4.id, 'Fourth offense');

    const call5 = await prisma.callSession.create({
      data: { roomName: 'room_mod_test_5', userAId, userBId, status: 'COMPLETED' },
    });
    const res5 = await moderationService.processReport(userBId, userAId, call5.id, 'Severe persistent abuse');

    expect(res5.penaltyLevel).toBe('PERM_BAN');
    expect(res5.warningCount).toBe(5);
    expect(res5.isPermanentlyBanned).toBe(true);

    const banCheck = await moderationService.isUserBanned(userBId);
    expect(banCheck.banned).toBe(true);
    expect(banCheck.reason).toContain('Permanently banned');
  });

  it('invalidates bot ban check cache on ban, unban, and appeal status change', async () => {
    const redis = getRedis();
    const telegramId = BigInt(99990002);
    const cacheKey = `bot:ban_check:${telegramId}`;

    // 1. Seed cache with CLEAN
    await redis.set(cacheKey, 'CLEAN');
    expect(await redis.get(cacheKey)).toBe('CLEAN');

    // 2. Explicitly invalidate
    await moderationService.invalidateBanCache(telegramId);
    expect(await redis.get(cacheKey)).toBeNull();

    // 3. Unban user and verify cache invalidation
    await redis.set(cacheKey, 'CLEAN');
    await moderationService.unbanUser(userBId);
    expect(await redis.get(cacheKey)).toBeNull();

    // 4. Ban user and verify cache invalidation
    await redis.set(cacheKey, 'CLEAN');
    await moderationService.banUser(userBId, true);
    expect(await redis.get(cacheKey)).toBeNull();

    // 5. Update appeal status and verify cache invalidation
    const appeal = await prisma.unblockAppeal.create({
      data: {
        userId: userBId,
        telegramId,
        alias: 'P2P-Partner-ModB',
        appealText: 'Please unban me',
        banReason: 'Test ban',
        status: 'PENDING',
      },
    });

    await redis.set(cacheKey, 'CLEAN');
    await moderationService.updateAppealStatus(appeal.id, 'APPROVED');
    expect(await redis.get(cacheKey)).toBeNull();

    await prisma.unblockAppeal.deleteMany({ where: { id: appeal.id } });
  });
});
