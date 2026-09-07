import { Bot, InlineKeyboard } from 'grammy';
import { MyContext } from '../types';
import { prisma } from '../../config/database';
import { env } from '../../config/env';
import { calculateOverallBand, generateUniqueAlias, getMainMenuKeyboard } from '../commands/start';
import { getEffectiveEntitlement, getUserCallsUsedThisPeriod, calculateEffectiveCallDuration } from '../../services/plan';
import { escapeHtml } from '../../utils/sanitize';
import { logger } from '../../utils/logger';
import { scheduleAuthoritativeSessionTeardown, scheduleConnectionHandshakeTimer, setRoomDurationLimit } from '../../socket/signaling';
import { publishGatewayCommand } from '../../config/redis';
import { getActiveBonusCallsCount } from '../../services/referralService';
import {
  trackDirectCallMessage,
  deleteDirectCallMessage,
  cleanupDirectCallMessages,
} from '../../services/directCallMessages';

export function setupCallbackHandlers(bot: Bot<MyContext>) {
  // Callback: set_sub_fc:<score>
  bot.callbackQuery(/^set_sub_fc:(.+)$/, async (ctx) => {
    const fc = parseFloat(ctx.match[1]);
    ctx.session.fc = fc;
    ctx.session.step = 'lr';

    const inlineKb = new InlineKeyboard();
    for (const s of [5, 6, 7, 8, 9]) {
      inlineKb.text(String(s), `set_sub_lr:${s}`);
    }

    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      `🎯 <b>Step 2/4: Select your Lexical Resource (LR) score:</b>\n\n` +
        `• FC: <b>${fc}</b>`,
      { parse_mode: 'HTML', reply_markup: inlineKb }
    );
  });

  // Callback: set_sub_lr:<score>
  bot.callbackQuery(/^set_sub_lr:(.+)$/, async (ctx) => {
    const lr = parseFloat(ctx.match[1]);
    ctx.session.lr = lr;
    ctx.session.step = 'gra';

    const inlineKb = new InlineKeyboard();
    for (const s of [5, 6, 7, 8, 9]) {
      inlineKb.text(String(s), `set_sub_gra:${s}`);
    }

    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      `🎯 <b>Step 3/4: Select your Grammatical Range & Accuracy (GRA) score:</b>\n\n` +
        `• FC: <b>${ctx.session.fc}</b>\n` +
        `• LR: <b>${lr}</b>`,
      { parse_mode: 'HTML', reply_markup: inlineKb }
    );
  });

  // Callback: set_sub_gra:<score>
  bot.callbackQuery(/^set_sub_gra:(.+)$/, async (ctx) => {
    const gra = parseFloat(ctx.match[1]);
    ctx.session.gra = gra;
    ctx.session.step = 'p';

    const inlineKb = new InlineKeyboard();
    for (const s of [5, 6, 7, 8, 9]) {
      inlineKb.text(String(s), `set_sub_p:${s}`);
    }

    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      `🎯 <b>Step 4/4: Select your Pronunciation (P) score:</b>\n\n` +
        `• FC: <b>${ctx.session.fc}</b>\n` +
        `• LR: <b>${ctx.session.lr}</b>\n` +
        `• GRA: <b>${gra}</b>`,
      { parse_mode: 'HTML', reply_markup: inlineKb }
    );
  });

  // Callback: set_sub_p:<score>
  bot.callbackQuery(/^set_sub_p:(.+)$/, async (ctx) => {
    const p = parseFloat(ctx.match[1]);
    ctx.session.p = p;
    ctx.session.step = 'confirm';

    const fc = ctx.session.fc || 6.0;
    const lr = ctx.session.lr || 6.0;
    const gra = ctx.session.gra || 6.0;
    const overallBand = calculateOverallBand(fc, lr, gra, p);

    const inlineKb = new InlineKeyboard()
      .text('✅ Save & Lock Profile', 'confirm_subscores')
      .row()
      .text('🔄 Start Over', 're_evaluate_subscores');

    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      `📊 <b>Sub-scores Summary</b>\n\n` +
        `• Fluency & Coherence (FC): <b>${fc}</b>\n` +
        `• Lexical Resource (LR): <b>${lr}</b>\n` +
        `• Grammatical Range (GRA): <b>${gra}</b>\n` +
        `• Pronunciation (P): <b>${p}</b>\n\n` +
        `⭐ <b>Calculated Overall IELTS Band</b>: <b>${overallBand.toFixed(1)}</b>\n\n` +
        `Click <b>Save & Lock Profile</b> to finalize setup.`,
      { parse_mode: 'HTML', reply_markup: inlineKb }
    );
  });

  // Callback: confirm_subscores
  bot.callbackQuery('confirm_subscores', async (ctx) => {
    void ctx.answerCallbackQuery().catch(() => undefined);
    const telegramId = BigInt(ctx.from.id);
    const fc = ctx.session.fc || 6.0;
    const lr = ctx.session.lr || 6.0;
    const gra = ctx.session.gra || 6.0;
    const p = ctx.session.p || 6.0;
    const overallBand = calculateOverallBand(fc, lr, gra, p);

    const alias = generateUniqueAlias();
    let user;
    try {
      user = await prisma.user.upsert({
        where: { telegramId },
        create: {
          telegramId,
          alias,
          subFC: fc,
          subLR: lr,
          subGRA: gra,
          subP: p,
          band: overallBand,
          onboarded: true,
        },
        update: {
          subFC: fc,
          subLR: lr,
          subGRA: gra,
          subP: p,
          band: overallBand,
          onboarded: true,
        },
      });
    } catch (err) {
      logger.error('confirm_subscores error', {
        service: 'bot',
        event: 'confirm_subscores_failed',
        telegramId: telegramId.toString(),
      }, err);
      await ctx.answerCallbackQuery({ text: 'Failed to save profile. Please try again.' });
      return;
    }

    ctx.session.step = 'idle';
    const menuKb = getMainMenuKeyboard();

    await ctx.answerCallbackQuery({ text: 'Profile saved!' });
    await ctx.reply(
      `🎉 <b>Profile Onboarding Complete!</b>\n\n` +
        `• <b>Permanent Alias</b>: <code>${escapeHtml(user.alias)}</code> (Locked)\n` +
        `• <b>Target IELTS Band</b>: ${user.band.toFixed(1)}\n\n` +
        `You can now tap <b>📞 Find Partner</b> to match with complementary speaking partners.`,
      { parse_mode: 'HTML', reply_markup: menuKb }
    );
  });

  // Callback: re_evaluate_subscores
  bot.callbackQuery('re_evaluate_subscores', async (ctx) => {
    ctx.session.step = 'fc';
    const inlineKb = new InlineKeyboard();
    for (const s of [5, 6, 7, 8, 9]) {
      inlineKb.text(String(s), `set_sub_fc:${s}`);
    }

    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      `🎯 <b>Step 1/4: Select your Fluency & Coherence (FC) score:</b>`,
      { parse_mode: 'HTML', reply_markup: inlineKb }
    );
  });

  // Callback: toggle_dnd
  bot.callbackQuery('toggle_dnd', async (ctx) => {
    void ctx.answerCallbackQuery().catch(() => undefined);
    const telegramId = BigInt(ctx.from.id);
    try {
      const user = await prisma.user.findUnique({ where: { telegramId } });
      if (!user) {
        await ctx.answerCallbackQuery({ text: 'User not found.' });
        return;
      }

      const newDnd = !user.dnd;
      await prisma.user.update({
        where: { id: user.id },
        data: { dnd: newDnd },
      });

      await ctx.answerCallbackQuery({
        text: newDnd ? '🔕 Do Not Disturb enabled.' : '🔔 Ready for calls!',
      });

      const inlineKb = new InlineKeyboard()
        .text('✏️ Re-evaluate Sub-scores', 're_evaluate_subscores')
        .row()
        .text(newDnd ? '🔔 Turn DND OFF' : '🔕 Turn DND ON', 'toggle_dnd');

      await ctx.editMessageReplyMarkup({ reply_markup: inlineKb });
    } catch (err) {
      logger.error('toggle_dnd error', {
        service: 'bot',
        event: 'toggle_dnd_failed',
        telegramId: telegramId.toString(),
      }, err);
      await ctx.answerCallbackQuery({ text: 'Failed to toggle DND status.' });
    }
  });

  // Callback: mute_surge_alerts
  bot.callbackQuery('mute_surge_alerts', async (ctx) => {
    const telegramId = BigInt(ctx.from.id);
    try {
      await prisma.user.updateMany({
        where: { telegramId },
        data: { dnd: true },
      });

      await ctx.answerCallbackQuery({
        text: '🔕 Peak surge alerts have been muted! You can re-enable alerts anytime in 👤 Profile.',
        show_alert: true,
      });

      try {
        await ctx.editMessageReplyMarkup({
          reply_markup: new InlineKeyboard()
            .webApp('🎙️ Open Web App', env.MINI_APP_URL || 'https://t.me/PairTalkBot/call')
            .row()
            .text('🔔 Unmute Alerts', 'toggle_dnd'),
        });
      } catch {
        // ignore if message editing is disallowed or old
      }
    } catch (err) {
      logger.error('mute_surge_alerts error', {
        service: 'bot',
        event: 'mute_surge_alerts_failed',
        telegramId: telegramId.toString(),
      }, err);
      await ctx.answerCallbackQuery({ text: 'Failed to mute surge alerts.' });
    }
  });

  // Callback: favorite_partner:<partnerOrSessionId>
  bot.callbackQuery(/^favorite_partner:(.+)$/, async (ctx) => {
    const partnerOrSessionId = ctx.match[1];
    const telegramId = BigInt(ctx.from.id);

    try {
      const user = await prisma.user.findUnique({ where: { telegramId } });
      if (!user) {
        await ctx.answerCallbackQuery({ text: 'User not found.', show_alert: true });
        return;
      }

      let partner = await prisma.user.findUnique({ where: { id: partnerOrSessionId } });
      if (!partner) {
        const session = await prisma.callSession.findUnique({
          where: { id: partnerOrSessionId },
          include: { userA: true, userB: true },
        });
        if (session) {
          partner = session.userAId === user.id ? session.userB : session.userA;
        }
      }

      if (!partner) {
        await ctx.answerCallbackQuery({ text: 'Partner not found.', show_alert: true });
        return;
      }

      const existing = await prisma.favoritePartner.findUnique({
        where: {
          userId_partnerId: {
            userId: user.id,
            partnerId: partner.id,
          },
        },
      });

      if (existing) {
        await ctx.answerCallbackQuery({ text: `ℹ️ ${partner.alias} is already in your favorites!`, show_alert: true });
        return;
      }

      await prisma.favoritePartner.create({
        data: {
          userId: user.id,
          partnerId: partner.id,
        },
      });

      await ctx.answerCallbackQuery({ text: `⭐ ${partner.alias} saved to Favorites!`, show_alert: true });
    } catch (err) {
      logger.error('favorite_partner error', {
        service: 'bot',
        event: 'favorite_partner_failed',
        telegramId: telegramId.toString(),
      }, err);
      await ctx.answerCallbackQuery({ text: 'Failed to save favorite.', show_alert: true });
    }
  });

  // Callback: remove_favorite:<partnerId>
  bot.callbackQuery(/^remove_favorite:(.+)$/, async (ctx) => {
    const partnerId = ctx.match[1];
    const telegramId = BigInt(ctx.from.id);
    try {
      const user = await prisma.user.findUnique({ where: { telegramId } });
      if (user) {
        await prisma.favoritePartner.deleteMany({
          where: { userId: user.id, partnerId },
        });
      }
      await ctx.answerCallbackQuery({ text: 'Partner removed from favorites.', show_alert: true });
      await ctx.editMessageText('❌ Partner removed from your favorites list.').catch(() => undefined);
    } catch {
      await ctx.answerCallbackQuery({ text: 'Unable to remove favorite.', show_alert: true });
    }
  });

  // Callback: direct_call:<partnerId> or call_favorite:<partnerId>
  bot.callbackQuery(/^(?:direct_call|call_favorite):(.+)$/, async (ctx) => {
    const partnerId = ctx.match[1];
    const telegramId = BigInt(ctx.from.id);

    try {
      const caller = await prisma.user.findUnique({ where: { telegramId } });
      if (!caller) {
        await ctx.answerCallbackQuery({ text: 'User not found. Please type /start first.' });
        return;
      }

      const callerIsBanned = caller.isPermanentlyBanned || (caller.isBanned && (!caller.bannedUntil || new Date(caller.bannedUntil) > new Date()));
      if (callerIsBanned) {
        await ctx.answerCallbackQuery({ text: 'Your account is currently suspended.', show_alert: true });
        return;
      }

      // Check caller call quota
      const callerEntitlement = getEffectiveEntitlement(caller);
      const callerCallsUsed = await getUserCallsUsedThisPeriod(caller.id, caller);
      if (!callerEntitlement.isAdmin && callerCallsUsed >= callerEntitlement.callLimit) {
        await ctx.answerCallbackQuery({
          text: `You have reached your monthly limit of ${callerEntitlement.callLimit} calls. Upgrade your plan to make direct calls!`,
          show_alert: true,
        });
        return;
      }

      const partner = await prisma.user.findUnique({ where: { id: partnerId } });
      if (!partner) {
        await ctx.answerCallbackQuery({ text: 'Partner not found.', show_alert: true });
        return;
      }

      const partnerIsBanned = partner.isPermanentlyBanned || (partner.isBanned && (!partner.bannedUntil || new Date(partner.bannedUntil) > new Date()));
      if (partnerIsBanned) {
        await ctx.answerCallbackQuery({ text: `${partner.alias} is currently unavailable.`, show_alert: true });
        return;
      }

      if (partner.dnd) {
        await ctx.answerCallbackQuery({ text: `${partner.alias} has Do Not Disturb enabled.`, show_alert: true });
        return;
      }

      // Check partner call quota before sending invitation
      const partnerEntitlement = getEffectiveEntitlement(partner);
      const partnerCallsUsed = await getUserCallsUsedThisPeriod(partner.id, partner);
      const partnerBonusCalls = await getActiveBonusCallsCount(partner.id);
      if (!partnerEntitlement.isAdmin && partnerCallsUsed >= partnerEntitlement.callLimit && partnerBonusCalls <= 0) {
        await ctx.answerCallbackQuery({
          text: `${partner.alias} has reached their monthly call limit and cannot receive direct calls right now.`,
          show_alert: true,
        });
        return;
      }

      // Invalidate stale PENDING calls older than 60s before checking active call invariant
      await prisma.callSession.updateMany({
        where: {
          status: 'PENDING',
          createdAt: { lt: new Date(Date.now() - 60_000) },
          OR: [
            { userAId: caller.id },
            { userBId: caller.id },
            { userAId: partner.id },
            { userBId: partner.id },
          ],
        },
        data: { status: 'CANCELLED', endedAt: new Date() },
      });

      // Single active call invariant check
      const activeCall = await prisma.callSession.findFirst({
        where: {
          status: { in: ['ACTIVE', 'PENDING'] },
          OR: [
            { userAId: caller.id },
            { userBId: caller.id },
            { userAId: partner.id },
            { userBId: partner.id },
          ],
        },
      });

      if (activeCall) {
        if (activeCall.userAId === caller.id || activeCall.userBId === caller.id) {
          await ctx.answerCallbackQuery({ text: 'You already have an ongoing or pending call.', show_alert: true });
        } else {
          await ctx.answerCallbackQuery({ text: `${partner.alias} is currently in another call.`, show_alert: true });
        }
        return;
      }

      const roomName = `direct_${crypto.randomUUID()}`;

      // Create PENDING CallSession
      const session = await prisma.callSession.create({
        data: {
          roomName,
          userAId: caller.id,
          userBId: partner.id,
          status: 'PENDING',
        },
      });

      // Schedule 60-second timeout to cleanly cancel unanswered direct calls
      setTimeout(async () => {
        try {
          const check = await prisma.callSession.findUnique({
            where: { id: session.id },
          });
          if (check && check.status === 'PENDING') {
            await prisma.callSession.update({
              where: { id: session.id },
              data: { status: 'CANCELLED', endedAt: new Date() },
            });
            await cleanupDirectCallMessages(bot, session.id);
            await ctx.api.sendMessage(
              caller.telegramId.toString(),
              `📞 <b>Direct Call Request Expired</b>\n\n<b>${escapeHtml(partner.alias)}</b> did not answer your call invitation in time.`,
              { parse_mode: 'HTML' }
            ).catch(() => undefined);
          }
        } catch (timeoutErr) {
          logger.warn('Direct call expiration timeout error', {
            service: 'bot',
            event: 'direct_call_timeout_error',
            sessionId: session.id,
          }, timeoutErr);
        }
      }, 60_000);

      const callerKb = new InlineKeyboard().text('✖️ Cancel Call', `cancel_direct:${session.id}`);

      await ctx.answerCallbackQuery({ text: `Calling ${partner.alias}...` });
      const callerMsg = await ctx.reply(
        `📞 <b>Direct Call Request Sent</b>\n\n` +
          `Calling <b>${escapeHtml(partner.alias)}</b> (Band ${partner.band.toFixed(1)})...\n` +
          `<i>They have received an invitation to join your call.</i>`,
        { parse_mode: 'HTML', reply_markup: callerKb }
      );

      await trackDirectCallMessage(session.id, {
        chatId: caller.telegramId.toString(),
        messageId: callerMsg.message_id,
        role: 'caller_req',
      });

      // Send incoming call prompt to partner
      const partnerKb = new InlineKeyboard()
        .text('✅ Accept & Join', `accept_direct:${session.id}`)
        .text('❌ Decline', `decline_direct:${session.id}`);

      try {
        const partnerMsg = await ctx.api.sendMessage(
          partner.telegramId.toString(),
          `📞 <b>Incoming Direct Call!</b>\n\n` +
            `<b>${escapeHtml(caller.alias)}</b> (Band ${caller.band.toFixed(1)}) is calling you for an IELTS speaking session.\n\n` +
            `Tap below to accept or decline:`,
          { parse_mode: 'HTML', reply_markup: partnerKb }
        );

        await trackDirectCallMessage(session.id, {
          chatId: partner.telegramId.toString(),
          messageId: partnerMsg.message_id,
          role: 'callee_invitation',
        });
      } catch (sendErr) {
        logger.warn('Failed to notify partner of direct call', {
          service: 'bot',
          event: 'direct_call_notify_failed',
          partnerAlias: partner.alias,
        }, sendErr);
      }
    } catch (err) {
      logger.error('direct_call error', {
        service: 'bot',
        event: 'direct_call_failed',
        partnerId,
      }, err);
      await ctx.answerCallbackQuery({ text: 'An error occurred initiating the direct call.', show_alert: true });
    }
  });

  // Callback: accept_direct:<sessionId>
  bot.callbackQuery(/^accept_direct:(.+)$/, async (ctx) => {
    const sessionId = ctx.match[1];
    const calleeTelegramId = BigInt(ctx.from.id);

    try {
      const session = await prisma.callSession.findUnique({
        where: { id: sessionId },
        include: { userA: true, userB: true },
      });

      if (!session || session.status !== 'PENDING') {
        await ctx.answerCallbackQuery({ text: 'This call invitation is no longer active.', show_alert: true });
        await ctx.editMessageText('❌ This call invitation has expired or was cancelled.').catch(() => undefined);
        return;
      }

      const caller = session.userA;
      const callee = session.userB;

      if (!callee || callee.telegramId !== calleeTelegramId) {
        await ctx.answerCallbackQuery({ text: 'Unauthorized invitation action.', show_alert: true });
        return;
      }

      // Re-verify Callee quota
      const calleeEntitlement = getEffectiveEntitlement(callee);
      const calleeCallsUsed = await getUserCallsUsedThisPeriod(callee.id, callee);
      const calleeBonusCalls = await getActiveBonusCallsCount(callee.id);
      if (!calleeEntitlement.isAdmin && calleeCallsUsed >= calleeEntitlement.callLimit && calleeBonusCalls <= 0) {
        await ctx.answerCallbackQuery({
          text: `You have reached your monthly limit of ${calleeEntitlement.callLimit} calls. Please upgrade your plan!`,
          show_alert: true,
        });
        await ctx.editMessageText('❌ You cannot accept this call because you have reached your monthly call limit.').catch(() => undefined);
        return;
      }

      // Re-verify Caller quota
      const callerEntitlement = getEffectiveEntitlement(caller);
      const callerCallsUsed = await getUserCallsUsedThisPeriod(caller.id, caller);
      const callerBonusCalls = await getActiveBonusCallsCount(caller.id);
      if (!callerEntitlement.isAdmin && callerCallsUsed >= callerEntitlement.callLimit && callerBonusCalls <= 0) {
        await ctx.answerCallbackQuery({
          text: `${caller.alias} has reached their monthly call limit.`,
          show_alert: true,
        });
        await ctx.editMessageText(`❌ Call cannot be connected because ${escapeHtml(caller.alias)} has reached their monthly call limit.`).catch(() => undefined);
        return;
      }

      // Atomically mark session ACTIVE only if still PENDING (prevents double-activation race condition)
      const claimed = await prisma.callSession.updateMany({
        where: { id: session.id, status: 'PENDING' },
        data: { status: 'ACTIVE' },
      });

      if (claimed.count !== 1) {
        await ctx.answerCallbackQuery({ text: 'Call invitation has already been processed.', show_alert: true });
        return;
      }

      // Defer authoritative session duration teardown until both peers join and send peer_ready.
      // Schedule a 90s connection handshake timer so neither peer burns minutes while waiting.
      const durationMinutes = calculateEffectiveCallDuration(caller, callee);
      const durationSeconds = durationMinutes * 60;
      setRoomDurationLimit(session.roomName, durationSeconds);
      scheduleConnectionHandshakeTimer(session.roomName, 90, bot);
      void publishGatewayCommand({
        command: 'SCHEDULE_HANDSHAKE_TIMER',
        roomName: session.roomName,
        durationSeconds,
      });

      await ctx.answerCallbackQuery({ text: 'Call accepted! Opening audio channel...' });

      const callUrl = `${env.MINI_APP_URL.replace(/\/$/, '')}?active_call=${session.id}`;
      const joinKb = new InlineKeyboard().webApp('📞 Open Voice Call', callUrl);

      await ctx.editMessageText(
        `✅ <b>Direct Call Connected!</b>\n\n` +
          `Your speaking session with <b>${escapeHtml(caller.alias)}</b> is active.\n` +
          `Tap below to enter the call:`,
        { parse_mode: 'HTML', reply_markup: joinKb }
      );

      if (ctx.chat?.id && ctx.msg?.message_id) {
        await trackDirectCallMessage(session.id, {
          chatId: ctx.chat.id.toString(),
          messageId: ctx.msg.message_id,
          role: 'callee_join',
        });
      }

      try {
        const callerJoinMsg = await ctx.api.sendMessage(
          caller.telegramId.toString(),
          `✅ <b>${escapeHtml(callee.alias)} accepted your call!</b>\n\n` +
            `Tap below to enter the voice call:`,
          { parse_mode: 'HTML', reply_markup: joinKb }
        );

        await trackDirectCallMessage(session.id, {
          chatId: caller.telegramId.toString(),
          messageId: callerJoinMsg.message_id,
          role: 'caller_join',
        });
      } catch (notifyErr) {
        logger.warn('Failed to notify caller of accept', {
          service: 'bot',
          event: 'direct_call_accept_notify_failed',
        }, notifyErr);
      }
    } catch (err) {
      logger.error('accept_direct error', {
        service: 'bot',
        event: 'accept_direct_failed',
        sessionId,
      }, err);
      await ctx.answerCallbackQuery({ text: 'Failed to accept call.', show_alert: true });
    }
  });

  // Callback: decline_direct:<sessionId>
  bot.callbackQuery(/^decline_direct:(.+)$/, async (ctx) => {
    const sessionId = ctx.match[1];
    const requesterTgId = BigInt(ctx.from?.id || 0);
    try {
      const session = await prisma.callSession.findUnique({
        where: { id: sessionId },
        include: { userA: true, userB: true },
      });

      if (!session) {
        await ctx.answerCallbackQuery({ text: 'Call session not found.', show_alert: true });
        return;
      }

      if (session.userA.telegramId !== requesterTgId && session.userB.telegramId !== requesterTgId) {
        await ctx.answerCallbackQuery({ text: 'Unauthorized: You are not a participant in this call.', show_alert: true });
        return;
      }

      if (session.status === 'PENDING') {
        await prisma.callSession.update({
          where: { id: session.id },
          data: { status: 'DECLINED' },
        });

        await cleanupDirectCallMessages(bot, session.id);

        if (session.userA && session.userB) {
          try {
            await ctx.api.sendMessage(
              session.userA.telegramId.toString(),
              `❌ <b>${escapeHtml(session.userB.alias)}</b> was unable to accept your direct call.`,
              { parse_mode: 'HTML' }
            );
          } catch {}
        }
      }

      await ctx.answerCallbackQuery({ text: 'Call invitation declined.', show_alert: true });
      await ctx.editMessageText('❌ You declined the call invitation.').catch(() => undefined);
    } catch (err) {
      logger.error('decline_direct error', {
        service: 'bot',
        event: 'decline_direct_failed',
        sessionId,
      }, err);
    }
  });

  // Callback: cancel_direct:<sessionId>
  bot.callbackQuery(/^cancel_direct:(.+)$/, async (ctx) => {
    const sessionId = ctx.match[1];
    const requesterTgId = BigInt(ctx.from?.id || 0);
    try {
      const session = await prisma.callSession.findUnique({
        where: { id: sessionId },
        include: { userA: true, userB: true },
      });

      if (!session) {
        await ctx.answerCallbackQuery({ text: 'Call session not found.', show_alert: true });
        return;
      }

      if (session.userA.telegramId !== requesterTgId && session.userB.telegramId !== requesterTgId) {
        await ctx.answerCallbackQuery({ text: 'Unauthorized: You are not a participant in this call.', show_alert: true });
        return;
      }

      if (session.status === 'PENDING') {
        await prisma.callSession.update({
          where: { id: session.id },
          data: { status: 'CANCELLED' },
        });

        await cleanupDirectCallMessages(bot, session.id);

        if (session.userB) {
          try {
            await ctx.api.sendMessage(
              session.userB.telegramId.toString(),
              `✖️ <b>The incoming direct call invitation was cancelled.</b>`,
              { parse_mode: 'HTML' }
            );
          } catch {}
        }
      }

      await ctx.answerCallbackQuery({ text: 'Call request cancelled.', show_alert: true });
      await ctx.editMessageText('✖️ Call request cancelled.').catch(() => undefined);
    } catch (err) {
      logger.error('cancel_direct error', {
        service: 'bot',
        event: 'cancel_direct_failed',
        sessionId,
      }, err);
    }
  });

  // Callback: play_rec:<sessionId> or play_recording_<sessionId>
  bot.callbackQuery(/^(?:play_rec|play_recording)[:_](.+)$/, async (ctx) => {
    const sessionId = ctx.match[1];
    const telegramId = BigInt(ctx.from.id);

    try {
      const user = await prisma.user.findUnique({ where: { telegramId } });
      if (!user) {
        await ctx.answerCallbackQuery({ text: 'User not found.' });
        return;
      }

      const session = await prisma.callSession.findUnique({ where: { id: sessionId } });
      if (!session || (session.userAId !== user.id && session.userBId !== user.id)) {
        await ctx.answerCallbackQuery({ text: 'Recording not found or unauthorized.' });
        return;
      }

      const { isUserSessionRecorder } = await import('../../socket/signaling');
      if (session.recordedByUserId && !isUserSessionRecorder(session.recordedByUserId, user.id)) {
        await ctx.answerCallbackQuery({
          text: 'This recording was saved by your practice partner and is only available to them.',
          show_alert: true,
        });
        return;
      }

      if (!session.recordingUrl || (session.recordingExpiresAt && session.recordingExpiresAt <= new Date())) {
        await ctx.answerCallbackQuery({
          text: 'This recording has expired and was automatically deleted per your plan retention policy.',
          show_alert: true,
        });
        return;
      }

      const allowedRetentionDays = getEffectiveEntitlement(user).retentionDays;
      const sessionAgeMs = Date.now() - session.createdAt.getTime();
      if (sessionAgeMs > allowedRetentionDays * 24 * 60 * 60 * 1000) {
        await ctx.answerCallbackQuery({
          text: 'This recording has expired and was automatically deleted per your plan retention policy.',
          show_alert: true,
        });
        return;
      }

      const { isS3Configured, getS3ObjectBuffer, generatePresignedDownloadUrl, checkS3ObjectExists } = await import('../../services/s3Storage');

      // 1. S3 Cloud Storage Flow
      if (isS3Configured()) {
        const existsInfo = await checkS3ObjectExists(session.recordingUrl);
        if (!existsInfo.exists) {
          await ctx.answerCallbackQuery({ text: 'Audio recording is still processing or unavailable.' });
          return;
        }

        const sizeBytes = existsInfo.size || 0;
        if (sizeBytes > 50 * 1024 * 1024) {
          await ctx.answerCallbackQuery({ text: 'Recording exceeds 50MB Telegram limit.' });
          const presignedUrl = await generatePresignedDownloadUrl(session.recordingUrl, 3600);
          await ctx.reply(
            `📁 <b>Recording Available in Storage</b>\n\n` +
              `This audio session file (${(sizeBytes / (1024 * 1024)).toFixed(1)} MB) exceeds Telegram's 50MB direct delivery limit.\n\n` +
              `🔗 <a href="${presignedUrl}">Click here to listen or download your recording</a> (link valid for 1 hour).`,
            { parse_mode: 'HTML' }
          );
          return;
        }

        await ctx.answerCallbackQuery({ text: 'Fetching audio recording...' });
        const { buffer } = await getS3ObjectBuffer(session.recordingUrl);
        const fileName = `session_${sessionId.slice(0, 8)}.mp3`;
        const { InputFile } = await import('grammy');

        await ctx.replyWithAudio(new InputFile(buffer, fileName), {
          caption: `🎙️ <b>Practice Recording</b> — Session ${sessionId.slice(0, 8)} (${Math.floor((session.duration || 0) / 60)} min)`,
          parse_mode: 'HTML',
        });
        return;
      }

      // 2. Local Filesystem Flow (Fallback)
      const path = await import('path');
      const fs = await import('fs');
      const filePath = path.isAbsolute(session.recordingUrl)
        ? session.recordingUrl
        : path.join(process.cwd(), session.recordingUrl);

      if (!fs.existsSync(filePath)) {
        await ctx.answerCallbackQuery({ text: 'Audio file missing from server.' });
        return;
      }

      const fileStat = fs.statSync(filePath);
      if (fileStat.size > 50 * 1024 * 1024) {
        await ctx.answerCallbackQuery({ text: 'Recording exceeds 50MB Telegram limit.' });
        await ctx.reply(
          `📁 <b>Recording Available in Storage</b>\n\n` +
            `This audio session file (${(fileStat.size / (1024 * 1024)).toFixed(1)} MB) exceeds Telegram's 50MB direct delivery limit.\n` +
            `Your recording remains safely preserved in platform storage according to your plan's retention policy.`,
          { parse_mode: 'HTML' }
        );
        return;
      }

      await ctx.answerCallbackQuery({ text: 'Sending audio recording...' });
      const { InputFile } = await import('grammy');
      await ctx.replyWithAudio(new InputFile(filePath), {
        caption: `🎙️ <b>Audio Recording</b> — Session ${sessionId.slice(0, 8)} (${Math.floor((session.duration || 0) / 60)} min)`,
        parse_mode: 'HTML',
      });
    } catch (err) {
      logger.error('play_rec error', {
        service: 'bot',
        event: 'play_recording_failed',
        sessionId,
      }, err);
      await ctx.answerCallbackQuery({ text: 'An error occurred sending audio.' }).catch(() => undefined);
      await ctx.reply('❌ Unable to retrieve audio recording. Please try again later.').catch(() => undefined);
    }
  });

  // Callback: submit_appeal
  bot.callbackQuery('submit_appeal', async (ctx) => {
    void ctx.answerCallbackQuery().catch(() => undefined);
    const telegramId = BigInt(ctx.from.id);
    const user = await prisma.user.findUnique({ where: { telegramId } });
    if (!user || !user.isPermanentlyBanned) {
      await ctx.answerCallbackQuery({ text: 'Appeals are available only to permanently banned accounts.' }).catch(() => undefined);
      return;
    }

    await ctx.reply(
      `⚖️ <b>Submit Unban Appeal:</b>\n\n` +
        `Please send your appeal message using the <code>/appeal</code> command.\n\n` +
        `<b>Example:</b>\n<code>/appeal I would like to request an unban because my connection dropped.</code>\n\n` +
        `Your message will go directly to our moderation team's review queue.`,
      { parse_mode: 'HTML' }
    );
  });

  // Callback: view_hall_of_fame
  bot.callbackQuery('view_hall_of_fame', async (ctx) => {
    await ctx.answerCallbackQuery();
    const { getContestStatus } = await import('../../services/referralService');
    const contest = await getContestStatus();

    if (!contest.isActive || !contest.contest) {
      await ctx.reply(
        `🏆 <b>Hall of Fame</b>\n\n` +
          `ℹ️ <i>There is no active championship at the moment. Stay tuned for the next contest!</i>`,
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
          return `${medal} <b>${escapeHtml(entry.alias)}</b> — <code>${entry.invitesCount} friend${entry.invitesCount > 1 ? 's' : ''}</code>`;
        })
        .join('\n');
    }

    const { InlineKeyboard } = await import('grammy');
    const inlineKb = new InlineKeyboard().text('👥 Get My Invite Link', 'get_my_invite_link');

    await ctx.reply(
      `🏆 <b>${escapeHtml(title)}</b>\n\n` +
        `📝 ${escapeHtml(description)}\n\n` +
        `🎁 <b>Contest Prizes:</b>\n` +
        `${escapeHtml(prizes)}\n\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `🌟 <b>Live Leaderboard (Top 10):</b>\n\n` +
        leaderboardText,
      { parse_mode: 'HTML', reply_markup: inlineKb }
    );
  });

  // Callback: get_my_invite_link
  bot.callbackQuery('get_my_invite_link', async (ctx) => {
    await ctx.answerCallbackQuery();
    const telegramId = BigInt(ctx.from.id);
    const user = await prisma.user.findUnique({ where: { telegramId } });
    if (!user) return;

    const botInfo = await ctx.api.getMe().catch(() => ({ username: 'PairTalkBot' }));
    const botUsername = botInfo.username || 'PairTalkBot';
    const inviteLink = `https://t.me/${botUsername}?start=ref_${user.telegramId}`;
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(inviteLink)}&text=${encodeURIComponent('Join me on PairTalk to practice IELTS Speaking with real learners!')}`;

    const { InlineKeyboard } = await import('grammy');
    const inlineKb = new InlineKeyboard().url('🚀 Share Invite Link', shareUrl);

    await ctx.reply(
      `🔗 <b>Your Personal Invite Link:</b>\n\n` +
        `<code>${inviteLink}</code>\n\n` +
        `🎁 Share this link with IELTS learners. For every friend who completes their 1st call (≥30s), you get <b>1 Free Bonus Call</b> (Permanent / Never Expires)!`,
      { parse_mode: 'HTML', reply_markup: inlineKb }
    );
  });
}
