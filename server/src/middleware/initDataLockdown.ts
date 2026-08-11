import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { env } from '../config/env';

export interface AuthenticatedTelegramRequest extends Request {
  telegramUser?: {
    id: number;
    first_name?: string;
    last_name?: string;
    username?: string;
  };
}

export function validateTelegramInitData(initData: string, botToken: string): { valid: boolean; user?: any } {
  if (!initData) return { valid: false };

  try {
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');
    if (!hash) return { valid: false };

    urlParams.delete('hash');

    const params: string[] = [];
    urlParams.forEach((val, key) => {
      params.push(`${key}=${val}`);
    });
    params.sort();

    const dataCheckString = params.join('\n');

    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    if (calculatedHash === hash) {
      const userRaw = urlParams.get('user');
      const user = userRaw ? JSON.parse(userRaw) : undefined;
      return { valid: true, user };
    }
  } catch (err) {
    // invalid parsing
  }

  return { valid: false };
}

export function initDataLockdownMiddleware(req: AuthenticatedTelegramRequest, res: Response, next: NextFunction) {
  const initData = req.headers['x-telegram-init-data'] as string;

  // In unit test environment without initData, allow bypass if header is 'test-allowed'
  if (env.NODE_ENV === 'test' && initData === 'test-allowed') {
    req.telegramUser = { id: 12345678, first_name: 'TestUser' };
    return next();
  }

  if (!initData) {
    return res.status(403).json({ error: 'Access Restricted: Telegram WebApp initData missing.' });
  }

  const { valid, user } = validateTelegramInitData(initData, env.BOT_TOKEN);

  if (!valid) {
    return res.status(403).json({ error: 'Access Restricted: Invalid initData signature.' });
  }

  req.telegramUser = user;
  next();
}
