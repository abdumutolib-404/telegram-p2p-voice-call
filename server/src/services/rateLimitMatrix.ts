import { getRedis } from '../config/redis';
import { env } from '../config/env';
import { createCanonicalError, CanonicalErrorResponse } from '../types/canonical';

export type RateLimitAction =
  | 'AUTH_PASSWORD'
  | 'AUTH_OTP'
  | 'AUTH_VERIFY'
  | 'MATCH_JOIN'
  | 'MATCH_CANCEL'
  | 'MATCHMAKING'
  | 'DIRECT_CALL'
  | 'FAVORITE'
  | 'RECORD_START'
  | 'RECORD_STOP'
  | 'FINISH_CALL'
  | 'APPEAL'
  | 'SUPPORT'
  | 'PAYMENT_INVOICE'
  | 'SUBSCRIPTION_REQUEST'
  | 'BOT'
  | 'BOT_BUTTON'
  | 'BOT_COMMAND'
  | 'PROFILE_UPDATE'
  | 'DND'
  | 'ADMIN_LOGIN'
  | 'ADMIN_OTP';

interface MatrixRule {
  maxRequests: number;
  windowSeconds: number;
  penaltySeconds?: number;
  inFlightLockSeconds?: number;
  idempotent?: boolean;
  poolCategory?: string;
}

const MATRIX_RULES: Record<RateLimitAction, MatrixRule> = {
  AUTH_PASSWORD: { maxRequests: 5, windowSeconds: 900, penaltySeconds: 900 },
  AUTH_OTP: { maxRequests: 5, windowSeconds: 300, penaltySeconds: 300 },
  AUTH_VERIFY: { maxRequests: 20, windowSeconds: 60, penaltySeconds: 300 },
  MATCH_JOIN: { maxRequests: 10, windowSeconds: 60, penaltySeconds: 300, inFlightLockSeconds: 4, poolCategory: 'matchmaking' },
  MATCH_CANCEL: { maxRequests: 10, windowSeconds: 60, penaltySeconds: 300, idempotent: true, poolCategory: 'matchmaking' },
  MATCHMAKING: { maxRequests: 10, windowSeconds: 60, penaltySeconds: 300 },
  DIRECT_CALL: { maxRequests: 4, windowSeconds: 30, penaltySeconds: 300, inFlightLockSeconds: 8 },
  FAVORITE: { maxRequests: 15, windowSeconds: 30, idempotent: true },
  RECORD_START: { maxRequests: 4, windowSeconds: 20, penaltySeconds: 120, inFlightLockSeconds: 4 },
  RECORD_STOP: { maxRequests: 4, windowSeconds: 20, idempotent: true },
  FINISH_CALL: { maxRequests: 12, windowSeconds: 10, idempotent: true },
  APPEAL: { maxRequests: 2, windowSeconds: 3600, penaltySeconds: 3600 },
  SUPPORT: { maxRequests: 5, windowSeconds: 60, penaltySeconds: 300 },
  PAYMENT_INVOICE: { maxRequests: 5, windowSeconds: 60, penaltySeconds: 300 },
  SUBSCRIPTION_REQUEST: { maxRequests: 3, windowSeconds: 60, penaltySeconds: 300 },
  BOT: { maxRequests: 30, windowSeconds: 60, penaltySeconds: 60 },
  BOT_BUTTON: { maxRequests: 60, windowSeconds: 60, penaltySeconds: 15, poolCategory: 'bot' },
  BOT_COMMAND: { maxRequests: 30, windowSeconds: 60, penaltySeconds: 30, poolCategory: 'bot' },
  PROFILE_UPDATE: { maxRequests: 6, windowSeconds: 60, penaltySeconds: 300 },
  DND: { maxRequests: 8, windowSeconds: 30, idempotent: true },
  ADMIN_LOGIN: { maxRequests: 5, windowSeconds: 900, penaltySeconds: 900 },
  ADMIN_OTP: { maxRequests: 10, windowSeconds: 900, penaltySeconds: 900 },
};

const LOCK_RELEASE_LUA = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
else
  return 0
end
`;

// In-memory fallback and penalty stores (used when Redis is unavailable)
const memoryCounters = new Map<string, { count: number; resetAt: number }>();
const inFlightLocks = new Map<string, number>();
const penaltyBlocks = new Map<string, number>();

export async function checkRateLimit(
  action: RateLimitAction,
  identifier: string
): Promise<{ allowed: boolean; error?: CanonicalErrorResponse; remaining?: number; retryAfterSeconds?: number }> {
  // In tests, only bypass if identifier explicitly asks for bypass
  if (env.NODE_ENV === 'test' && identifier.startsWith('bypass_')) {
    return { allowed: true, remaining: 999 };
  }

  const rule = MATRIX_RULES[action] || { maxRequests: 10, windowSeconds: 60, penaltySeconds: 300 };
  const now = Date.now();
  const poolCategory = rule.poolCategory || action.toLowerCase();
  const key = `rl:${poolCategory}:${identifier}`;
  const penaltyKey = `penalty:${poolCategory}:${identifier}`;

  // 1. Check Active Abuse Penalty Block (Redis first, then fallback to local memory)
  try {
    const redis = getRedis();
    const ttl = await redis.ttl(penaltyKey);
    if (ttl > 0) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: ttl,
        error: createCanonicalError('RATE_LIMITED', `Too many requests. Please wait ${ttl} seconds before trying again.`),
      };
    }
  } catch {
    // Redis unavailable: fallback to local memory check below
  }

  const penaltyExpires = penaltyBlocks.get(penaltyKey);
  if (penaltyExpires && now < penaltyExpires) {
    const retryAfter = Math.ceil((penaltyExpires - now) / 1000);
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: retryAfter,
      error: createCanonicalError('RATE_LIMITED', `Too many requests. Please wait ${retryAfter} seconds before trying again.`),
    };
  }

  // 2. Check In-Flight Lock (Redis first, then fallback to local memory)
  if (rule.inFlightLockSeconds) {
    const lockKey = `inflight:${action}:${identifier}`;
    let isLocked = false;
    try {
      const redis = getRedis();
      const exists = await redis.exists(lockKey);
      if (exists) {
        isLocked = true;
      }
    } catch {
      // Redis unavailable: fallback to local map check
    }

    if (!isLocked) {
      const lockExpires = inFlightLocks.get(lockKey);
      if (lockExpires && now < lockExpires) {
        isLocked = true;
      }
    }

    if (isLocked) {
      return {
        allowed: false,
        remaining: 0,
        error: createCanonicalError('ALREADY_IN_PROGRESS', 'Your previous request is still being processed.'),
      };
    }
  }

  // 3. Rate Limit Evaluation with Redis or Memory Fallback
  const penaltySec = rule.penaltySeconds || 300;

  try {
    const redis = getRedis();
    const current = await redis.incr(key);
    if (current === 1) {
      await redis.expire(key, rule.windowSeconds);
    }
    if (current > rule.maxRequests) {
      // Trigger abuse penalty block in Redis and local memory
      penaltyBlocks.set(penaltyKey, now + penaltySec * 1000);
      try {
        await redis.set(penaltyKey, '1', 'EX', penaltySec);
      } catch {}
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: penaltySec,
        error: createCanonicalError('RATE_LIMITED', `Rate limit exceeded. You are temporarily paused for ${penaltySec / 60} minutes.`),
      };
    }
    return { allowed: true, remaining: rule.maxRequests - current };
  } catch {
    // In-memory sliding counter
    let entry = memoryCounters.get(key);
    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + rule.windowSeconds * 1000 };
      memoryCounters.set(key, entry);
    }
    entry.count += 1;
    if (entry.count > rule.maxRequests) {
      penaltyBlocks.set(penaltyKey, now + penaltySec * 1000);
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: penaltySec,
        error: createCanonicalError('RATE_LIMITED', `Rate limit exceeded. You are temporarily paused for ${penaltySec / 60} minutes.`),
      };
    }
    return { allowed: true, remaining: rule.maxRequests - entry.count };
  }
}

export function setInFlightLock(action: RateLimitAction, identifier: string, token: string = '1'): void {
  const rule = MATRIX_RULES[action];
  if (!rule?.inFlightLockSeconds) return;
  const lockKey = `inflight:${action}:${identifier}`;
  const ttlMs = rule.inFlightLockSeconds * 1000;
  try {
    const redis = getRedis();
    redis.set(lockKey, token, 'PX', ttlMs).catch(() => undefined);
  } catch {
    // Fallback to in-memory
  }
  inFlightLocks.set(lockKey, Date.now() + ttlMs);
}

export function releaseInFlightLock(action: RateLimitAction, identifier: string, token?: string): void {
  const lockKey = `inflight:${action}:${identifier}`;
  try {
    const redis = getRedis();
    if (token) {
      redis.eval(LOCK_RELEASE_LUA, 1, lockKey, token).catch(() => undefined);
    } else {
      redis.del(lockKey).catch(() => undefined);
    }
  } catch {
    // Fallback to in-memory
  }
  inFlightLocks.delete(lockKey);
}

export function resetRateLimitForTesting(): void {
  memoryCounters.clear();
  inFlightLocks.clear();
  penaltyBlocks.clear();
}
