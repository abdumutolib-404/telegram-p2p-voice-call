import { Request, Response, NextFunction } from 'express';
import { checkRateLimit, type RateLimitAction } from '../services/rateLimitMatrix';
import { createCanonicalError } from '../types/canonical';

export function createRateLimiter(maxRequests: number, windowMs: number) {
  const store: Record<string, { count: number; resetTime: number }> = {};

  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const ip of Object.keys(store)) {
      if (now > store[ip].resetTime) {
        delete store[ip];
      }
    }
  }, 60_000);
  if (cleanupInterval.unref) cleanupInterval.unref();

  return (req: Request, res: Response, next: NextFunction) => {
    if (process.env.NODE_ENV === 'test') {
      return next();
    }
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();

    if (!store[ip] || now > store[ip].resetTime) {
      store[ip] = {
        count: 1,
        resetTime: now + windowMs,
      };
      return next();
    }

    store[ip].count += 1;

    if (store[ip].count > maxRequests) {
      const err = createCanonicalError('RATE_LIMITED', 'Too many requests. Please slow down and try again later.');
      return res.status(429).json(err);
    }

    next();
  };
}

export function createActionRateLimiter(
  action: RateLimitAction,
  getIdentifier?: (req: Request) => string
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const id = getIdentifier ? getIdentifier(req) : (req.ip || req.socket.remoteAddress || 'unknown');
    const result = await checkRateLimit(action, id);
    if (!result.allowed) {
      return res.status(429).json(result.error);
    }
    next();
  };
}
