import { Bot, InlineKeyboard } from 'grammy';
import { MyContext } from '../types';
import { prisma } from '../../config/database';
import { calculateOverallBand, generateUniqueAlias, getMainMenuKeyboard } from '../commands/start';

export function setupCallbackHandlers(bot: Bot<MyContext>) {
  // Callback: set_sub_fc:<score>
  bot.callbackQuery(/^set_sub_fc:(.+)$/, async (ctx) => {
    const fc = parseFloat(ctx.match[1]);
    ctx.session.fc = fc;
    ctx.session.step = 'lr';

    const inlineKb = new InlineKeyboard();
    for (let s = 4.0; s <= 9.0; s += 0.5) {
      inlineKb.text(s.toFixed(1), `set_sub_lr:${s}`);
      if (s === 6.0 || s === 8.0) inlineKb.row();
    }

    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      `🎯 *Step 2/4: Select your Lexical Resource (LR) score:*\n\n` +
        `• FC: *${fc.toFixed(1)}*`,
      { parse_mode: 'Markdown', reply_markup: inlineKb }
    );
  });

  // Callback: set_sub_lr:<score>
  bot.callbackQuery(/^set_sub_lr:(.+)$/, async (ctx) => {
    const lr = parseFloat(ctx.match[1]);
    ctx.session.lr = lr;
    ctx.session.step = 'gra';

    const inlineKb = new InlineKeyboard();
    for (let s = 4.0; s <= 9.0; s += 0.5) {
      inlineKb.text(s.toFixed(1), `set_sub_gra:${s}`);
      if (s === 6.0 || s === 8.0) inlineKb.row();
    }

    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      `🎯 *Step 3/4: Select your Grammatical Range & Accuracy (GRA) score:*\n\n` +
        `• FC: *${ctx.session.fc?.toFixed(1)}*\n` +
        `• LR: *${lr.toFixed(1)}*`,
      { parse_mode: 'Markdown', reply_markup: inlineKb }
    );
  });

  // Callback: set_sub_gra:<score>
  bot.callbackQuery(/^set_sub_gra:(.+)$/, async (ctx) => {
    const gra = parseFloat(ctx.match[1]);
    ctx.session.gra = gra;
    ctx.session.step = 'p';

    const inlineKb = new InlineKeyboard();
    for (let s = 4.0; s <= 9.0; s += 0.5) {
      inlineKb.text(s.toFixed(1), `set_sub_p:${s}`);
      if (s === 6.0 || s === 8.0) inlineKb.row();
    }

    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      `🎯 *Step 4/4: Select your Pronunciation (P) score:*\n\n` +
        `• FC: *${ctx.session.fc?.toFixed(1)}*\n` +
        `• LR: *${ctx.session.lr?.toFixed(1)}*\n` +
        `• GRA: *${gra.toFixed(1)}*`,
      { parse_mode: 'Markdown', reply_markup: inlineKb }
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
      .text('🔄 Start Over', 'restart_onboarding');

    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      `📊 *Sub-scores Summary*\n\n` +
        `• Fluency & Coherence (FC): *${fc.toFixed(1)}*\n` +
        `• Lexical Resource (LR): *${lr.toFixed(1)}*\n` +
        `• Grammatical Range (GRA): *${gra.toFixed(1)}*\n` +
        `• Pronunciation (P): *${p.toFixed(1)}*\n\n` +
        `⭐ *Calculated Overall IELTS Band*: *${overallBand.toFixed(1)}*\n\n` +
        `Click *Save & Lock Profile* to finalize setup.`,
      { parse_mode: 'Markdown', reply_markup: inlineKb }
    );
  });

  // Callback: confirm_subscores
  bot.callbackQuery('confirm_subscores', async (ctx) => {
    const telegramId = BigInt(ctx.from.id);
    const fc = ctx.session.fc || 6.0;
    const lr = ctx.session.lr || 6.0;
    const gra = ctx.session.gra || 6.0;
    const p = ctx.session.p || 6.0;
    const overallBand = calculateOverallBand(fc, lr, gra, p);

    const alias = generateUniqueAlias();
    const user = await prisma.user.upsert({
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

    ctx.session.step = 'idle';
    await ctx.answerCallbackQuery({ text: 'Profile saved!' });

    const menuKb = getMainMenuKeyboard();
    await ctx.reply(
      `🎉 *Profile Onboarding Complete!*\n\n` +
        `• *Permanent Alias*: \`${user.alias}\` (Locked)\n` +
        `• *Target IELTS Band*: ${user.band.toFixed(1)}\n\n` +
        `You can now tap *📞 Find Partner* to match with complementary speaking partners.`,
      { parse_mode: 'Markdown', reply_markup: menuKb }
    );
  });

  // Callback: re_evaluate_subscores
  bot.callbackQuery('re_evaluate_subscores', async (ctx) => {
    ctx.session.step = 'fc';
    const inlineKb = new InlineKeyboard();
    for (let s = 4.0; s <= 9.0; s += 0.5) {
      inlineKb.text(s.toFixed(1), `set_sub_fc:${s}`);
      if (s === 6.0 || s === 8.0) inlineKb.row();
    }

    await ctx.answerCallbackQuery();
    await ctx.reply(`🎯 *Step 1/4: Select your Fluency & Coherence (FC) score:*`, {
      parse_mode: 'Markdown',
      reply_markup: inlineKb,
    });
  });

  // Callback: toggle_dnd
  bot.callbackQuery('toggle_dnd', async (ctx) => {
    const telegramId = BigInt(ctx.from.id);
    const user = await prisma.user.findUnique({ where: { telegramId } });

    if (user) {
      const newDnd = !user.dnd;
      await prisma.user.update({
        where: { id: user.id },
        data: { dnd: newDnd },
      });

      await ctx.answerCallbackQuery({
        text: newDnd ? 'DND Activated: You will not receive partner invitations.' : 'DND Deactivated.',
      });

      await ctx.editMessageText(
        `👤 *Profile Updated*\n\n` +
          `DND Status: ${newDnd ? '🔕 Do Not Disturb ON' : '🔔 Ready for Calls'}`
      );
    }
  });

  // Callback: submit_appeal
  bot.callbackQuery('submit_appeal', async (ctx) => {
    const telegramId = BigInt(ctx.from.id);
    const user = await prisma.user.findUnique({ where: { telegramId } });

    if (!user) return;

    // Check if appeal already exists
    const existing = await prisma.unblockAppeal.findFirst({
      where: { userId: user.id, status: 'PENDING' },
    });

    if (existing) {
      await ctx.answerCallbackQuery({ text: 'You already have a pending unblock appeal.' });
      return;
    }

    await prisma.unblockAppeal.create({
      data: {
        userId: user.id,
        telegramId,
        alias: user.alias,
        banReason: user.isPermanentlyBanned ? 'Permanent Lock' : 'Temporary Suspension',
        appealText: 'User submitted unblock appeal via Telegram bot support.',
      },
    });

    await ctx.answerCallbackQuery({ text: 'Appeal submitted!' });
    await ctx.reply(
      `⚖️ *Unblock Appeal Submitted*\n\n` +
        `Your appeal has been submitted to the moderation queue.\n` +
        `The system admin will review your appeal details shortly.`,
      { parse_mode: 'Markdown' }
    );
  });

  // Callback: play_rec:<sessionId>
  bot.callbackQuery(/^play_rec:(.+)$/, async (ctx) => {
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

      if (!session.recordingUrl) {
        await ctx.answerCallbackQuery({ text: 'Recording is no longer available.' });
        return;
      }

      // In production, this would send the audio file via bot.api.sendAudio
      // For now, acknowledge the request
      await ctx.answerCallbackQuery({ text: 'Loading recording...' });
      await ctx.reply(
        `🎧 *Recording Playback*\n\n` +
          `Session: \`${sessionId.slice(0, 8)}...\`\n` +
          `Duration: ${Math.floor(session.duration / 60)} min ${session.duration % 60}s\n\n` +
          `_Audio file delivery is being processed._`,
        { parse_mode: 'Markdown' }
      );
    } catch (err) {
      console.error('[Callback] play_rec error:', err);
      await ctx.answerCallbackQuery({ text: 'An error occurred.' });
    }
  });

  // Callback: direct_call:<partnerId>
  bot.callbackQuery(/^direct_call:(.+)$/, async (ctx) => {
    const partnerId = ctx.match[1];
    const telegramId = BigInt(ctx.from.id);

    try {
      const user = await prisma.user.findUnique({ where: { telegramId } });
      if (!user) {
        await ctx.answerCallbackQuery({ text: 'User not found.' });
        return;
      }

      // Check user is not banned
      if (user.isBanned || user.isPermanentlyBanned) {
        await ctx.answerCallbackQuery({ text: 'Your account is currently restricted.' });
        return;
      }

      const partner = await prisma.user.findUnique({ where: { id: partnerId } });
      if (!partner) {
        await ctx.answerCallbackQuery({ text: 'Partner not found.' });
        return;
      }

      if (partner.dnd) {
        await ctx.answerCallbackQuery({ text: `${partner.alias} has Do Not Disturb enabled.` });
        return;
      }

      await ctx.answerCallbackQuery({ text: `Ringing ${partner.alias}...` });
      await ctx.reply(
        `📞 *Direct Call Request Sent*\n\n` +
          `Calling *${partner.alias}* (Band ${partner.band.toFixed(1)})...\n` +
          `_They will receive a notification to join the call._`,
        { parse_mode: 'Markdown' }
      );

      // Send push notification to partner via bot
      try {
        const inlineKb = new InlineKeyboard()
          .text('✅ Accept & Join Call', `accept_direct:${user.id}`);

        await ctx.api.sendMessage(
          Number(partner.telegramId),
          `📞 *Incoming Direct Call!*\n\n` +
            `*${user.alias}* (Band ${user.band.toFixed(1)}) is calling you.\n` +
            `Tap the button below to accept.`,
          { parse_mode: 'Markdown', reply_markup: inlineKb }
        );
      } catch (sendErr) {
        console.warn(`[Direct Call] Could not notify partner ${partner.alias}:`, sendErr);
      }
    } catch (err) {
      console.error('[Callback] direct_call error:', err);
      await ctx.answerCallbackQuery({ text: 'An error occurred.' });
    }
  });
}
