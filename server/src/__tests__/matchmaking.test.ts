import { describe, it, expect, beforeEach } from 'vitest';
import { matchmakingService, determineWeakAndStrongSkills } from '../services/matchmaking';
import { inMemoryRedis } from '../config/redis';

describe('MatchmakingService - O(1) Redis Bucket Queue', () => {
  beforeEach(async () => {
    await inMemoryRedis.flushall();
  });

  it('correctly identifies weak and strong skills', () => {
    const skills = { subFC: 5.5, subLR: 7.0, subGRA: 6.0, subP: 8.0 };
    const { weakSkill, strongSkill } = determineWeakAndStrongSkills(skills);

    expect(weakSkill).toBe('FC');
    expect(strongSkill).toBe('P');
  });

  it('formats target band brackets rounded to nearest 0.5', () => {
    expect(matchmakingService.getBandKey(6.3)).toBe('6.5');
    expect(matchmakingService.getBandKey(6.2)).toBe('6.0');
    expect(matchmakingService.getBandKey(7.5)).toBe('7.5');
  });

  it('queues user A when no partner is present', async () => {
    const userA = {
      userId: 'user_a_123',
      band: 6.5,
      skills: { subFC: 5.5, subLR: 7.0, subGRA: 6.5, subP: 6.5 },
    };

    const result = await matchmakingService.joinQueue(userA.userId, userA.band, userA.skills);

    expect(result.matched).toBe(false);
    expect(result.bucketKey).toBe('match_queue:6.5:FC:LR');
  });

  it('instantly pairs user B with complementary user A', async () => {
    // User A: Weak FC (5.5), Strong LR (7.5) -> bucket: match_queue:6.5:FC:LR
    const userA = {
      userId: 'user_a_123',
      band: 6.5,
      skills: { subFC: 5.5, subLR: 7.5, subGRA: 6.5, subP: 6.5 },
    };

    // User B: Weak LR (5.5), Strong FC (7.5) -> bucket: match_queue:6.5:LR:FC
    const userB = {
      userId: 'user_b_456',
      band: 6.5,
      skills: { subFC: 7.5, subLR: 5.5, subGRA: 6.5, subP: 6.5 },
    };

    const resultA = await matchmakingService.joinQueue(userA.userId, userA.band, userA.skills);
    expect(resultA.matched).toBe(false);

    const resultB = await matchmakingService.joinQueue(userB.userId, userB.band, userB.skills);
    expect(resultB.matched).toBe(true);
    expect(resultB.partnerId).toBe('user_a_123');
    expect(resultB.roomName).toBeDefined();
  });

  it('supports instant O(1) queue cancellation', async () => {
    const userA = {
      userId: 'user_a_123',
      band: 6.5,
      skills: { subFC: 5.5, subLR: 7.0, subGRA: 6.5, subP: 6.5 },
    };

    await matchmakingService.joinQueue(userA.userId, userA.band, userA.skills);
    const cancelled = await matchmakingService.cancelQueue(userA.userId);
    expect(cancelled).toBe(true);

    const cancelAgain = await matchmakingService.cancelQueue(userA.userId);
    expect(cancelAgain).toBe(false);
  });
});
