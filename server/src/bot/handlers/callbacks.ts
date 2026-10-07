import { Bot, InlineKeyboard } from 'grammy';
import { MyContext } from '../types';
import { prisma } from '../../config/database';
import { calculateOverallBand, generateUniqueAlias, getMainMenuKeyboard } from '../commands/start';
import { escapeHtml } from '../../utils/sanitize';
import { logger } from '../../utils/logger';
import { hasAcceptedCurrentTerms } from '../../services/terms';
import { offerTerms } from './terms';

export function validOnboardingBand(value: string): boolean { return /^(?:[0-8](?:\.5)?|9(?:\.0)?)$/.test(value); }

export function setupCallbackHandlers(bot: Bot<MyContext>) {
  // Callback: set_sub_fc:<score>
  bot.callbackQuery(/^set_sub_fc:(.+)$/, async (ctx) => {
    if(ctx.session.step !== 'fc' || !validOnboardingBand(ctx.match[1])) { await ctx.reply('That selection is no longer valid. Continue the current step or restart with /start.'); return; }
    const fc = Number(ctx.match[1]);
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
    if(ctx.session.step !== 'lr' || !validOnboardingBand(ctx.match[1])) { await ctx.reply('That selection is no longer valid. Continue the current step or restart with /start.'); return; }
    const lr = Number(ctx.match[1]);
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
    if(ctx.session.step !== 'gra' || !validOnboardingBand(ctx.match[1])) { await ctx.reply('That selection is no longer valid. Continue the current step or restart with /start.'); return; }
    const gra = Number(ctx.match[1]);
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
    if(ctx.session.step !== 'p' || !validOnboardingBand(ctx.match[1])) { await ctx.reply('That selection is no longer valid. Continue the current step or restart with /start.'); return; }
    const p = Number(ctx.match[1]);
    ctx.session.p = p;
    ctx.session.step = 'confirm';

    const fc = ctx.session.fc ?? 6.0;
    const lr = ctx.session.lr ?? 6.0;
    const gra = ctx.session.gra ?? 6.0;
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
    if(ctx.session.step !== 'confirm' || ![ctx.session.fc,ctx.session.lr,ctx.session.gra,ctx.session.p].every(value=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=9&&Number.isInteger(value*2))) { await ctx.reply('Complete the current score selection before saving.'); return; }
    const telegramId = BigInt(ctx.from.id);
    const acceptedUser = await prisma.user.findUnique({ where: { telegramId } });
    if (!hasAcceptedCurrentTerms(acceptedUser)) { await offerTerms(ctx); return; }
    const fc = ctx.session.fc ?? 6.0;
    const lr = ctx.session.lr ?? 6.0;
    const gra = ctx.session.gra ?? 6.0;
    const p = ctx.session.p ?? 6.0;
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
        `Tap <b>Open dashboard</b> for calls, recordings, ratings, reports and account settings.`,
      { parse_mode: 'HTML', reply_markup: menuKb }
    );
  });

  // Callback: re_evaluate_subscores
  bot.callbackQuery('re_evaluate_subscores', async (ctx) => {
    const user = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from.id) } });
    if (!hasAcceptedCurrentTerms(user)) { await offerTerms(ctx); return; }
    if (user?.onboarded) {
      await ctx.answerCallbackQuery();
      await ctx.reply('Your speaking profile is now managed in the dashboard.', { reply_markup: getMainMenuKeyboard() });
      return;
    }
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

}
