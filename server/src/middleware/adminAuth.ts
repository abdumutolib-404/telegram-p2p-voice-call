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
  let token: string | undefined;

  // 1. Prefer HttpOnly Cookie
  if (req.cookies && typeof req.cookies.admin_session === 'string' && req.cookies.admin_session.trim()) {
    token = req.cookies.admin_session.trim();
  }

  // 2. Fall back to Authorization Bearer header
  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.slice('Bearer '.length).trim();
    }
  }

  if (!token) {
    res.status(401).json({ error: 'Unauthorized: Missing session cookie or Bearer token.' });
    return;
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
    if (!isAdminJwtPayload(decoded)) {
      res.status(403).json({ error: 'Forbidden: Insufficient privileges.' });
      return;
    }

    const telegramIdStr = String(decoded.telegramId);
    if (env.ADMIN_TELEGRAM_IDS.length > 0 && !env.ADMIN_TELEGRAM_IDS.includes(telegramIdStr)) {
      res.status(403).json({ error: 'Forbidden: Telegram ID is not in admin whitelist.' });
      return;
    }

    req.adminUser = { telegramId: telegramIdStr, role: 'admin' };
    next();
  } catch (error: unknown) {
    console.error('[AdminAuth] verification_failed', {
      error: error instanceof Error ? error.message : 'unknown_error',
    });
    res.status(401).json({ error: 'Unauthorized: Token expired or invalid.' });
  }
}
