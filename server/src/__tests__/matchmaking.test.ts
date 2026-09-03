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

  it('matches two users with default equal subscores (6.0 / 6.0 / 6.0 / 6.0)', async () => {
    const defaultUser1 = {
      userId: 'default_user_1',
      band: 6.0,
      skills: { subFC: 6.0, subLR: 6.0, subGRA: 6.0, subP: 6.0 },
    };

    const defaultUser2 = {
      userId: 'default_user_2',
      band: 6.0,
      skills: { subFC: 6.0, subLR: 6.0, subGRA: 6.0, subP: 6.0 },
    };

    const res1 = await matchmakingService.joinQueue(defaultUser1.userId, defaultUser1.band, defaultUser1.skills);
    expect(res1.matched).toBe(false);

    const res2 = await matchmakingService.joinQueue(defaultUser2.userId, defaultUser2.band, defaultUser2.skills);
    expect(res2.matched).toBe(true);
    expect(res2.partnerId).toBe('default_user_1');
  });

  it('prioritizes BOSS, PRO, and PLUS subscribers in matchmaking candidate pools', async () => {
    const bossUser = {
      userId: 'boss_user_88',
      band: 7.5,
      skills: { subFC: 7.5, subLR: 7.5, subGRA: 7.5, subP: 7.5 },
    };

    const joinBoss = await matchmakingService.joinQueue(bossUser.userId, bossUser.band, bossUser.skills, { plan: 'BOSS' });
    expect(joinBoss.matched).toBe(false);

    const matchingUser = {
      userId: 'matching_user_89',
      band: 7.5,
      skills: { subFC: 7.5, subLR: 7.5, subGRA: 7.5, subP: 7.5 },
    };

    const joinMatch = await matchmakingService.joinQueue(matchingUser.userId, matchingUser.band, matchingUser.skills);
    expect(joinMatch.matched).toBe(true);
    expect(joinMatch.partnerId).toBe('boss_user_88');
  });

  it('matches partner across adjacent band brackets via progressive expansion', async () => {
    const band6User = {
      userId: 'band_6_0_user',
      band: 6.0,
      skills: { subFC: 6.0, subLR: 6.0, subGRA: 6.0, subP: 6.0 },
    };

    const band65User = {
      userId: 'band_6_5_user',
      band: 6.5,
      skills: { subFC: 6.5, subLR: 6.5, subGRA: 6.5, subP: 6.5 },
    };

    const join6 = await matchmakingService.joinQueue(band6User.userId, band6User.band, band6User.skills);
    expect(join6.matched).toBe(false);

    const join65 = await matchmakingService.joinQueue(band65User.userId, band65User.band, band65User.skills);
    expect(join65.matched).toBe(true);
    expect(join65.partnerId).toBe('band_6_0_user');
  });

  it('atomically removes claimed partner from ALL registered sets and eliminates ghost IDs', async () => {
    // Boss User A registers in ownBucket, bandPool, and priority:BOSS
    const bossUserA = {
      userId: 'boss_user_alpha',
      band: 7.0,
      skills: { subFC: 6.0, subLR: 8.0, subGRA: 7.0, subP: 7.0 }, // weak FC, strong LR -> match_queue:7.0:FC:LR
    };

    const joinA = await matchmakingService.joinQueue(bossUserA.userId, bossUserA.band, bossUserA.skills, { plan: 'BOSS' });
    expect(joinA.matched).toBe(false);

    const ownBucket = 'match_queue:7.0:FC:LR';
    const bandPool = 'match_queue:band:7.0';
    const bossPriorityPool = 'match_queue:priority:BOSS';

    // Verify User A is in all 3 sets before matching
    expect(await inMemoryRedis.smembers(ownBucket)).toContain('boss_user_alpha');
    expect(await inMemoryRedis.smembers(bandPool)).toContain('boss_user_alpha');
    expect(await inMemoryRedis.smembers(bossPriorityPool)).toContain('boss_user_alpha');
    expect(await inMemoryRedis.get(`user_queue:${bossUserA.userId}`)).toBe(ownBucket);

    // User B joins with different band (7.5), claiming User A from the BOSS priority pool
    const userB = {
      userId: 'user_bravo',
      band: 7.5,
      skills: { subFC: 7.5, subLR: 7.5, subGRA: 7.5, subP: 7.5 },
    };

    const joinB = await matchmakingService.joinQueue(userB.userId, userB.band, userB.skills);
    expect(joinB.matched).toBe(true);
    expect(joinB.partnerId).toBe('boss_user_alpha');
    expect(joinB.partnerBucketKey).toBe(bossPriorityPool);

    // Verify User A was atomically purged from ALL sets:
    // 1. Own bucket
    const ownMembers = await inMemoryRedis.smembers(ownBucket);
    expect(ownMembers).not.toContain('boss_user_alpha');

    // 2. Band pool
    const bandMembers = await inMemoryRedis.smembers(bandPool);
    expect(bandMembers).not.toContain('boss_user_alpha');

    // 3. Priority pool
    const priorityMembers = await inMemoryRedis.smembers(bossPriorityPool);
    expect(priorityMembers).not.toContain('boss_user_alpha');

    // 4. Pointer key
    expect(await inMemoryRedis.get(`user_queue:${bossUserA.userId}`)).toBeNull();

    // 5. User C joins with exact same complementary skills as User A
    // Since User A was cleanly removed without ghost IDs, User C does NOT match with User A
    const userC = {
      userId: 'user_charlie',
      band: 7.0,
      skills: { subFC: 8.0, subLR: 6.0, subGRA: 7.0, subP: 7.0 }, // complementary to User A's bucket
    };

    const joinC = await matchmakingService.joinQueue(userC.userId, userC.band, userC.skills);
    expect(joinC.matched).toBe(false);
  });

  it('performs candidate search in a single atomic EVAL roundtrip without sequential per-bucket calls', async () => {
    const evalCalls: Array<{ script: string; numKeys: number }> = [];
    const originalEval = inMemoryRedis.eval.bind(inMemoryRedis);

    inMemoryRedis.eval = async (script: string, numKeys: number, ...args: string[]) => {
      evalCalls.push({ script, numKeys });
      return originalEval(script, numKeys, ...args);
    };

    try {
      const user = {
        userId: 'roundtrip_test_user',
        band: 6.5,
        skills: { subFC: 6.0, subLR: 7.0, subGRA: 6.5, subP: 6.5 },
      };

      await matchmakingService.joinQueue(user.userId, user.band, user.skills);

      // Verify that MATCH_QUEUE_MULTI_CLAIM was called exactly ONCE with all candidate buckets passed together
      const multiClaimCalls = evalCalls.filter((c) => c.script.includes('MATCH_QUEUE_MULTI_CLAIM'));
      expect(multiClaimCalls.length).toBe(1);
      // It passed all candidate buckets in numKeys (> 5 buckets) in that single call
      expect(multiClaimCalls[0].numKeys).toBeGreaterThanOrEqual(6);
    } finally {
      inMemoryRedis.eval = originalEval;
    }
  });
});

