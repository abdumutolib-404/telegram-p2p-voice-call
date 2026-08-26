import { Bot, InlineKeyboard } from 'grammy';
import crypto from 'node:crypto';
import { MyContext } from '../types';
import { prisma } from '../../config/database';
import { env } from '../../config/env';
import { getPaidUserProfile, formatPriceDisplay, getPlansConfig, getEffectiveEntitlement, getUserCallsUsedThisPeriod, getUserRecordingsUsedThisPeriod } from '../../services/plan';
import { getReferralStats, getContestStatus, getActiveBonusCallsCount } from '../../services/referralService';
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
    const activeBonusCalls = await getActiveBonusCallsCount(user.id);
    const profile = getPaidUserProfile({
      ...user,
      dailyCallsUsed: callsUsed,
      recordingsUsed: recUsed,
    });

    const inlineKb = new InlineKeyboard()
      .text('✏️ Re-evaluate Sub-scores', 're_evaluate_subscores')
      .row()
      .text(user.dnd ? '🔔 Turn DND OFF' : '🔕 Turn DND ON', 'toggle_dnd');

    const bonusCallsDisplay = activeBonusCalls > 0 ? ` + <b>${activeBonusCalls} Permanent Bonus Calls</b>` : '';

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
        `• Calls Remaining: ${profile.callsRemaining}${bonusCallsDisplay}\n` +
        `• Max Call Duration: ${profile.maxCallDuration >= 999 ? 'Unlimited' : `${profile.maxCallDuration} minutes`}\n` +
        `• Recordings Remaining: ${profile.recordingsRemaining}\n` +
        `• Recording Retention: ${profile.recordingRetention} day(s)\n` +
        `• DND Status: ${user.dnd ? '🔕 Do Not Disturb' : '🔔 Ready for Calls'}`,
      { parse_mode: 'HTML', reply_markup: inlineKb }
    );
  });

  // 👥 Invite Friends
  bot.hears(/👥 (?:Invite Friends|Referrals)/i, async (ctx) => {
    const telegramId = BigInt(ctx.from?.id || 0);
    const user = await prisma.user.findUnique({ where: { telegramId } });

    if (!user) {
      await ctx.reply('Please type /start to set up your profile first.');
      return;
    }

    const botInfo = await ctx.api.getMe().catch(() => ({ username: 'PairTalkBot' }));
    const botUsername = botInfo.username || 'PairTalkBot';
    const inviteLink = `https://t.me/${botUsername}?start=ref_${user.telegramId}`;

    const stats = await getReferralStats(user.id);
    const contest = await getContestStatus();

    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(inviteLink)}&text=${encodeURIComponent('Join me on PairTalk to practice IELTS Speaking with real learners!')}`;

    const inlineKb = new InlineKeyboard().url('🚀 Share Invite Link', shareUrl);

    if (contest.isActive) {
      inlineKb.row().text('🏆 View Hall of Fame', 'view_hall_of_fame');
    }

    let contestBanner = '';
    if (contest.isActive && contest.contest) {
      contestBanner =
        `🔥 <b>ACTIVE CHAMPIONSHIP:</b> <i>${contest.contest.title}</i>\n` +
        `🏆 Top referrers win exclusive custom prizes!\n\n`;
    }

    await ctx.reply(
      `👥 <b>Invite Friends & Earn Free Bonus Calls!</b>\n\n` +
        contestBanner +
        `🔗 <b>Your Personal Invite Link:</b>\n` +
        `<code>${inviteLink}</code>\n\n` +
        `🎁 <b>How It Works:</b>\n` +
        `1. Send your link to friends.\n` +
        `2. Your friend joins and completes their 1st speaking session (≥30s).\n` +
        `3. You instantly get <b>1 Free Bonus Call</b> (Permanent / Never Expires)!\n\n` +
        `📊 <b>Your Referral Stats:</b>\n` +
        `• <b>Total Friends Invited</b>: <code>${stats.totalInvited}</code>\n` +
        `• <b>Qualifying Sessions Done</b>: <code>${stats.qualifyingCompleted}</code>\n` +
        `• <b>Active Bonus Calls Available</b>: <code>${stats.activeBonusCalls}</code> (Permanent)\n\n` +
        `💡 <i>Bonus calls are saved forever and automatically used once your monthly plan credits reach 0.</i>`,
      { parse_mode: 'HTML', reply_markup: inlineKb }
    );
  });

  // 🏆 Hall of Fame
  bot.hears(/🏆 (?:Hall of Fame|Leaderboard)/i, async (ctx) => {
    const contest = await getContestStatus();

    if (!contest.isActive || !contest.contest) {
      await ctx.reply(
        `🏆 <b>Hall of Fame — Referral Championship</b>\n\n` +
          `ℹ️ <i>There is no active championship at the moment.</i>\n\n` +
          `Stay tuned for the next contest! In the meantime, you can still invite friends using <b>👥 Invite Friends</b> to earn permanent free bonus calls.`,
        { parse_mode: 'HTML' }
      );
      return;
    }

    const { title, description, prizes } = contest.contest;
    let leaderboardText = '';
    if (contest.leaderboard.length === 0) {
      leaderboardText = `<i>No referrals recorded yet. Be the first to invite friends and top the leaderboard!</i>\n`;
    } else {
      leaderboardText = contest.leaderboard
        .map((entry) => {
          const medal = entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : `#${entry.rank}`;
          return `${medal} <b>${entry.alias}</b> — <code>${entry.invitesCount} friend${entry.invitesCount > 1 ? 's' : ''}</code>`;
        })
        .join('\n');
    }

    const inlineKb = new InlineKeyboard().text('👥 Get My Invite Link', 'get_my_invite_link');

    await ctx.reply(
      `🏆 <b>${title}</b>\n\n` +
        `📝 ${description}\n\n` +
        `🎁 <b>Contest Prizes:</b>\n` +
        `${prizes}\n\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `🌟 <b>Live Leaderboard (Top 10):</b>\n\n` +
        leaderboardText,
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
    const now = new Date();
    const recordings = await prisma.callSession.findMany({
      where: {
        OR: [
          { recordedByUserId: user.id },
          { recordedByUserId: { contains: user.id } },
          { recordedByUserId: 'BOTH' },
          { recordedByUserId: null, userAId: user.id },
          { recordedByUserId: null, userBId: user.id },
        ],
        recordingUrl: { not: null },
        status: 'COMPLETED',
        recordingExpiresAt: { gt: now },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    if (recordings.length === 0) {
      await ctx.reply(
        `📁 <b>Session Audio Recordings</b>\n\n` +
          `You have no active audio recordings.\n` +
          `<i>Audio recordings are saved only when you toggle recording ON during a practice call and are automatically removed once their retention period expires.</i>\n\n` +
          `⭐ <b>Retention policy for your ${entitlement.planDisplayName} Plan</b>: ${retentionDays} day${retentionDays > 1 ? 's' : ''}.`,
        { parse_mode: 'HTML' }
      );
      return;
    }

    let messageText =
      `📁 <b>Your Practice Recordings</b>\n` +
      `⏳ <i>Recordings are automatically deleted after <b>${retentionDays} day${retentionDays > 1 ? 's' : ''}</b> according to your ${entitlement.planDisplayName} Plan.</i>\n\n`;
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
      inlineKb.text(`🎧 Play #${idx + 1}`, `play_rec:${rec.id}`).row();
    });

    await ctx.reply(messageText, { parse_mode: 'HTML', reply_markup: inlineKb });
  });

  // ⭐ Subscription / Upgrade Plans
  bot.hears(/⭐ (?:Upgrade|Subscription|Plans)/i, async (ctx) => {
    const telegramId = BigInt(ctx.from?.id || 0);
    const user = await prisma.user.findUnique({ where: { telegramId } });
    const profile = user ? getPaidUserProfile(user) : getPaidUserProfile({ plan: 'FREE' });

    const pendingRequest = await prisma.manualPaymentRequest.findFirst({
      where: { telegramId, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    });

    const inlineKb = new InlineKeyboard();

    if (pendingRequest) {
      inlineKb
        .text('✖️ Cancel Pending Request', `cancel_manual_pay:${pendingRequest.id}`)
        .row();
    } else {
      inlineKb
        .text(`⚡ PLUS (${formatPriceDisplay('PLUS')})`, 'select_plan:PLUS')
        .row()
        .text(`🚀 PRO (${formatPriceDisplay('PRO')})`, 'select_plan:PRO')
        .row()
        .text(`👑 BOSS (${formatPriceDisplay('BOSS')})`, 'select_plan:BOSS');
    }

    let pendingBanner = '';
    if (pendingRequest) {
      const orderNum = pendingRequest.orderNumber || `A${pendingRequest.id.slice(0, 4)}`;
      pendingBanner =
        `⏳ <b>Active Pending Request:</b>\n` +
        `• <b>Plan</b>: ${pendingRequest.plan}\n` +
        `• <b>Order</b>: <code>#${orderNum}</code>\n` +
        `• <b>Status</b>: <i>Under Review by Administrators</i>\n` +
        `<i>You cannot submit another payment request until this one is approved, rejected, or cancelled.</i>\n\n`;
    }

    await ctx.reply(
      `⭐ <b>Subscription Plans & Pricing</b>\n\n` +
        `Current Plan: <b>${profile.planDisplayName}</b>\n` +
        (profile.isActivePaid && profile.expiration ? `Expires: <code>${profile.expiration}</code>\n\n` : '\n') +
        pendingBanner +
        `🆓 <b>FREE Plan</b> (0 UZS / 0 XTR)\n` +
        `• Max Call Duration: 15 minutes\n` +
        `• Monthly Calls: 3\n` +
        `• Monthly Recordings: 1\n` +
        `• Recording Retention: 1 day\n\n` +
        `⚡ <b>PLUS Plan</b> (${formatPriceDisplay('PLUS')})\n` +
        `• Max Call Duration: 30 minutes\n` +
        `• Monthly Calls: 10\n` +
        `• Monthly Recordings: 3\n` +
        `• Recording Retention: 7 days\n\n` +
        `🚀 <b>PRO Plan</b> (${formatPriceDisplay('PRO')})\n` +
        `• Max Call Duration: 60 minutes\n` +
        `• Monthly Calls: 25\n` +
        `• Monthly Recordings: 7\n` +
        `• Recording Retention: 30 days\n\n` +
        `👑 <b>BOSS Plan</b> (${formatPriceDisplay('BOSS')})\n` +
        `• Max Call Duration: 90 minutes\n` +
        `• Monthly Calls: 50\n` +
        `• Monthly Recordings: 15\n` +
        `• Recording Retention: 90 days\n\n` +
        (pendingRequest ? `<i>Manage your pending payment request below:</i>` : `Select a plan to choose your payment method (Telegram Stars or Card):`),
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

  // 🔐 Privacy Policy
  bot.hears('🔐 Privacy Policy', async (ctx) => {
    const inlineKb = new InlineKeyboard().url(
      '🌐 View Privacy Policy',
      env.PRIVACY_POLICY_URL || `${env.MINI_APP_URL}/privacy`
    );
    await ctx.reply(
      `🔐 <b>PairTalk Privacy Policy</b>\n\n` +
        `We are committed to protecting your personal data, ensuring privacy, and maintaining transparency.\n\n` +
        `• <b>100% Anonymous</b>: Randomized aliases with zero phone number or username leaks.\n` +
        `• <b>Ephemeral Audio</b>: Live calls are end-to-end encrypted and never monitored.\n` +
        `• <b>Auto-Purge</b>: Cloud recordings are automatically purged when your tier retention expires.\n\n` +
        `Tap the button below to view the full policy in your browser:`,
      { parse_mode: 'HTML', reply_markup: inlineKb }
    );
  });

  // 📜 Community Guidelines
  bot.hears('📜 Community Guidelines', async (ctx) => {
    const inlineKb = new InlineKeyboard().url(
      '🌐 View Guidelines on Web',
      env.COMMUNITY_GUIDELINES_URL || `${env.MINI_APP_URL}/guidelines`
    );
    await ctx.reply(
      `📜 <b>PairTalk Community Guidelines & Practice Rules</b>\n\n` +
        `Our mission is to provide an encouraging, high-quality, and respectful environment for IELTS Speaking practice.\n\n` +
        `<b>1. Core Principles</b>\n` +
        `• Respect & Courtesy towards every learner.\n` +
        `• Dedicated English Speaking & IELTS practice only.\n` +
        `• Constructive, helpful post-call feedback.\n\n` +
        `<b>2. Prohibited Behavior</b>\n` +
        `• Harassment, bullying, or hate speech.\n` +
        `• Explicit or inappropriate language.\n` +
        `• Rapid queue spamming or matchmaking manipulation.\n` +
        `• Impersonation of administrators or fake payment receipts.\n\n` +
        `<b>3. Moderation & Enforcement</b>\n` +
        `• 24-Hour Timeout for repeated low ratings.\n` +
        `• 7-Day Restriction for continued violations.\n` +
        `• Permanent Ban for severe misconduct.\n\n` +
        `<i>Permanently banned users may submit an appeal using <code>/appeal &lt;reason&gt;</code>.</i>`,
      { parse_mode: 'HTML', reply_markup: inlineKb }
    );
  });
}
