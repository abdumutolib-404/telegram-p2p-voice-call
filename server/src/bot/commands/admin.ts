import { Bot } from 'grammy';
import crypto from 'crypto';
import { MyContext } from '../types';
import { env } from '../../config/env';
import { getRedis } from '../../config/redis';

// Memory store fallback for single-use admin 2FA tokens
export const adminTokenStore: Map<string, { telegramId: number; expiresAt: number }> = new Map();

export async function generateAdminToken(telegramId: number): Promise<string> {
  const token = crypto.randomBytes(16).toString('hex');
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes

  try {
    const redis = getRedis();
    await redis.set(`admin_token:${token}`, telegramId.toString(), 'EX', 300);
  } catch (err) {
    // fallback
  }

  adminTokenStore.set(token, { telegramId, expiresAt });
  return token;
}

export async function verifyAndConsumeAdminToken(token: string): Promise<number | null> {
  let telegramId: number | null = null;

  // Check memory store
  const entry = adminTokenStore.get(token);
  if (entry) {
    adminTokenStore.delete(token);
    if (Date.now() <= entry.expiresAt) {
      telegramId = entry.telegramId;
    }
  }

  // Check Redis and delete token
  try {
    const redis = getRedis();
    const telegramIdStr = await redis.get(`admin_token:${token}`);
    if (telegramIdStr) {
      await redis.del(`admin_token:${token}`);
      if (!telegramId) {
        telegramId = parseInt(telegramIdStr, 10);
      }
    }
  } catch (err) {
    // fallback
  }

  return telegramId;
}

export function setupAdminCommand(bot: Bot<MyContext>) {
  bot.command('admin', async (ctx) => {
    const userId = ctx.from?.id;

    if (!userId || !env.ADMIN_TELEGRAM_IDS.includes(userId)) {
      // Stealth mode fallback: respond as unrecognized command
      await ctx.reply('Unknown command. Type /start to open main menu.');
      return;
    }

    const token = await generateAdminToken(userId);
    const adminLoginUrl = `${env.MINI_APP_URL.replace(/\/client\/?$/, '')}/admin?token=${token}`;

    await ctx.reply(
      `🔐 *Stealth Admin 2FA Link Generated*\n\n` +
        `Tap the button below to open the Admin WebApp directly inside Telegram.\n` +
        `This link is single-use and valid for *5 minutes*.\n\n` +
        `_Master password challenge is required upon opening._`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '🛡️ Open Admin WebApp',
                web_app: { url: adminLoginUrl },
              },
            ],
          ],
        },
      }
    );
  });
}
