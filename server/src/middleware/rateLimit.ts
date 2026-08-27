import { Request, Response, NextFunction } from 'express';
import { checkRateLimit, type RateLimitAction } from '../services/rateLimitMatrix';
import { createCanonicalError } from '../types/canonical';

export function getClientIp(req: Request): string {
  const cfIp = req.headers['cf-connecting-ip'];
  if (typeof cfIp === 'string' && cfIp.trim()) {
    return cfIp.trim();
  }
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

export function createActionRateLimiter(
  action: RateLimitAction,
  getIdentifier?: (req: Request) => string
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (process.env.NODE_ENV === 'test' && !req.headers['x-test-ratelimit']) {
      return next();
    }
    const id = getIdentifier ? getIdentifier(req) : getClientIp(req);
    const result = await checkRateLimit(action, id);
    if (!result.allowed) {
      return res.status(429).json(result.error);
    }
    next();
  };
}
