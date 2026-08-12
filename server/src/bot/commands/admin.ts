import { Bot } from 'grammy';
import crypto from 'node:crypto';
import { MyContext } from '../types';
import { env } from '../../config/env';
import { getRedis } from '../../config/redis';

export const adminTokenStore = new Map<string, { telegramId: number; expiresAt: number }>();
const ADMIN_TOKEN_TTL_SECONDS = 300;
const ADMIN_CONSUME_SCRIPT = `-- ADMIN_TOKEN_CONSUME\nlocal value = redis.call('GET', KEYS[1])\nif value then redis.call('DEL', KEYS[1]) end\nreturn value or false`;

export async function generateAdminToken(telegramId: number | string): Promise<string> {
  const numId = Number(telegramId);
  if (!Number.isSafeInteger(numId) || numId <= 0) throw new TypeError('Invalid Telegram administrator ID');
  const token = crypto.randomBytes(16).toString('hex'); // 32 hex characters

  try {
    const redis = getRedis();
    const stored = await redis.set(`admin_token:${token}`, numId.toString(), 'EX', ADMIN_TOKEN_TTL_SECONDS);
    if (stored !== 'OK') throw new Error('Failed to persist admin token');
  } catch (error: unknown) {
    if (env.NODE_ENV === 'production') {
      console.error('[Admin] token_persist_failed', { error: error instanceof Error ? error.message : 'unknown_error' });
      throw error;
    }
    adminTokenStore.set(token, { telegramId: numId, expiresAt: Date.now() + ADMIN_TOKEN_TTL_SECONDS * 1000 });
  }

  return token;
}

export async function verifyAndConsumeAdminToken(token: string): Promise<number | null> {
  if (!/^[a-f0-9]{32}$/i.test(token)) return null;

  try {
    const redis = getRedis();
    const value = await redis.eval(ADMIN_CONSUME_SCRIPT, 1, `admin_token:${token}`);
    if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value);
  } catch (error: unknown) {
    if (env.NODE_ENV === 'production') {
      console.error('[Admin] token_consume_failed', { error: error instanceof Error ? error.message : 'unknown_error' });
      return null;
    }
  }

  const entry = adminTokenStore.get(token);
  if (!entry) return null;
  adminTokenStore.delete(token);
  return Date.now() <= entry.expiresAt ? entry.telegramId : null;
}

export function setupAdminCommand(bot: Bot<MyContext>): void {
  bot.command('admin', async (ctx) => {
    try {
      const userId = ctx.from?.id;
      if (!userId || !env.ADMIN_TELEGRAM_IDS.includes(userId)) {
        await ctx.reply('Unknown command. Type /start to open main menu.');
        return;
      }

      const token = await generateAdminToken(userId);
      const adminLoginUrl = `${env.ADMIN_PANEL_URL.replace(/\/$/, '')}?token=${encodeURIComponent(token)}`;

      await ctx.reply(
        `🔐 *Stealth Admin 2FA Link Generated*\n\n` +
          `Tap the button below to open the Admin WebApp directly inside Telegram.\n` +
          `This link is single-use and valid for *5 minutes*.\n\n` +
          `_Master password challenge is required upon opening._`,
        {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: [[{ text: '🛡️ Open Admin WebApp', web_app: { url: adminLoginUrl } }]] },
        },
      );
    } catch (error: unknown) {
      console.error('[Admin] command_failed', {
        error: error instanceof Error ? error.message : 'unknown_error',
      });
      await ctx.reply('Unable to open admin access right now.');
    }
  });
}
