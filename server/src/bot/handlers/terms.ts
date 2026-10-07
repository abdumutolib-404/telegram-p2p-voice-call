import crypto from 'node:crypto';
import { Bot, InlineKeyboard, InputFile, Keyboard } from 'grammy';
import { prisma } from '../../config/database';
import { currentTerms, termsPdfPath } from '../../services/terms';
import { MyContext } from '../types';
import { beginScoreRegistration, bindPendingReferral, getMainMenuKeyboard } from '../commands/start';

export async function offerTerms(ctx: MyContext): Promise<void> {
  if (ctx.chat?.type !== 'private') {
    await ctx.reply('Please open a private conversation with the bot to register.');
    return;
  }
  // A failed upload must never open the consent gate.
  ctx.session.step = 'idle';
  ctx.session.termsOffer = undefined;
  await ctx.reply('Before continuing, read the Terms of Use PDF below. You can decline and stop registration.', { reply_markup: { remove_keyboard: true } });
  const message = await ctx.replyWithDocument(new InputFile(termsPdfPath, currentTerms.filename), {
    caption: `PairTalk Terms of Use\nVersion ${currentTerms.version}\n\nBy choosing Agree and continue, you accept this document and confirm you meet its age and guardian-permission requirements. Call recording still requires separate agreement.`,
    reply_markup: new InlineKeyboard().text('Agree and continue', `terms_accept:${currentTerms.version}`).row().text('Decline', `terms_decline:${currentTerms.version}`).row().url('Privacy policy', currentTerms.privacyUrl),
  });
  ctx.session.termsOffer = { version: currentTerms.version, sha256: currentTerms.sha256, messageId: message.message_id };
  ctx.session.step = 'terms';
}

export function setupTermsHandlers(bot: Bot<MyContext>): void {
  bot.command('terms', offerTerms);
  bot.callbackQuery(/^terms_(accept|decline):(.+)$/, async ctx => {
    const offer = ctx.session.termsOffer;
    const validOffer = ctx.chat?.type === 'private' && ctx.session.step === 'terms' && offer?.version === currentTerms.version && offer.sha256 === currentTerms.sha256 && ctx.match[2] === currentTerms.version && offer.messageId === ctx.callbackQuery.message?.message_id;
    await ctx.answerCallbackQuery();
    if (!validOffer) {
      await ctx.reply('That agreement request is no longer current. Use /start to receive the current PDF.');
      return;
    }
    if (ctx.match[1] === 'decline') {
      ctx.session.step = 'idle';
      ctx.session.termsOffer = undefined;
      ctx.session.pendingReferralPayload = undefined;
      await ctx.editMessageReplyMarkup({ reply_markup: new InlineKeyboard() });
      await ctx.reply('You declined the terms. Registration has stopped and no agreement was saved. You can read them again with /start. For an existing account or billing question, use /paysupport.', { reply_markup: new Keyboard().text('💬 Support').resized() });
      return;
    }
    const telegramId = BigInt(ctx.from.id);
    const acceptedAt = new Date();
    const user = await prisma.$transaction(async tx => {
      const user = await tx.user.upsert({
        where: { telegramId },
        create: { telegramId, alias: `P2P-${crypto.randomBytes(4).toString('hex').toUpperCase()}`, termsAcceptedVersion: currentTerms.version, termsAcceptedAt: acceptedAt, termsDocumentSha256: currentTerms.sha256 },
        update: { termsAcceptedVersion: currentTerms.version, termsAcceptedAt: acceptedAt, termsDocumentSha256: currentTerms.sha256 },
      });
      await tx.termsAcceptance.upsert({
        where: { userId_version_documentSha256: { userId: user.id, version: currentTerms.version, documentSha256: currentTerms.sha256 } },
        create: { userId: user.id, version: currentTerms.version, documentSha256: currentTerms.sha256, acceptedAt },
        update: {},
      });
      return user;
    });
    ctx.session.step = 'idle';
    ctx.session.termsOffer = undefined;
    await bindPendingReferral(ctx, bot);
    await ctx.editMessageReplyMarkup({ reply_markup: new InlineKeyboard() });
    if (user.onboarded) {
      await ctx.reply(`Terms accepted (version ${currentTerms.version}). Open your dashboard to continue.`, { reply_markup: getMainMenuKeyboard() });
    } else {
      await ctx.reply(`Terms accepted (version ${currentTerms.version}). Now let's finish registration.`);
      await beginScoreRegistration(ctx);
    }
  });
}
