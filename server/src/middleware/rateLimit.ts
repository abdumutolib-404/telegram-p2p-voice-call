import { Request, Response, NextFunction } from 'express';

interface RateLimitStore {
  [ip: string]: { count: number; resetTime: number };
}

export function createRateLimiter(maxRequests: number, windowMs: number) {
  const store: RateLimitStore = {};

  // Periodic cleanup of expired entries to prevent memory leak
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const ip of Object.keys(store)) {
      if (now > store[ip].resetTime) {
        delete store[ip];
      }
    }
  }, 60_000); // Clean every 60 seconds
  // Prevent interval from keeping the process alive
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
      return res.status(429).json({
        error: 'Too many requests. Please slow down and try again later.',
      });
    }

    next();
  };
}
