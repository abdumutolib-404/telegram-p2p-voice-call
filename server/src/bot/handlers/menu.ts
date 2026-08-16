import { Bot, InlineKeyboard } from 'grammy';
import crypto from 'node:crypto';
import { MyContext } from '../types';
import { prisma } from '../../config/database';
import { getPaidUserProfile, formatPriceDisplay, getPlansConfig, getEffectiveEntitlement, getUserCallsUsedThisPeriod, getUserRecordingsUsedThisPeriod } from '../../services/plan';
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

    const callsUsed = await getUserCallsUsedThisPeriod(user.id, user);
    const recUsed = await getUserRecordingsUsedThisPeriod(user.id, user);
    const profile = getPaidUserProfile({
      ...user,
      dailyCallsUsed: callsUsed,
      recordingsUsed: recUsed,
    });

    const inlineKb = new InlineKeyboard()
      .text('✏️ Re-evaluate Sub-scores', 're_evaluate_subscores')
      .row()
      .text(user.dnd ? '🔔 Turn DND OFF' : '🔕 Turn DND ON', 'toggle_dnd');

    await ctx.reply(
      `👤 <b>Your Student Profile</b>\n\n` +
        `• <b>Permanent Alias</b>: <code>${user.alias}</code> (Locked)\n\n` +
        `• <b>Overall IELTS Band</b>: ${user.band.toFixed(1)}\n` +
        `  - FC (Fluency & Coherence): ${user.subFC.toFixed(1)}\n` +
        `  - LR (Lexical Resource): ${user.subLR.toFixed(1)}\n` +
        `  - GRA (Grammar): ${user.subGRA.toFixed(1)}\n` +
        `  - P (Pronunciation): ${user.subP.toFixed(1)}\n\n` +
        `• <b>Subscription Plan</b>: ${profile.planDisplayName}\n\n` +
        `📊 <b>Plan Entitlements & Usage:</b>\n` +
        `• Calls Remaining: ${profile.callsRemaining}\n` +
        `• Max Call Duration: ${profile.maxCallDuration >= 999 ? 'Unlimited' : `${profile.maxCallDuration} minutes`}\n` +
        `• Recordings Remaining: ${profile.recordingsRemaining}\n` +
        `• Recording Retention: ${profile.recordingRetention} day(s)\n` +
        `• DND Status: ${user.dnd ? '🔕 Do Not Disturb' : '🔔 Ready for Calls'}`,
      { parse_mode: 'HTML', reply_markup: inlineKb }
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
        status: 'COMPLETED',
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    if (recordings.length === 0) {
      await ctx.reply(
        `📁 <b>Session Audio Recordings</b>\n\n` +
          `You have no active audio recordings.\n` +
          `<i>Recordings are saved automatically when recording is toggled ON during a practice call.</i>\n\n` +
          `⭐ <b>Retention policy for your account</b>: ${retentionDays} day(s).`,
        { parse_mode: 'HTML' }
      );
      return;
    }

    let messageText = `📁 <b>Your Recent Practice Recordings</b> (Retention: ${retentionDays}d):\n\n`;
    const inlineKb = new InlineKeyboard();

    recordings.forEach((rec, idx) => {
      const d = rec.createdAt;
      const year = d.getUTCFullYear();
      const month = String(d.getUTCMonth() + 1).padStart(2, '0');
      const day = String(d.getUTCDate()).padStart(2, '0');
      const hours = String(d.getUTCHours()).padStart(2, '0');
      const minutes = String(d.getUTCMinutes()).padStart(2, '0');
      const dateTimeStr = `${year}-${month}-${day} ${hours}:${minutes}`;

      let durationStr = 'Duration unavailable';
      const durationSec = (rec as any).recordingDuration || rec.duration;
      if (typeof durationSec === 'number' && durationSec > 0) {
        const mins = Math.floor(durationSec / 60);
        const secs = durationSec % 60;
        durationStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
      }

      messageText += `${idx + 1}. 📅 <b>${dateTimeStr}</b> — <code>${durationStr}</code>\n`;
      inlineKb.text(`🎧 Play #${idx + 1}`, `play_recording_${rec.id}`).row();
    });

    await ctx.reply(messageText, { parse_mode: 'HTML', reply_markup: inlineKb });
  });

  // ⭐ Subscription / Upgrade Plans
  bot.hears(/⭐ (?:Upgrade|Subscription|Plans)/i, async (ctx) => {
    const telegramId = BigInt(ctx.from?.id || 0);
    const user = await prisma.user.findUnique({ where: { telegramId } });
    const profile = user ? getPaidUserProfile(user) : getPaidUserProfile({ plan: 'FREE' });

    const inlineKb = new InlineKeyboard()
      .text(`⚡ PLUS (${formatPriceDisplay('PLUS')})`, 'select_plan:PLUS')
      .row()
      .text(`🚀 PRO (${formatPriceDisplay('PRO')})`, 'select_plan:PRO')
      .row()
      .text(`👑 BOSS (${formatPriceDisplay('BOSS')})`, 'select_plan:BOSS');

    await ctx.reply(
      `⭐ <b>Subscription Plans & Pricing</b>\n\n` +
        `Current Plan: <b>${profile.planDisplayName}</b>\n` +
        (profile.isActivePaid && profile.expiration ? `Expires: <code>${profile.expiration}</code>\n\n` : '\n') +
        `🆓 <b>FREE Plan</b> (0 UZS / 0 XTR)\n` +
        `• Max Call Duration: 15 minutes\n` +
        `• Monthly Calls: 3\n` +
        `• Recording Retention: 1 day\n\n` +
        `⚡ <b>PLUS Plan</b> (${formatPriceDisplay('PLUS')})\n` +
        `• Max Call Duration: 30 minutes\n` +
        `• Monthly Calls: 10\n` +
        `• Recording Retention: 7 days\n\n` +
        `🚀 <b>PRO Plan</b> (${formatPriceDisplay('PRO')})\n` +
        `• Max Call Duration: 60 minutes\n` +
        `• Monthly Calls: 25\n` +
        `• Recording Retention: 30 days\n\n` +
        `👑 <b>BOSS Plan</b> (${formatPriceDisplay('BOSS')})\n` +
        `• Max Call Duration: 90 minutes\n` +
        `• Monthly Calls: 50\n` +
        `• Recording Retention: 90 days\n\n` +
        `Select a plan to choose your payment method (Telegram Stars or Card):`,
      { parse_mode: 'HTML', reply_markup: inlineKb }
    );
  });

  // 📞 Direct Call / 👥 Favorites
  bot.hears(['📞 Direct Call', '👥 Favorites'], async (ctx) => {
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
        `📞 <b>Direct Call - Favorite Partners</b>\n\n` +
          `You have no favorite partners saved yet.\n` +
          `<i>After completing a practice session, add your partner to favorites to call them directly anytime!</i>`,
        { parse_mode: 'HTML' }
      );
      return;
    }

    let text = `📞 <b>Your Favorite Practice Partners:</b>\n\n`;
    const inlineKb = new InlineKeyboard();

    favorites.forEach((fav, idx) => {
      const p = fav.partner;
      const statusIcon = p.dnd ? '🔕 (DND)' : '🔔 (Available)';
      text += `${idx + 1}. <b>${p.alias}</b> — Band ${p.band.toFixed(1)} ${statusIcon}\n`;
      inlineKb.text(`📞 Call ${p.alias}`, `direct_call:${p.id}`).text(`❌ Remove`, `remove_favorite:${p.id}`).row();
    });

    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: inlineKb });
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
      `💬 <b>IELTS Speaking P2P Support</b>\n\n` +
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

      await ctx.reply(
        `✅ <b>Appeal Submitted Successfully</b>\n\n` +
          `Your appeal has been delivered to the moderation team's Appeals Queue.\n` +
          `You will receive an automated notification here once reviewed.`,
        { parse_mode: 'HTML' }
      );
    } catch (err) {
      console.error('[Bot] Failed to create appeal:', err);
      await ctx.reply('⚠️ Failed to record your appeal. Please try again in a moment.');
    }
  });
}
