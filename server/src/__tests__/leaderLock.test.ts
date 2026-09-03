import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DistributedLeaderLock } from '../services/leaderLock';
import { getRedis } from '../config/redis';

describe('DistributedLeaderLock', () => {
  const testKey = 'test:leader:lock:' + Math.random().toString(36).substring(2, 8);

  beforeEach(async () => {
    const redis = getRedis();
    await redis.del(testKey);
  });

  afterEach(async () => {
    const redis = getRedis();
    await redis.del(testKey);
  });

  it('allows the first instance to acquire leadership', async () => {
    const lock = new DistributedLeaderLock({ lockKey: testKey, ttlMs: 5000 });
    const acquired = await lock.acquire();
    expect(acquired).toBe(true);
    expect(lock.isCurrentLeader()).toBe(true);
    await lock.release();
    expect(lock.isCurrentLeader()).toBe(false);
  });

  it('rejects a second instance while the first instance holds the lock', async () => {
    const instanceA = new DistributedLeaderLock({ lockKey: testKey, ttlMs: 5000 });
    const instanceB = new DistributedLeaderLock({ lockKey: testKey, ttlMs: 5000 });

    const acquiredA = await instanceA.acquire();
    expect(acquiredA).toBe(true);

    const acquiredB = await instanceB.acquire();
    expect(acquiredB).toBe(false);
    expect(instanceB.isCurrentLeader()).toBe(false);

    // Release A, then B should be able to acquire
    await instanceA.release();
    const acquiredBAfter = await instanceB.acquire();
    expect(acquiredBAfter).toBe(true);
    await instanceB.release();
  });

  it('renews lock successfully if owned, fails if not owned', async () => {
    const instanceA = new DistributedLeaderLock({ lockKey: testKey, ttlMs: 5000 });
    const instanceB = new DistributedLeaderLock({ lockKey: testKey, ttlMs: 5000 });

    await instanceA.acquire();
    const renewedA = await instanceA.renew();
    expect(renewedA).toBe(true);

    const renewedB = await instanceB.renew();
    expect(renewedB).toBe(false);

    await instanceA.release();
  });

  it('handles election and calls onElected callback', async () => {
    const lock = new DistributedLeaderLock({ lockKey: testKey, ttlMs: 5000 });
    let electedCalled = false;

    await new Promise<void>((resolve) => {
      lock.startElection({
        onElected: () => {
          electedCalled = true;
          resolve();
        },
      });
    });

    expect(electedCalled).toBe(true);
    expect(lock.isCurrentLeader()).toBe(true);
    lock.stopTimers();
    await lock.release();
  });
});
