import { getRedis } from '../config/redis';
import { env } from '../config/env';
import { createCanonicalError, CanonicalErrorResponse } from '../types/canonical';

export type RateLimitAction =
  | 'AUTH_PASSWORD'
  | 'AUTH_OTP'
  | 'MATCH_JOIN'
  | 'MATCH_CANCEL'
  | 'DIRECT_CALL'
  | 'FAVORITE'
  | 'RECORD_START'
  | 'RECORD_STOP'
  | 'FINISH_CALL'
  | 'APPEAL'
  | 'SUPPORT'
  | 'PAYMENT_INVOICE'
  | 'BOT_BUTTON'
  | 'BOT_COMMAND'
  | 'PROFILE_UPDATE'
  | 'DND'
  | 'ADMIN_LOGIN'
  | 'ADMIN_OTP';

interface MatrixRule {
  maxRequests: number;
  windowSeconds: number;
  inFlightLockSeconds?: number;
  idempotent?: boolean;
}

const MATRIX_RULES: Record<RateLimitAction, MatrixRule> = {
  AUTH_PASSWORD: { maxRequests: 5, windowSeconds: 900 },
  AUTH_OTP: { maxRequests: 5, windowSeconds: 300 },
  MATCH_JOIN: { maxRequests: 8, windowSeconds: 10, inFlightLockSeconds: 4 },
  MATCH_CANCEL: { maxRequests: 12, windowSeconds: 10, idempotent: true },
  DIRECT_CALL: { maxRequests: 4, windowSeconds: 30, inFlightLockSeconds: 8 },
  FAVORITE: { maxRequests: 15, windowSeconds: 30, idempotent: true },
  RECORD_START: { maxRequests: 4, windowSeconds: 20, inFlightLockSeconds: 4 },
  RECORD_STOP: { maxRequests: 4, windowSeconds: 20, idempotent: true },
  FINISH_CALL: { maxRequests: 12, windowSeconds: 10, idempotent: true },
  APPEAL: { maxRequests: 2, windowSeconds: 3600 },
  SUPPORT: { maxRequests: 5, windowSeconds: 60 },
  PAYMENT_INVOICE: { maxRequests: 6, windowSeconds: 60 },
  BOT_BUTTON: { maxRequests: 40, windowSeconds: 10 },
  BOT_COMMAND: { maxRequests: 25, windowSeconds: 10 },
  PROFILE_UPDATE: { maxRequests: 6, windowSeconds: 60 },
  DND: { maxRequests: 8, windowSeconds: 30, idempotent: true },
  ADMIN_LOGIN: { maxRequests: 5, windowSeconds: 900 },
  ADMIN_OTP: { maxRequests: 5, windowSeconds: 300 },
};

// In-memory fallback stores
const memoryCounters = new Map<string, { count: number; resetAt: number }>();
const inFlightLocks = new Map<string, number>();

export async function checkRateLimit(
  action: RateLimitAction,
  identifier: string
): Promise<{ allowed: boolean; error?: CanonicalErrorResponse; remaining?: number }> {
  // In tests, only bypass if identifier explicitly asks for bypass
  if (env.NODE_ENV === 'test' && identifier.startsWith('bypass_')) {
    return { allowed: true, remaining: 999 };
  }

  const rule = MATRIX_RULES[action] || { maxRequests: 10, windowSeconds: 60 };
  const now = Date.now();
  const key = `rl:${action}:${identifier}`;

  // Check In-Flight Lock
  if (rule.inFlightLockSeconds) {
    const lockKey = `inflight:${action}:${identifier}`;
    const lockExpires = inFlightLocks.get(lockKey);
    if (lockExpires && now < lockExpires) {
      return {
        allowed: false,
        error: createCanonicalError('ALREADY_IN_PROGRESS', 'Your previous request is still being processed.'),
      };
    }
  }

  try {
    const redis = getRedis();
    const current = await redis.incr(key);
    if (current === 1) {
      await redis.expire(key, rule.windowSeconds);
    }
    if (current > rule.maxRequests) {
      return {
        allowed: false,
        error: createCanonicalError('RATE_LIMITED', 'Too many requests. Please wait a moment before trying again.'),
        remaining: 0,
      };
    }
    return { allowed: true, remaining: rule.maxRequests - current };
  } catch {
    // In-memory fallback
    let entry = memoryCounters.get(key);
    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + rule.windowSeconds * 1000 };
      memoryCounters.set(key, entry);
    }
    entry.count += 1;
    if (entry.count > rule.maxRequests) {
      return {
        allowed: false,
        error: createCanonicalError('RATE_LIMITED', 'Too many requests. Please wait a moment before trying again.'),
        remaining: 0,
      };
    }
    return { allowed: true, remaining: rule.maxRequests - entry.count };
  }
}

export function setInFlightLock(action: RateLimitAction, identifier: string): void {
  const rule = MATRIX_RULES[action];
  if (!rule?.inFlightLockSeconds) return;
  const lockKey = `inflight:${action}:${identifier}`;
  inFlightLocks.set(lockKey, Date.now() + rule.inFlightLockSeconds * 1000);
}

export function releaseInFlightLock(action: RateLimitAction, identifier: string): void {
  const lockKey = `inflight:${action}:${identifier}`;
  inFlightLocks.delete(lockKey);
}

export function resetRateLimitForTesting(): void {
  memoryCounters.clear();
  inFlightLocks.clear();
}
