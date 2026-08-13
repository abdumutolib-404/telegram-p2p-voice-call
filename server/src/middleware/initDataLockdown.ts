import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';

export interface TelegramUser {
  readonly id: bigint;
  readonly first_name?: string;
  readonly last_name?: string;
  readonly username?: string;
  readonly language_code?: string;
  readonly is_premium?: boolean;
  readonly allows_write_to_pm?: boolean;
}

export interface AuthenticatedTelegramRequest extends Request {
  telegramUser?: TelegramUser;
}

export interface InitDataValidationResult {
  valid: boolean;
  user?: TelegramUser;
}

const MAX_AGE_SECONDS = 24 * 60 * 60;
const MAX_FUTURE_SECONDS = 60;
const HEX_HASH_PATTERN = /^[a-f0-9]{64}$/i;

function parseTelegramUser(raw: string | null): TelegramUser | undefined {
  if (raw === null) return undefined;

  try {
    const idMatch = raw.match(/"id"\s*:\s*"?(\d+)"?/);
    if (!idMatch) return undefined;
    const idText = idMatch[1];
    if (idText === '0') return undefined;

    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;

    const record = value as Record<string, unknown>;

    return {
      id: BigInt(idText),
      first_name: typeof record.first_name === 'string' ? record.first_name : undefined,
      last_name: typeof record.last_name === 'string' ? record.last_name : undefined,
      username: typeof record.username === 'string' ? record.username : undefined,
      language_code: typeof record.language_code === 'string' ? record.language_code : undefined,
      is_premium: typeof record.is_premium === 'boolean' ? record.is_premium : undefined,
      allows_write_to_pm: typeof record.allows_write_to_pm === 'boolean' ? record.allows_write_to_pm : undefined,
    };
  } catch {
    return undefined;
  }
}

/** Validates Telegram WebApp initData using Telegram's documented HMAC-SHA256 scheme. */
export function validateTelegramInitData(initData: string, botToken: string): InitDataValidationResult {
  if (!initData || !botToken) return { valid: false };

  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    const authDateRaw = params.get('auth_date');

    if (!hash || !HEX_HASH_PATTERN.test(hash) || !authDateRaw || !/^\d+$/.test(authDateRaw)) {
      return { valid: false };
    }

    const authDate = Number(authDateRaw);
    if (!Number.isSafeInteger(authDate)) return { valid: false };

    const now = Math.floor(Date.now() / 1000);
    if (now - authDate > MAX_AGE_SECONDS || authDate - now > MAX_FUTURE_SECONDS) {
      return { valid: false };
    }

    params.delete('hash');
    params.sort();
    const dataCheckString = [...params.entries()]
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const expectedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest();
    const providedHash = Buffer.from(hash, 'hex');

    if (expectedHash.length !== providedHash.length || !crypto.timingSafeEqual(expectedHash, providedHash)) {
      return { valid: false };
    }

    const user = parseTelegramUser(params.get('user'));
    if (!user) return { valid: false };

    return { valid: true, user };
  } catch (error: unknown) {
    console.error('[InitData] validation_failed', {
      error: error instanceof Error ? error.message : 'unknown_error',
    });
    return { valid: false };
  }
}

export function initDataLockdownMiddleware(
  req: AuthenticatedTelegramRequest,
  res: Response,
  next: NextFunction,
): void {
  try {
    const header = req.headers['x-telegram-init-data'];
    const initData = typeof header === 'string' ? header : undefined;

    if (env.NODE_ENV === 'test' && initData === 'test-allowed') {
      req.telegramUser = { id: BigInt(12345678), first_name: 'TestUser' };
      next();
      return;
    }

    if (!initData) {
      res.status(403).json({ error: 'Access Restricted: Telegram WebApp initData missing.' });
      return;
    }

    const result = validateTelegramInitData(initData, env.BOT_TOKEN);
    if (!result.valid || !result.user) {
      res.status(403).json({ error: 'Access Restricted: Invalid initData signature.' });
      return;
    }

    req.telegramUser = result.user;
    next();
  } catch (error: unknown) {
    console.error('[InitData] middleware_failed', {
      error: error instanceof Error ? error.message : 'unknown_error',
    });
    res.status(500).json({ error: 'Internal authentication error.' });
  }
}
