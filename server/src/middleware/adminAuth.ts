import type { NextFunction, Request, Response } from 'express';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { env } from '../config/env';

export interface AdminAuthenticatedRequest extends Request {
  adminUser?: { telegramId: string; role: 'admin' };
}

interface AdminJwtPayload extends JwtPayload {
  telegramId: string | number;
  role: 'admin';
}

function isAdminJwtPayload(value: string | JwtPayload): value is AdminJwtPayload {
  if (typeof value === 'string' || !value || value.role !== 'admin') return false;
  const idStr = String(value.telegramId);
  return /^\d+$/.test(idStr) && idStr !== '0';
}

export function adminAuthMiddleware(req: AdminAuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized: Missing or invalid Authorization header.' });
    return;
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    res.status(401).json({ error: 'Unauthorized: Missing bearer token.' });
    return;
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
    if (!isAdminJwtPayload(decoded)) {
      res.status(403).json({ error: 'Forbidden: Insufficient privileges.' });
      return;
    }
    req.adminUser = { telegramId: String(decoded.telegramId), role: 'admin' };
    next();
  } catch (error: unknown) {
    console.error('[AdminAuth] verification_failed', {
      error: error instanceof Error ? error.message : 'unknown_error',
    });
    res.status(401).json({ error: 'Unauthorized: Token expired or invalid.' });
  }
}
