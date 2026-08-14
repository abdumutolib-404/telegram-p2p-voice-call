import { Bot, InlineKeyboard } from 'grammy';
import crypto from 'node:crypto';
import { MyContext } from '../types';
import { prisma } from '../../config/database';
import { getEffectiveEntitlement } from '../../services/plan';
import { getRedis } from '../../config/redis';

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
  // 👤 Profile
  bot.hears('👤 Profile', async (ctx) => {
    const telegramId = BigInt(ctx.from?.id || 0);
    const user = await prisma.user.findUnique({ where: { telegramId } });

    if (!user) {
      await ctx.reply('Please type /start to set up your profile first.');
      return;
    }

    const entitlement = getEffectiveEntitlement(user);
    const today = new Date().toISOString().slice(0, 10);
    const callsUsedToday = user.lastCallDate === today ? user.dailyCallsUsed : 0;
    const callsRemainingText = entitlement.isUnlimited
      ? 'Unlimited (∞)'
      : `${Math.max(0, entitlement.dailyLimit - callsUsedToday)} / ${entitlement.dailyLimit} remaining`;

    const inlineKb = new InlineKeyboard()
      .text('✏️ Re-evaluate Sub-scores', 're_evaluate_subscores')
      .row()
      .text(user.dnd ? '🔔 Turn DND OFF' : '🔕 Turn DND ON', 'toggle_dnd');

    await ctx.reply(
      `👤 *Your Student Profile*\n\n` +
        `• *Permanent Alias*: \`${user.alias}\` (Locked)\n` +
        `• *Overall IELTS Band*: ${user.band.toFixed(1)}\n` +
        `  - FC (Fluency & Coherence): ${user.subFC.toFixed(1)}\n` +
        `  - LR (Lexical Resource): ${user.subLR.toFixed(1)}\n` +
        `  - GRA (Grammar): ${user.subGRA.toFixed(1)}\n` +
        `  - P (Pronunciation): ${user.subP.toFixed(1)}\n` +
        `• *Subscription Plan*: *${entitlement.planDisplayName}*\n\n` +
        `📊 *Today's Entitlements & Usage:*\n` +
        `• *Calls Remaining Today*: ${callsRemainingText} (Used: ${callsUsedToday})\n` +
        `• *Max Call Duration*: ${entitlement.maxDurationMinutes} minutes\n` +
        `• *Recording Retention*: ${entitlement.retentionDays} day(s) (${entitlement.retentionSource === 'ADMIN_OVERRIDE' ? 'Admin Override' : 'Plan Default'})\n` +
        `• *DND Status*: ${user.dnd ? '🔕 Do Not Disturb ON' : '🔔 Ready for Calls'}`,
      { parse_mode: 'Markdown', reply_markup: inlineKb }
    );
  });

  // 📁 Recordings
  bot.hears('📁 Recordings', async (ctx) => {
    const telegramId = BigInt(ctx.from?.id || 0);
    const user = await prisma.user.findUnique({ where: { telegramId } });

    if (!user) {
      await ctx.reply('Please type /start to register.');
      return;
    }

    const entitlement = getEffectiveEntitlement(user);
    const retentionDays = entitlement.retentionDays;
    const recordings = await prisma.callSession.findMany({
      where: {
        OR: [{ userAId: user.id }, { userBId: user.id }],
        recordingUrl: { not: null },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    if (recordings.length === 0) {
      await ctx.reply(
        `📁 *Session Audio Recordings*\n\n` +
          `You have no active audio recordings.\n` +
          `_Recordings are saved automatically when recording is toggled ON during a practice call._\n\n` +
          `⭐ *Retention policy for your account*: ${retentionDays} day(s).`,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    let messageText = `📁 *Your Recent Practice Recordings* (Retention: ${retentionDays}d):\n\n`;
    const inlineKb = new InlineKeyboard();

    recordings.forEach((rec, idx) => {
      const dateStr = rec.createdAt.toISOString().split('T')[0];
      const durationMin = Math.round((rec.duration || 0) / 60);
      messageText += `${idx + 1}. 📅 *${dateStr}* (${durationMin} min)\n`;
      inlineKb.text(`🎧 Play #${idx + 1}`, `play_recording_${rec.id}`).row();
    });

    await ctx.reply(messageText, { parse_mode: 'Markdown', reply_markup: inlineKb });
  });

  // ⭐ Subscription / Upgrade Plans
  bot.hears(/⭐ (?:Upgrade|Subscription|Plans)/i, async (ctx) => {
    const telegramId = BigInt(ctx.from?.id || 0);
    const user = await prisma.user.findUnique({ where: { telegramId } });
    const currentPlan = user?.plan || 'FREE';
    const entitlement = user ? getEffectiveEntitlement(user) : getEffectiveEntitlement({ plan: 'FREE' });

    const inlineKb = new InlineKeyboard()
      .text('⚡ Upgrade to PLUS (150 Stars)', 'buy_plan_PLUS')
      .row()
      .text('🚀 Upgrade to PRO (500 Stars)', 'buy_plan_PRO');

    await ctx.reply(
      `⭐ *Subscription Plans & Entitlements*\n\n` +
        `Current Plan: *${entitlement.planDisplayName}*\n\n` +
        `🆓 *FREE Plan*\n` +
        `• Max Call Duration: 15 minutes\n` +
        `• Daily Call Limit: 3 calls\n` +
        `• Recording Storage: 1 day\n\n` +
        `⚡ *PLUS Plan* (150 Telegram Stars)\n` +
        `• Max Call Duration: 30 minutes\n` +
        `• Daily Call Limit: 10 calls\n` +
        `• Recording Storage: 7 days\n\n` +
        `🚀 *PRO Plan* (500 Telegram Stars)\n` +
        `• Max Call Duration: 60 minutes\n` +
        `• Daily Call Limit: Unlimited (∞)\n` +
        `• Recording Storage: 30 days\n\n` +
        `Select a plan to upgrade via Telegram Stars:`,
      { parse_mode: 'Markdown', reply_markup: inlineKb }
    );
  });

  // 👥 Favorites
  bot.hears('👥 Favorites', async (ctx) => {
    const telegramId = BigInt(ctx.from?.id || 0);
    const user = await prisma.user.findUnique({ where: { telegramId } });

    if (!user) {
      await ctx.reply('Please register with /start first.');
      return;
    }

    const favorites = await prisma.favoritePartner.findMany({
      where: { userId: user.id },
      include: { partner: true },
    });

    if (favorites.length === 0) {
      await ctx.reply(
        `👥 *Favorite Practice Partners*\n\n` +
          `You have no favorite partners saved yet.\n` +
          `_After any call, you can add your partner to favorites to practice again!_`,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    let text = `👥 *Your Favorite Practice Partners:*\n\n`;
    const inlineKb = new InlineKeyboard();

    favorites.forEach((fav, idx) => {
      const p = fav.partner;
      const statusIcon = p.dnd ? '🔕 (DND)' : '🔔 (Available)';
      text += `${idx + 1}. *${p.alias}* — Band ${p.band.toFixed(1)} ${statusIcon}\n`;
      inlineKb.text(`📞 Call ${p.alias}`, `call_favorite_${p.id}`).text(`❌ Remove`, `remove_favorite_${p.id}`).row();
    });

    await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: inlineKb });
  });

  // 💬 Support
  bot.hears('💬 Support', async (ctx) => {
    const telegramId = BigInt(ctx.from?.id || 0);
    const user = await prisma.user.findUnique({ where: { telegramId } });
    const isPermBanned = user?.isPermanentlyBanned === true;

    const inlineKb = new InlineKeyboard();
    if (isPermBanned) {
      inlineKb.text('⚖️ Submit Unban Appeal', 'submit_appeal');
    }

    await ctx.reply(
      `💬 *IELTS Speaking P2P Support*\n\n` +
        `Need help or have questions about partner matching, LiveKit calls, or subscriptions?\n\n` +
        `• *FAQ*: Matchmaking pairs weak/strong sub-scores for mutual practice.\n` +
        `• *Audio*: Headphones are recommended for optimal call clarity.\n` +
        `• *Moderation*: Community rules enforce fair practice and mutual respect.\n\n` +
        (isPermBanned
          ? `Your account is permanently restricted. You may submit an appeal using the button below or type:\n\`/appeal <your reason>\``
          : `For general support or bug reports, please contact our community administrators.`),
      { parse_mode: 'Markdown', reply_markup: isPermBanned ? inlineKb : undefined }
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

    // ISSUE 1: Appeals are strictly locked to PERMANENTLY BANNED users
    if (!user.isPermanentlyBanned) {
      if (user.isBanned && !user.isPermanentlyBanned) {
        await ctx.reply(
          `⏳ *Temporary Suspension Active*\n\n` +
            `Your account is currently under a 6-hour temporary suspension.\n\n` +
            `• Temporary suspensions expire automatically and cannot be appealed.\n` +
            `• Once the suspension period elapses, your practice privileges will be restored automatically.`,
          { parse_mode: 'Markdown' }
        );
        return;
      }

      await ctx.reply(
        `ℹ️ *Appeals Unavailable*\n\n` +
          `Appeals are available only to permanently banned accounts.\n` +
          `Your account is currently in good standing.`,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    const appealText = ctx.match?.trim();
    if (!appealText) {
      await ctx.reply(
        '✍️ *How to Submit an Unban Appeal:*\n\nType `/appeal followed by your explanation`.\nExample:\n`/appeal I would like to request an unban because my network dropped during practice.`',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    try {
      const outcome = await withUserAppealLock(user.id, async () => {
        return await prisma.$transaction(async (tx) => {
          // Touch user row to acquire exclusive transaction lock
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
          `⏳ *Appeal Already Under Review*\n\n` +
            `You already have a pending appeal submitted on *${dateStr}*.\n\n` +
            `Our moderation team reviews every appeal in the queue. You will be notified automatically once a decision is made.`,
          { parse_mode: 'Markdown' }
        );
        return;
      }

      await ctx.reply(
        `✅ *Appeal Submitted Successfully*\n\n` +
          `Your appeal has been delivered to the moderation team's Appeals Queue.\n` +
          `You will receive an automated notification here once reviewed.`,
        { parse_mode: 'Markdown' }
      );
    } catch (err) {
      console.error('[Bot] Failed to create appeal:', err);
      await ctx.reply('⚠️ Failed to record your appeal. Please try again in a moment.');
    }
  });
}
