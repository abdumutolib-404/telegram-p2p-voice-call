import { Bot, InlineKeyboard } from 'grammy';
import { MyContext } from '../types';
import { prisma } from '../../config/database';
import { getPlansConfig, getRetentionDaysForPlan } from '../../services/plan';

export function setupMenuHandlers(bot: Bot<MyContext>) {
  // 👤 Profile
  bot.hears('👤 Profile', async (ctx) => {
    const telegramId = BigInt(ctx.from?.id || 0);
    const user = await prisma.user.findUnique({ where: { telegramId } });

    if (!user) {
      await ctx.reply('Please type /start to set up your profile first.');
      return;
    }

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
        `• *Subscription Plan*: *${user.plan}*\n` +
        `• *Daily Limit*: ${user.dailyLimit} calls/day\n` +
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

    const retentionDays = getRetentionDaysForPlan(user.plan);
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
          `⭐ *Retention policy for ${user.plan} plan*: ${retentionDays} day(s).`,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    let messageText = `📁 *Your Recent Practice Recordings* (Retention: ${retentionDays}d):\n\n`;
    const inlineKb = new InlineKeyboard();

    recordings.forEach((rec, idx) => {
      const dateStr = rec.createdAt.toISOString().split('T')[0];
      const durationMin = Math.floor(rec.duration / 60);
      messageText += `${idx + 1}. 🎙️ Call on *${dateStr}* (${durationMin} mins)\n`;
      inlineKb.text(`🎧 Play #${idx + 1}`, `play_rec:${rec.id}`).row();
    });

    await ctx.reply(messageText, { parse_mode: 'Markdown', reply_markup: inlineKb });
  });

  // ⭐ Plans
  bot.hears('⭐ Plans', async (ctx) => {
    const telegramId = BigInt(ctx.from?.id || 0);
    const user = await prisma.user.findUnique({ where: { telegramId } });
    const plans = getPlansConfig();

    const currentPlan = user?.plan || 'FREE';

    const freeDur = plans.FREE.maxDuration >= 999 ? 'Unlimited' : `${plans.FREE.maxDuration} minutes`;
    const freeLim = plans.FREE.dailyLimit >= 999 ? 'Unlimited' : `${plans.FREE.dailyLimit} calls`;

    const plusDur = plans.PLUS.maxDuration >= 999 ? 'Unlimited' : `${plans.PLUS.maxDuration} minutes`;
    const plusLim = plans.PLUS.dailyLimit >= 999 ? 'Unlimited' : `${plans.PLUS.dailyLimit} calls`;

    const proDur = plans.PRO.maxDuration >= 999 ? 'Unlimited' : `${plans.PRO.maxDuration} minutes`;
    const proLim = plans.PRO.dailyLimit >= 999 ? 'Unlimited' : `${plans.PRO.dailyLimit} calls`;

    const inlineKb = new InlineKeyboard()
      .text(`⭐ Upgrade Plus (${plans.PLUS.starsPrice} Stars)`, 'buy_plan:PLUS')
      .row()
      .text(`⭐ Upgrade Pro (${plans.PRO.starsPrice} Stars)`, 'buy_plan:PRO');

    await ctx.reply(
      `⭐ *Subscription Plans & Limits*\n\n` +
        `Current Plan: *${currentPlan}*\n\n` +
        `🆓 *FREE Plan*\n` +
        `• Max Call Duration: ${freeDur}\n` +
        `• Daily Call Limit: ${freeLim}\n` +
        `• Recording Storage: ${plans.FREE.retentionDays} day(s)\n\n` +
        `⚡ *PLUS Plan* (${plans.PLUS.starsPrice} Telegram Stars)\n` +
        `• Max Call Duration: ${plusDur}\n` +
        `• Daily Call Limit: ${plusLim}\n` +
        `• Recording Storage: ${plans.PLUS.retentionDays} days\n\n` +
        `🚀 *PRO Plan* (${plans.PRO.starsPrice} Telegram Stars)\n` +
        `• Max Call Duration: ${proDur}\n` +
        `• Daily Call Limit: ${proLim}\n` +
        `• Recording Storage: ${plans.PRO.retentionDays} days\n\n` +
        `Select a plan to upgrade via Telegram Stars:`,
      { parse_mode: 'Markdown', reply_markup: inlineKb }
    );
  });

  // 📞 Direct Call
  bot.hears('📞 Direct Call', async (ctx) => {
    const telegramId = BigInt(ctx.from?.id || 0);
    const user = await prisma.user.findUnique({
      where: { telegramId },
      include: { favorites: { include: { partner: true } } },
    });

    if (!user) {
      await ctx.reply('Please type /start to register.');
      return;
    }

    if (user.favorites.length === 0) {
      await ctx.reply(
        `📞 *Direct Call - Favorite Partners*\n\n` +
          `You have no favorite partners saved yet.\n` +
          `After practicing with a partner, save them as a favorite to initiate direct calls anytime!`,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    const inlineKb = new InlineKeyboard();
    let text = `📞 *Your Favorite Partners*:\n\n`;

    user.favorites.forEach((fav, idx) => {
      text += `${idx + 1}. *${fav.partner.alias}* (Band: ${fav.partner.band.toFixed(1)})\n`;
      inlineKb.text(`📞 Call ${fav.partner.alias}`, `direct_call:${fav.partner.id}`).row();
    });

    await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: inlineKb });
  });

  // 💬 Support
  bot.hears('💬 Support', async (ctx) => {
    const telegramId = BigInt(ctx.from?.id || 0);
    const user = await prisma.user.findUnique({ where: { telegramId } });

    const inlineKb = new InlineKeyboard().text('⚖️ Submit Appeal / Message Admin', 'submit_appeal');

    await ctx.reply(
      `💬 *IELTS Speaking P2P Support*\n\n` +
        `Need help or have questions about partner matching, LiveKit calls, or subscriptions?\n\n` +
        `• *FAQ*: Matchmaking pairs weak/strong sub-scores for mutual practice.\n` +
        `• *Audio*: Headphones are recommended for optimal call clarity.\n` +
        `• *Moderation*: Misconduct triggers automatic warning, temp ban, or permanent lock.\n\n` +
        `To send a message or unban appeal to the admin team, tap below or type:\n\`/appeal <your reason or question>\``,
      { parse_mode: 'Markdown', reply_markup: inlineKb }
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

    const appealText = ctx.match?.trim();
    if (!appealText) {
      await ctx.reply(
        '✍️ *How to Submit an Appeal / Support Message:*\n\nType `/appeal followed by your reason`.\nExample:\n`/appeal I would like to request an unban because my network dropped.`',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    try {
      await prisma.unblockAppeal.create({
        data: {
          userId: user.id,
          telegramId,
          alias: user.alias,
          banReason: user.isBanned || user.isPermanentlyBanned ? 'User restriction' : 'Support inquiry',
          appealText,
          status: 'PENDING',
        },
      });

      await ctx.reply(
        `✅ *Appeal Submitted Successfully*\n\n` +
          `Your message has been delivered to the moderation team's Appeals Queue.\n` +
          `You will receive an automated notification here once reviewed.`,
        { parse_mode: 'Markdown' }
      );
    } catch (err) {
      console.error('[Bot] Failed to create appeal:', err);
      await ctx.reply('⚠️ Failed to record your appeal. Please try again in a moment.');
    }
  });
}
