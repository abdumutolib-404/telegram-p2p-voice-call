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

const RATE_LIMIT_LUA = `
-- RATE_LIMIT_EVAL
local penaltyTtl = redis.call('TTL', KEYS[1])
if penaltyTtl > 0 then
  return { 0, 'RATE_LIMITED', penaltyTtl, 0 }
end

if ARGV[1] == '1' then
  local lockExists = redis.call('EXISTS', KEYS[2])
  if lockExists == 1 then
    return { 0, 'ALREADY_IN_PROGRESS', 0, 0 }
  end
end

local current = redis.call('INCR', KEYS[3])
if current == 1 then
  redis.call('EXPIRE', KEYS[3], tonumber(ARGV[2]))
end

local maxRequests = tonumber(ARGV[3])
if current > maxRequests then
  local penaltySec = tonumber(ARGV[4])
  redis.call('SET', KEYS[1], '1', 'EX', penaltySec)
  return { 0, 'RATE_LIMITED', penaltySec, 0 }
end

return { 1, 'OK', 0, maxRequests - current }
`;

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
  // Cluster-safe hash tags ensure all keys for an identifier map to the same Redis shard
  const penaltyKey = `{${identifier}}:penalty:${poolCategory}`;
  const lockKey = `{${identifier}}:lock:${action}`;
  const rateKey = `{${identifier}}:rate:${poolCategory}`;
  const penaltySec = rule.penaltySeconds || 300;

  try {
    const redis = getRedis();
    const res = await redis.eval(
      RATE_LIMIT_LUA,
      3,
      penaltyKey,
      lockKey,
      rateKey,
      rule.inFlightLockSeconds ? '1' : '0',
      String(rule.windowSeconds),
      String(rule.maxRequests),
      String(penaltySec)
    );

    const allowed = Number(res[0]) === 1;
    const status = String(res[1]);
    const ttlOrRetry = Number(res[2]);
    const remaining = Number(res[3]);

    if (!allowed) {
      if (status === 'ALREADY_IN_PROGRESS') {
        return {
          allowed: false,
          remaining: 0,
          error: createCanonicalError('ALREADY_IN_PROGRESS', 'Your previous request is still being processed.'),
        };
      }
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: ttlOrRetry,
        error: createCanonicalError('RATE_LIMITED', `Too many requests. Please wait ${ttlOrRetry} seconds before trying again.`),
      };
    }

    return { allowed: true, remaining };
  } catch {
    // In-memory fallback if Redis is unavailable
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

    if (rule.inFlightLockSeconds) {
      const lockExpires = inFlightLocks.get(lockKey);
      if (lockExpires && now < lockExpires) {
        return {
          allowed: false,
          remaining: 0,
          error: createCanonicalError('ALREADY_IN_PROGRESS', 'Your previous request is still being processed.'),
        };
      }
    }

    let entry = memoryCounters.get(rateKey);
    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + rule.windowSeconds * 1000 };
      memoryCounters.set(rateKey, entry);
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

export function setInFlightLock(action: RateLimitAction, identifier: string, token: string | number = '1'): void {
  const rule = MATRIX_RULES[action];
  if (!rule?.inFlightLockSeconds) return;
  const lockKey = `{${identifier}}:lock:${action}`;
  const ttlMs = rule.inFlightLockSeconds * 1000;
  try {
    const redis = getRedis();
    redis.set(lockKey, String(token), 'PX', ttlMs).catch(() => undefined);
  } catch {
    // Fallback to in-memory
  }
  inFlightLocks.set(lockKey, Date.now() + ttlMs);
}

export function releaseInFlightLock(action: RateLimitAction, identifier: string, token?: string | number): void {
  const lockKey = `{${identifier}}:lock:${action}`;
  try {
    const redis = getRedis();
    if (token !== undefined) {
      redis.eval(LOCK_RELEASE_LUA, 1, lockKey, String(token)).catch(() => undefined);
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
