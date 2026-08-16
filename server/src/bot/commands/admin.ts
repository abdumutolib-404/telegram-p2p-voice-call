import { Bot } from 'grammy';
import crypto from 'node:crypto';
import { MyContext } from '../types';
import { env } from '../../config/env';
import { getRedis } from '../../config/redis';
import { prisma } from '../../config/database';
import {
  executeAnnouncementBroadcast,
  isBroadcastActive,
  AnnouncementPayload,
} from '../../services/announcement';

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
    await ctx.reply("Aha! Got you, lil hacker😈\n📞Calling 911...");
  });

  bot.command('user', async (ctx) => {
    const adminId = ctx.from?.id ? String(ctx.from.id) : undefined;
    if (!adminId || !env.ADMIN_TELEGRAM_IDS.includes(adminId)) {
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

  // ============================================================
  // ADMIN-ONLY ANNOUNCEMENT SYSTEM
  // ============================================================

  const handleBroadcastExecution = async (ctx: MyContext, payload: AnnouncementPayload) => {
    const adminId = ctx.from?.id ? String(ctx.from.id) : 'unknown';

    if (isBroadcastActive()) {
      await ctx.reply('⚠️ Another announcement broadcast is currently in progress. Please wait for it to finish.');
      return;
    }

    await ctx.reply('⏳ <b>Broadcasting announcement...</b>\n\nStarting recipient delivery.', { parse_mode: 'HTML' });

    try {
      const stats = await executeAnnouncementBroadcast(ctx.api, payload, adminId);

      await ctx.reply(
        `✅ <b>Announcement sent</b>\n\n` +
          `<b>Sent:</b> ${stats.sent.toLocaleString()}\n` +
          `<b>Failed:</b> ${stats.failed.toLocaleString()}\n` +
          `<b>Skipped:</b> ${stats.skipped.toLocaleString()}\n` +
          `<b>Total:</b> ${stats.total.toLocaleString()}`,
        { parse_mode: 'HTML' }
      );
    } catch (err: unknown) {
      console.error('[AdminAnnouncement] broadcast_failed', err);
      await ctx.reply(
        `❌ <b>Broadcast Error:</b> ${err instanceof Error ? err.message : 'Broadcast failed.'}`,
        { parse_mode: 'HTML' }
      );
    }
  };

  bot.command('announce', async (ctx) => {
    const adminId = ctx.from?.id ? String(ctx.from.id) : undefined;
    if (!adminId || !env.ADMIN_TELEGRAM_IDS.includes(adminId)) {
      return;
    }

    if (isBroadcastActive()) {
      await ctx.reply('⚠️ Another announcement broadcast is currently in progress. Please wait for it to finish.');
      return;
    }

    // Path 1: Replying to a message with /announce
    const replyMsg = ctx.message?.reply_to_message;
    if (replyMsg) {
      if (replyMsg.photo && replyMsg.photo.length > 0) {
        const highestRes = replyMsg.photo[replyMsg.photo.length - 1];
        await handleBroadcastExecution(ctx, {
          type: 'photo',
          fileId: highestRes.file_id,
          caption: replyMsg.caption,
          captionEntities: replyMsg.caption_entities,
        });
        return;
      }

      if (replyMsg.video) {
        await handleBroadcastExecution(ctx, {
          type: 'video',
          fileId: replyMsg.video.file_id,
          caption: replyMsg.caption,
          captionEntities: replyMsg.caption_entities,
        });
        return;
      }

      if (replyMsg.animation) {
        await handleBroadcastExecution(ctx, {
          type: 'animation',
          fileId: replyMsg.animation.file_id,
          caption: replyMsg.caption,
          captionEntities: replyMsg.caption_entities,
        });
        return;
      }

      if (replyMsg.text) {
        await handleBroadcastExecution(ctx, {
          type: 'text',
          text: replyMsg.text,
          entities: replyMsg.entities,
        });
        return;
      }
    }

    // Path 2: /announce with inline text (e.g. "/announce Hello everyone!")
    const fullText = ctx.message?.text || '';
    const rawMatch = fullText.match(/^\/announce(?:@\w+)?(?:\s+([\s\S]+))?$/i);
    const inlineContent = rawMatch?.[1]?.trim();

    if (inlineContent) {
      await handleBroadcastExecution(ctx, {
        type: 'text',
        text: inlineContent,
      });
      return;
    }

    // Path 3: Standalone /announce -> Enter interactive announcement capture mode
    ctx.session.step = 'awaiting_announcement';
    await ctx.reply(
      `📢 <b>Announcement Broadcast Mode</b>\n\n` +
        `Please send the message, photo, video, or GIF you wish to broadcast to all active learners.\n\n` +
        `Type <code>/cancel</code> to abort.`,
      { parse_mode: 'HTML' }
    );
  });

  bot.command('cancel', async (ctx, next) => {
    if (ctx.session.step === 'awaiting_announcement') {
      ctx.session.step = 'idle';
      await ctx.reply('Announcement broadcast cancelled.');
      return;
    }
    return next();
  });

  // Interactive message interceptor when in awaiting_announcement mode
  if (typeof bot.on === 'function') {
    bot.on(['message:text', 'message:photo', 'message:video', 'message:animation'], async (ctx, next) => {
      if (ctx.session?.step !== 'awaiting_announcement') {
        return next();
      }

    const adminId = ctx.from?.id ? String(ctx.from.id) : undefined;
    if (!adminId || !env.ADMIN_TELEGRAM_IDS.includes(adminId)) {
      ctx.session.step = 'idle';
      return next();
    }

    // If it's a command like /cancel or /start, let next() handle it
    if (ctx.message?.text?.startsWith('/')) {
      return next();
    }

    ctx.session.step = 'idle';

    if (ctx.message?.photo && ctx.message.photo.length > 0) {
      const highestRes = ctx.message.photo[ctx.message.photo.length - 1];
      await handleBroadcastExecution(ctx, {
        type: 'photo',
        fileId: highestRes.file_id,
        caption: ctx.message.caption,
        captionEntities: ctx.message.caption_entities,
      });
      return;
    }

    if (ctx.message?.video) {
      await handleBroadcastExecution(ctx, {
        type: 'video',
        fileId: ctx.message.video.file_id,
        caption: ctx.message.caption,
        captionEntities: ctx.message.caption_entities,
      });
      return;
    }

    if (ctx.message?.animation) {
      await handleBroadcastExecution(ctx, {
        type: 'animation',
        fileId: ctx.message.animation.file_id,
        caption: ctx.message.caption,
        captionEntities: ctx.message.caption_entities,
      });
      return;
    }

    if (ctx.message?.text) {
      await handleBroadcastExecution(ctx, {
        type: 'text',
        text: ctx.message.text,
        entities: ctx.message.entities,
      });
      return;
    }

      await ctx.reply('❌ Unsupported media format. Please send text, photo, video, or GIF.');
    });
  }
}
