import { Bot } from 'grammy';
import crypto from 'node:crypto';
import { MyContext } from '../types';
import { env } from '../../config/env';
import { getRedis } from '../../config/redis';
import { prisma } from '../../config/database';
import { getDailyLimitForPlan, getMaxDurationForPlan } from '../../services/plan';

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

async function findUserByIdOrAlias(identifier: string) {
  const clean = identifier.trim().replace(/^@/, '');
  try {
    const numId = BigInt(clean);
    const byTg = await prisma.user.findUnique({ where: { telegramId: numId } });
    if (byTg) return byTg;
  } catch {
    // not a number, fallback to alias / uuid
  }

  const byAlias = await prisma.user.findFirst({
    where: {
      OR: [
        { alias: { equals: clean, mode: 'insensitive' } },
        { id: clean },
      ],
    },
  });
  return byAlias;
}

export function setupAdminCommand(bot: Bot<MyContext>): void {
  bot.command('admin', async (ctx) => {
    try {
      const userId = ctx.from?.id ? String(ctx.from.id) : undefined;
      if (!userId || !env.ADMIN_TELEGRAM_IDS.includes(userId)) {
        await ctx.reply('Unknown command. Type /start to open main menu.');
        return;
      }

      const token = await generateAdminToken(userId);
      const adminLoginUrl = `${env.ADMIN_PANEL_URL.replace(/\/$/, '')}?token=${encodeURIComponent(token)}`;

      await ctx.reply(
        `🔐 <b>Stealth Admin 2FA Link Generated</b>\n\n` +
          `Tap the button below to open the Admin Web Console.\n` +
          `This single-use 2FA token is valid for <b>5 minutes</b>.\n\n` +
          `<b>Admin Quick Commands:</b>\n` +
          `• <code>/setplan &lt;ID|@alias&gt; &lt;FREE|PLUS|PRO|BOSS&gt;</code>\n` +
          `• <code>/resetlimit &lt;ID|@alias&gt;</code>\n` +
          `• <code>/user &lt;ID|@alias&gt;</code>`,
        {
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: [[{ text: '🛡️ Open Admin Panel', web_app: { url: adminLoginUrl } }]] },
        },
      );
    } catch (error: unknown) {
      console.error('[Admin] command_failed', {
        error: error instanceof Error ? error.message : 'unknown_error',
      });
      await ctx.reply('Unable to open admin access right now.');
    }
  });

  bot.command('setplan', async (ctx) => {
    const adminId = ctx.from?.id ? String(ctx.from.id) : undefined;
    if (!adminId || !env.ADMIN_TELEGRAM_IDS.includes(adminId)) {
      await ctx.reply('Unknown command.');
      return;
    }

    const text = ctx.message?.text || '';
    const parts = text.split(/\s+/).slice(1);
    if (parts.length < 2) {
      await ctx.reply(
        `⚙️ <b>Admin Plan Management</b>\n\n` +
          `<b>Usage:</b> <code>/setplan &lt;telegramId or alias&gt; &lt;FREE | PLUS | PRO | BOSS&gt;</code>\n\n` +
          `<b>Examples:</b>\n` +
          `• <code>/setplan ${adminId} PRO</code>\n` +
          `• <code>/setplan 123456789 PLUS</code>\n` +
          `• <code>/setplan Partner-4921 FREE</code>`,
        { parse_mode: 'HTML' }
      );
      return;
    }

    const [targetId, tierRaw] = parts;
    const tier = tierRaw.toUpperCase();
    if (!['FREE', 'PLUS', 'PRO', 'BOSS'].includes(tier)) {
      await ctx.reply('❌ Invalid plan tier. Must be FREE, PLUS, PRO, or BOSS.');
      return;
    }

    const user = await findUserByIdOrAlias(targetId);
    if (!user) {
      await ctx.reply(`❌ User not found for identifier: <code>${targetId}</code>`, { parse_mode: 'HTML' });
      return;
    }

    const maxDuration = getMaxDurationForPlan(tier);
    const dailyLimit = getDailyLimitForPlan(tier);

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        plan: tier,
        maxDuration,
        dailyLimit,
        dailyCallsUsed: 0,
        subscriptionStatus: tier === 'FREE' ? 'NONE' : 'ACTIVE',
        subscriptionExpiresAt: tier === 'FREE' ? null : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    await ctx.reply(
      `✅ <b>Plan Updated Successfully</b>\n\n` +
        `• <b>User</b>: <code>${updated.alias}</code> (ID: <code>${updated.telegramId.toString()}</code>)\n` +
        `• <b>New Plan</b>: <b>${updated.plan}</b>\n` +
        `• <b>Max Duration</b>: ${updated.maxDuration >= 999 ? 'Unlimited' : `${updated.maxDuration} mins`}\n` +
        `• <b>Daily Limit</b>: ${updated.dailyLimit >= 999 ? 'Unlimited' : `${updated.dailyLimit} calls/day`}`,
      { parse_mode: 'HTML' }
    );
  });

  bot.command('resetlimit', async (ctx) => {
    const adminId = ctx.from?.id ? String(ctx.from.id) : undefined;
    if (!adminId || !env.ADMIN_TELEGRAM_IDS.includes(adminId)) {
      await ctx.reply('Unknown command.');
      return;
    }

    const text = ctx.message?.text || '';
    const targetId = text.split(/\s+/)[1];
    if (!targetId) {
      await ctx.reply('<b>Usage:</b> <code>/resetlimit &lt;telegramId or alias&gt;</code>', { parse_mode: 'HTML' });
      return;
    }

    const user = await findUserByIdOrAlias(targetId);
    if (!user) {
      await ctx.reply(`❌ User not found for identifier: <code>${targetId}</code>`, { parse_mode: 'HTML' });
      return;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { dailyCallsUsed: 0 },
    });

    await ctx.reply(
      `✅ <b>Daily Limit Reset</b>\n\n` +
        `• <b>User</b>: <code>${user.alias}</code>\n` +
        `• <b>Daily Calls Used</b>: 0 / ${user.dailyLimit}`,
      { parse_mode: 'HTML' }
    );
  });

  bot.command('user', async (ctx) => {
    const adminId = ctx.from?.id ? String(ctx.from.id) : undefined;
    if (!adminId || !env.ADMIN_TELEGRAM_IDS.includes(adminId)) {
      await ctx.reply('Unknown command.');
      return;
    }

    const text = ctx.message?.text || '';
    const targetId = text.split(/\s+/)[1];
    if (!targetId) {
      await ctx.reply('<b>Usage:</b> <code>/user &lt;telegramId or alias&gt;</code>', { parse_mode: 'HTML' });
      return;
    }

    const user = await findUserByIdOrAlias(targetId);
    if (!user) {
      await ctx.reply(`❌ User not found for identifier: <code>${targetId}</code>`, { parse_mode: 'HTML' });
      return;
    }

    await ctx.reply(
      `👤 <b>User Inspection</b>\n\n` +
        `• <b>Alias</b>: <code>${user.alias}</code>\n` +
        `• <b>Telegram ID</b>: <code>${user.telegramId.toString()}</code>\n` +
        `• <b>Band Score</b>: ${user.band.toFixed(1)} (FC: ${user.subFC.toFixed(1)}, LR: ${user.subLR.toFixed(1)}, GRA: ${user.subGRA.toFixed(1)}, P: ${user.subP.toFixed(1)})\n` +
        `• <b>Plan</b>: <b>${user.plan}</b>\n` +
        `• <b>Daily Limit</b>: ${user.dailyCallsUsed} / ${user.dailyLimit}\n` +
        `• <b>Status</b>: ${user.isPermanentlyBanned ? '⛔ Permanently Banned' : user.isBanned ? '🚫 Temporarily Suspended' : '✅ Active'}`,
      { parse_mode: 'HTML' }
    );
  });

  bot.command('setretention', async (ctx) => {
    const adminId = ctx.from?.id ? String(ctx.from.id) : undefined;
    if (!adminId || !env.ADMIN_TELEGRAM_IDS.includes(adminId)) {
      await ctx.reply('Unknown command.');
      return;
    }

    const text = ctx.message?.text || '';
    const parts = text.split(/\s+/).slice(1);
    if (parts.length < 2) {
      await ctx.reply(
        `⚙️ <b>Admin Retention Override</b>\n\n` +
          `<b>Usage:</b> <code>/setretention &lt;telegramId or alias&gt; &lt;days&gt;</code>\n\n` +
          `<b>Examples:</b>\n` +
          `• <code>/setretention ${adminId} 30</code>\n` +
          `• <code>/setretention Partner-4921 7</code>`,
        { parse_mode: 'HTML' }
      );
      return;
    }

    const [targetId, daysRaw] = parts;
    const days = parseInt(daysRaw, 10);
    if (isNaN(days) || days <= 0 || days > 365) {
      await ctx.reply('❌ Invalid retention days (must be between 1 and 365).');
      return;
    }

    const user = await findUserByIdOrAlias(targetId);
    if (!user) {
      await ctx.reply(`❌ User not found for identifier: <code>${targetId}</code>`, { parse_mode: 'HTML' });
      return;
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { retentionOverride: days },
    });

    await ctx.reply(
      `✅ <b>Recording Retention Override Applied</b>\n\n` +
        `• <b>User</b>: <code>${updated.alias}</code> (ID: <code>${updated.telegramId.toString()}</code>)\n` +
        `• <b>Recording Retention</b>: ${updated.retentionOverride} days (Admin Override)`,
      { parse_mode: 'HTML' }
    );
  });
}
