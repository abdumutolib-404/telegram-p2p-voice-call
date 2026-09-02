import { describe, it, expect, beforeEach } from 'vitest';
import { checkRateLimit, setInFlightLock, releaseInFlightLock } from '../services/rateLimitMatrix';

describe('Rate Limit Matrix & Abuse Penalty Resilience Test Suite', () => {
  const testIdPrefix = 'matrix_test_';

  it('allows requests within permitted threshold', async () => {
    const id = `${testIdPrefix}auth_ok_${Date.now()}`;
    const res1 = await checkRateLimit('AUTH_PASSWORD', id);
    expect(res1.allowed).toBe(true);
    expect(res1.remaining).toBe(4); // maxRequests is 5
  });

  it('triggers rate limit and penalty block upon exceeding maxRequests', async () => {
    const id = `${testIdPrefix}auth_burst_${Date.now()}`;
    
    // Send 5 permitted requests
    for (let i = 0; i < 5; i++) {
      const res = await checkRateLimit('AUTH_PASSWORD', id);
      expect(res.allowed).toBe(true);
    }

    // 6th request must be rejected and trigger penalty block
    const rejected = await checkRateLimit('AUTH_PASSWORD', id);
    expect(rejected.allowed).toBe(false);
    expect(rejected.error?.code).toBe('RATE_LIMITED');
    expect(rejected.retryAfterSeconds).toBeGreaterThan(0);

    // Subsequent call is immediately blocked by penalty
    const penalized = await checkRateLimit('AUTH_PASSWORD', id);
    expect(penalized.allowed).toBe(false);
    expect(penalized.error?.code).toBe('RATE_LIMITED');
  });

  it('enforces in-flight concurrency locks for duplicate rapid actions', async () => {
    const id = `${testIdPrefix}match_lock_${Date.now()}`;

    // 1. Acquire in-flight lock
    setInFlightLock('MATCH_JOIN', id);

    // 2. checkRateLimit while in-flight lock active must be rejected
    const second = await checkRateLimit('MATCH_JOIN', id);
    expect(second.allowed).toBe(false);
    expect(second.error?.code).toBe('ALREADY_IN_PROGRESS');

    // 3. Releasing the in-flight lock allows next request
    releaseInFlightLock('MATCH_JOIN', id);
    const third = await checkRateLimit('MATCH_JOIN', id);
    expect(third.allowed).toBe(true);
  });

  it('allows explicit test bypass identifiers', async () => {
    const bypassId = `bypass_tester_${Date.now()}`;
    for (let i = 0; i < 20; i++) {
      const res = await checkRateLimit('AUTH_PASSWORD', bypassId);
      expect(res.allowed).toBe(true);
      expect(res.remaining).toBe(999);
    }
  });
});
