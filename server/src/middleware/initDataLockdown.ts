import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { env } from '../config/env';

export interface TelegramUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  allows_write_to_pm?: boolean;
}

export interface AuthenticatedTelegramRequest extends Request {
  telegramUser?: TelegramUser;
}

export interface InitDataValidationResult {
  valid: boolean;
  user?: TelegramUser;
}

/**
 * Validates Telegram WebApp initData HMAC-SHA256 signature and freshness.
 */
export function validateTelegramInitData(initData: string, botToken: string): InitDataValidationResult {
  if (!initData || typeof initData !== 'string') {
    return { valid: false };
  }

  try {
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');
    if (!hash) return { valid: false };

    // Freshness check: reject initData older than 24 hours (86400 sec) or in future (>60 sec)
    const authDate = Number(urlParams.get('auth_date') || 0);
    const nowInSec = Math.floor(Date.now() / 1000);
    if (!authDate || nowInSec - authDate > 86400 || authDate - nowInSec > 60) {
      return { valid: false };
    }

    urlParams.delete('hash');

    const params: string[] = [];
    urlParams.forEach((val, key) => {
      params.push(`${key}=${val}`);
    });
    params.sort();

    const dataCheckString = params.join('\n');

    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    const calcBuf = Buffer.from(calculatedHash, 'hex');
    const hashBuf = Buffer.from(hash, 'hex');

    // Constant-time comparison with explicit buffer length verification
    if (calcBuf.length === hashBuf.length && crypto.timingSafeEqual(calcBuf, hashBuf)) {
      const userRaw = urlParams.get('user');
      let user: TelegramUser | undefined = undefined;

      if (userRaw) {
        try {
          const parsed = JSON.parse(userRaw);
          if (parsed && typeof parsed === 'object' && typeof parsed.id === 'number') {
            user = parsed as TelegramUser;
          }
        } catch {
          return { valid: false };
        }
      }

      return { valid: true, user };
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[InitData Lockdown] Signature parsing error:', message);
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
