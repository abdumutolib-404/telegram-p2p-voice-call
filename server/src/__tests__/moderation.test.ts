import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { moderationService } from '../services/moderation';
import { prisma } from '../config/database';

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

  it('1st report issues warning notice', async () => {
    const call = await prisma.callSession.create({
      data: { roomName: 'room_mod_test_1', userAId, userBId, status: 'COMPLETED' },
    });
    const res1 = await moderationService.processReport(userBId, userAId, call.id, 'Inappropriate language');

    expect(res1.penaltyLevel).toBe('WARNING');
    expect(res1.warningCount).toBe(1);
    expect(res1.isPermanentlyBanned).toBe(false);

    const banCheck = await moderationService.isUserBanned(userBId);
    expect(banCheck.banned).toBe(false);
  });

  it('2nd report triggers 6-hour temporary ban', async () => {
    const call = await prisma.callSession.create({
      data: { roomName: 'room_mod_test_2', userAId, userBId, status: 'COMPLETED' },
    });
    const res2 = await moderationService.processReport(userBId, userAId, call.id, 'Spamming');

    expect(res2.penaltyLevel).toBe('TEMP_BAN');
    expect(res2.warningCount).toBe(2);
    expect(res2.bannedUntil).toBeDefined();

    const banCheck = await moderationService.isUserBanned(userBId);
    expect(banCheck.banned).toBe(true);
    expect(banCheck.reason).toContain('Temporarily suspended');
  });

  it('3rd report triggers permanent lock', async () => {
    const call = await prisma.callSession.create({
      data: { roomName: 'room_mod_test_3', userAId, userBId, status: 'COMPLETED' },
    });
    const res3 = await moderationService.processReport(userBId, userAId, call.id, 'Severe abuse');

    expect(res3.penaltyLevel).toBe('PERM_BAN');
    expect(res3.warningCount).toBe(3);
    expect(res3.isPermanentlyBanned).toBe(true);

    const banCheck = await moderationService.isUserBanned(userBId);
    expect(banCheck.banned).toBe(true);
    expect(banCheck.reason).toContain('Permanently banned');
  });
});
