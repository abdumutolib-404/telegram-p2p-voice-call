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
        `🔐 *Stealth Admin 2FA Link Generated*\n\n` +
          `Tap the button below to open the Admin WebApp directly inside Telegram.\n` +
          `This link is single-use and valid for *5 minutes*.\n\n` +
          `*Admin Quick Commands:*\n` +
          `• \`/setplan <ID|@alias> <FREE|PLUS|PRO>\`\n` +
          `• \`/resetlimit <ID|@alias>\`\n` +
          `• \`/user <ID|@alias>\`\n\n` +
          `_Master password challenge is required upon opening web app._`,
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
        `⚙️ *Admin Plan Management*\n\n` +
          `*Usage:* \`/setplan <telegramId or alias> <FREE | PLUS | PRO>\`\n\n` +
          `*Examples:*\n` +
          `• \`/setplan ${adminId} PRO\`\n` +
          `• \`/setplan 123456789 PLUS\`\n` +
          `• \`/setplan Partner-4921 FREE\``,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    const [targetId, tierRaw] = parts;
    const tier = tierRaw.toUpperCase();
    if (!['FREE', 'PLUS', 'PRO'].includes(tier)) {
      await ctx.reply('❌ Invalid plan tier. Must be FREE, PLUS, or PRO.');
      return;
    }

    const user = await findUserByIdOrAlias(targetId);
    if (!user) {
      await ctx.reply(`❌ User not found for identifier: \`${targetId}\``, { parse_mode: 'Markdown' });
      return;
    }

    const dailyLimit = getDailyLimitForPlan(tier);
    const maxDuration = getMaxDurationForPlan(tier);

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        plan: tier,
        dailyLimit,
        maxDuration,
        dailyCallsUsed: 0,
      },
    });

    await ctx.reply(
      `✅ *Plan Successfully Updated*\n\n` +
        `• *User*: \`${updated.alias}\` (ID: \`${updated.telegramId.toString()}\`)\n` +
        `• *New Plan*: *${updated.plan}*\n` +
        `• *Daily Limit*: ${updated.dailyLimit >= 999 ? 'Unlimited' : `${updated.dailyLimit} calls/day`}\n` +
        `• *Max Duration*: ${updated.maxDuration} minutes\n` +
        `• *Daily Calls Used*: Reset to 0`,
      { parse_mode: 'Markdown' }
    );

    if (updated.telegramId.toString() !== adminId) {
      await bot.api.sendMessage(
        updated.telegramId.toString(),
        `⭐ *Subscription Plan Upgraded!*\n\n` +
          `Your account has been upgraded to *${updated.plan}* by the administrator.\n` +
          `• *Daily Limit*: ${updated.dailyLimit >= 999 ? 'Unlimited' : `${updated.dailyLimit} calls/day`}\n` +
          `• *Max Duration*: ${updated.maxDuration} minutes\n\n` +
          `Enjoy unlimited speaking practice!`,
        { parse_mode: 'Markdown' }
      ).catch(() => null);
    }
  });

  bot.command('resetlimit', async (ctx) => {
    const adminId = ctx.from?.id ? String(ctx.from.id) : undefined;
    if (!adminId || !env.ADMIN_TELEGRAM_IDS.includes(adminId)) {
      await ctx.reply('Unknown command.');
      return;
    }

    const text = ctx.message?.text || '';
    const parts = text.split(/\s+/).slice(1);
    const targetId = parts[0] || adminId;

    const user = await findUserByIdOrAlias(targetId);
    if (!user) {
      await ctx.reply(`❌ User not found for identifier: \`${targetId}\``, { parse_mode: 'Markdown' });
      return;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { dailyCallsUsed: 0 },
    });

    await ctx.reply(
      `🔄 *Daily Call Limit Reset*\n\n` +
        `Reset calls used today to *0* for \`${user.alias}\` (Telegram ID: \`${user.telegramId.toString()}\`).`,
      { parse_mode: 'Markdown' }
    );
  });

  bot.command('user', async (ctx) => {
    const adminId = ctx.from?.id ? String(ctx.from.id) : undefined;
    if (!adminId || !env.ADMIN_TELEGRAM_IDS.includes(adminId)) {
      await ctx.reply('Unknown command.');
      return;
    }

    const text = ctx.message?.text || '';
    const parts = text.split(/\s+/).slice(1);
    const targetId = parts[0] || adminId;

    const user = await findUserByIdOrAlias(targetId);
    if (!user) {
      await ctx.reply(`❌ User not found for identifier: \`${targetId}\``, { parse_mode: 'Markdown' });
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const usedToday = user.lastCallDate === today ? user.dailyCallsUsed : 0;
    const lim = user.dailyLimit >= 999 ? 'Unlimited' : `${user.dailyLimit} calls/day`;

    await ctx.reply(
      `👤 *User Inspection*\n\n` +
        `• *Alias*: \`${user.alias}\`\n` +
        `• *Telegram ID*: \`${user.telegramId.toString()}\`\n` +
        `• *Plan*: *${user.plan}*\n` +
        `• *Calls Used Today*: ${usedToday} / ${lim}\n` +
        `• *Max Duration*: ${user.maxDuration} minutes\n` +
        `• *Recording Retention*: ${user.retentionOverride ? `${user.retentionOverride} days (Admin Override)` : 'Plan Default'}\n` +
        `• *Overall Band*: ${user.band.toFixed(1)} (FC:${user.subFC} LR:${user.subLR} GRA:${user.subGRA} P:${user.subP})\n` +
        `• *Warnings*: ${user.warningCount}\n` +
        `• *Status*: ${user.isPermanentlyBanned ? '⛔ Permanently Banned' : user.isBanned ? '🚫 Temporarily Suspended' : '✅ Active'}`,
      { parse_mode: 'Markdown' }
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
        `⚙️ *Admin Retention Override*\n\n` +
          `*Usage:* \`/setretention <telegramId or alias> <days>\`\n\n` +
          `*Examples:*\n` +
          `• \`/setretention ${adminId} 30\`\n` +
          `• \`/setretention Partner-4921 7\``,
        { parse_mode: 'Markdown' }
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
      await ctx.reply(`❌ User not found for identifier: \`${targetId}\``, { parse_mode: 'Markdown' });
      return;
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { retentionOverride: days },
    });

    await ctx.reply(
      `✅ *Recording Retention Override Applied*\n\n` +
        `• *User*: \`${updated.alias}\` (ID: \`${updated.telegramId.toString()}\`)\n` +
        `• *Recording Retention*: ${updated.retentionOverride} days (Admin Override)`,
      { parse_mode: 'Markdown' }
    );
  });
}

