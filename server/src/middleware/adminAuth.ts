import type { NextFunction, Request, Response } from 'express';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { setRequestContextUserId } from '../utils/requestContext';

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

  // 3. Fall back to query parameter token for authenticated media/receipt streaming
  if (!token && typeof req.query?.token === 'string' && req.query.token.trim()) {
    token = req.query.token.trim();
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
    if (!env.ADMIN_TELEGRAM_IDS || env.ADMIN_TELEGRAM_IDS.length === 0 || !env.ADMIN_TELEGRAM_IDS.includes(telegramIdStr)) {
      res.status(403).json({ error: 'Forbidden: Telegram ID is not in admin whitelist.' });
      return;
    }

    req.adminUser = { telegramId: telegramIdStr, role: 'admin' };
    setRequestContextUserId(`admin:${telegramIdStr}`);
    next();
  } catch (error: unknown) {
    logger.warn('Admin token verification failed', {
      service: 'admin',
      event: 'admin_auth_failed',
    }, error);
    res.status(401).json({ error: 'Unauthorized: Token expired or invalid.' });
  }
}

