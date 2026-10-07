import { Bot, InlineKeyboard } from 'grammy';
import crypto from 'node:crypto';
import { MyContext } from '../types';
import { prisma } from '../../config/database';
import { getRedis } from '../../config/redis';
import { logger } from '../../utils/logger';
import { moderationService } from '../../services/moderation';
import { renderPlansOverview } from './payments';

async function withUserAppealLock<T>(userId: string, operation: () => Promise<T>): Promise<T> {
  const lockKey = `appeal_lock:${userId}`;
  const token = crypto.randomUUID();
  const deadline = Date.now() + 5000;

  try {
    const redis = getRedis();
    while (Date.now() < deadline) {
      const acquired = await redis.set(lockKey, token, 'PX', 5000, 'NX');
      if (acquired === 'OK') {
        try {
          return await operation();
        } finally {
          const script = `if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0`;
          await redis.eval(script, 1, lockKey, token).catch(() => undefined);
        }
      }
      await new Promise((r) => setTimeout(r, 25));
    }
  } catch {
    // Redis unavailable: fallback to direct execution
  }

  return await operation();
}

export function setupMenuHandlers(bot: Bot<MyContext>) {
  bot.hears(/⭐ (?:Upgrade|Subscription|Plans)/i, renderPlansOverview);
  bot.command('plans', renderPlansOverview);
  bot.hears('💬 Support', async (ctx) => {
    const telegramId = BigInt(ctx.from?.id || 0);
    const user = await prisma.user.findUnique({ where: { telegramId } });
    const isPermBanned = user?.isPermanentlyBanned === true;

    const inlineKb = new InlineKeyboard();
    if (isPermBanned) {
      inlineKb.text('⚖️ Submit Unban Appeal', 'submit_appeal');
    }

    await ctx.reply(
      `💬 <b>PairTalk Support</b>\n\n` +
        `Need help or have questions about partner matching, practice calls, or subscriptions?\n\n` +
        `• <b>FAQ</b>: Matchmaking pairs complementary sub-scores for targeted practice.\n` +
        `• <b>Audio</b>: Headphones are recommended for optimal clarity.\n` +
        `• <b>Moderation</b>: Community rules enforce fair practice and mutual respect.\n\n` +
        (isPermBanned
          ? `Your account is permanently restricted. You may submit an appeal using the button below or type:\n<code>/appeal &lt;your reason&gt;</code>`
          : `For general support or billing questions, use /paysupport or contact <b>@PairTalkSupport</b>.`),
      { parse_mode: 'HTML', reply_markup: isPermBanned ? inlineKb : undefined }
    );
  });

  // Command: /appeal <text>
  bot.command('appeal', async (ctx) => {
    const telegramId = BigInt(ctx.from?.id || 0);
    const user = await prisma.user.findUnique({ where: { telegramId } });
    if (!user) {
      await ctx.reply('Please register with /start first.');
      return;
    }

    // Appeals are strictly locked to PERMANENTLY BANNED users
    if (!user.isPermanentlyBanned) {
      if (user.isBanned && !user.isPermanentlyBanned) {
        await ctx.reply(
          `⏳ <b>Temporary Suspension Active</b>\n\n` +
            `Your account is currently under a temporary suspension.\n\n` +
            `• Temporary suspensions expire automatically and cannot be appealed.\n` +
            `• Once the suspension period elapses, your practice privileges will be restored automatically.`,
          { parse_mode: 'HTML' }
        );
        return;
      }

      await ctx.reply(
        `ℹ️ <b>Appeals Unavailable</b>\n\n` +
          `Appeals are available only to permanently banned accounts.\n` +
          `Your account is currently in good standing.`,
        { parse_mode: 'HTML' }
      );
      return;
    }

    const appealText = ctx.match?.trim();
    if (!appealText) {
      await ctx.reply(
        '✍️ <b>How to Submit an Unban Appeal:</b>\n\nType <code>/appeal followed by your explanation</code>.\nExample:\n<code>/appeal I would like to request an unban because my network dropped during practice.</code>',
        { parse_mode: 'HTML' }
      );
      return;
    }

    if (appealText.length > 1000) {
      await ctx.reply(
        '⚠️ <b>Appeal Too Long:</b>\n\nPlease keep your explanation concise (maximum 1,000 characters).',
        { parse_mode: 'HTML' }
      );
      return;
    }

    try {
      const outcome = await withUserAppealLock(user.id, async () => {
        return await prisma.$transaction(async (tx) => {
          await tx.user.update({
            where: { id: user.id },
            data: { updatedAt: new Date() },
          });

          const pendingAppeal = await tx.unblockAppeal.findFirst({
            where: {
              userId: user.id,
              status: 'PENDING',
            },
          });

          if (pendingAppeal) {
            return { status: 'already_pending' as const, appeal: pendingAppeal };
          }

          const created = await tx.unblockAppeal.create({
            data: {
              userId: user.id,
              telegramId,
              alias: user.alias,
              banReason: 'Permanent account lock',
              appealText,
              status: 'PENDING',
            },
          });

          return { status: 'created' as const, appeal: created };
        });
      });

      if (outcome.status === 'already_pending') {
        const dateStr = outcome.appeal.createdAt.toISOString().split('T')[0];
        await ctx.reply(
          `⏳ <b>Appeal Already Under Review</b>\n\n` +
            `You already have a pending appeal submitted on <b>${dateStr}</b>.\n\n` +
            `Our moderation team reviews every appeal in the queue. You will be notified automatically once a decision is made.`,
          { parse_mode: 'HTML' }
        );
        return;
      }

      await moderationService.invalidateBanCache(telegramId);

      await ctx.reply(
        `✅ <b>Appeal Submitted Successfully</b>\n\n` +
          `Your appeal has been delivered to the moderation team's Appeals Queue.\n` +
          `You will receive an automated notification here once reviewed.`,
        { parse_mode: 'HTML' }
      );
    } catch (err) {
      logger.error('Failed to create appeal', {
        service: 'bot',
        event: 'appeal_creation_failed',
        userId: user.id,
      }, err);
      await ctx.reply('⚠️ Failed to record your appeal. Please try again in a moment.');
    }
  });

}
