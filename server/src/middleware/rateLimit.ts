import { Request, Response, NextFunction } from 'express';

interface RateLimitStore {
  [ip: string]: { count: number; resetTime: number };
}

export function createRateLimiter(maxRequests: number, windowMs: number) {
  const store: RateLimitStore = {};

  return (req: Request, res: Response, next: NextFunction) => {
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
      return res.status(429).json({
        error: 'Too many requests. Please slow down and try again later.',
      });
    }

    next();
  };
}
