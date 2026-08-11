import { Bot, InlineKeyboard } from 'grammy';
import { MyContext } from '../types';
import { prisma } from '../../config/database';
import { moderationService } from '../../services/moderation';

export async function sendPostCallReviewCard(
  bot: Bot<MyContext>,
  userTelegramId: number,
  callSessionId: string,
  partnerAlias: string,
  durationSeconds: number,
  recordingUrl?: string
) {
  const durationMin = Math.floor(durationSeconds / 60);
  const durationSec = durationSeconds % 60;
  const durationStr = `${durationMin}m ${durationSec}s`;

  const inlineKb = new InlineKeyboard()
    .text('⭐ 1', `rate_call:${callSessionId}:1`)
    .text('⭐ 2', `rate_call:${callSessionId}:2`)
    .text('⭐ 3', `rate_call:${callSessionId}:3`)
    .text('⭐ 4', `rate_call:${callSessionId}:4`)
    .text('⭐ 5', `rate_call:${callSessionId}:5`)
    .row();

  if (recordingUrl) {
    inlineKb.text('🎧 Listen Recording', `play_rec:${callSessionId}`).row();
  }

  inlineKb.text('⚠️ Report Bad Partner', `report_partner:${callSessionId}`);

  try {
    await bot.api.sendMessage(
      userTelegramId,
      `📞 *Practice Session Complete!*\n\n` +
        `• *Partner*: ${partnerAlias}\n` +
        `• *Duration*: ${durationStr}\n\n` +
        `*How was your call audio quality?*`,
      { parse_mode: 'Markdown', reply_markup: inlineKb }
    );
  } catch (err) {
    console.warn(`[PostCall Review] Failed to send review card to ${userTelegramId}:`, err);
  }
}

export function setupPostCallCallbackHandlers(bot: Bot<MyContext>) {
  // Callback: rate_call:<callSessionId>:<stars>
  bot.callbackQuery(/^rate_call:(.+):([1-5])$/, async (ctx) => {
    const match = ctx.match;
    const callId = match[1];
    const stars = parseInt(match[2], 10);
    const raterTelegramId = BigInt(ctx.from.id);

    const rater = await prisma.user.findUnique({ where: { telegramId: raterTelegramId } });
    if (!rater) {
      await ctx.answerCallbackQuery({ text: 'User not found.' });
      return;
    }

    const session = await prisma.callSession.findUnique({ where: { id: callId } });
    if (!session) {
      await ctx.answerCallbackQuery({ text: 'Call session not found.' });
      return;
    }

    // Verify rater was actually a participant
    if (session.userAId !== rater.id && session.userBId !== rater.id) {
      await ctx.answerCallbackQuery({ text: 'Unauthorized: You were not a participant in this call.' });
      return;
    }

    // Check if already rated
    const existing = await prisma.callRating.findFirst({
      where: { callId, raterId: rater.id },
    });
    if (existing) {
      await ctx.answerCallbackQuery({ text: 'You have already submitted feedback for this session.' });
      return;
    }

    const targetUserId = session.userAId === rater.id ? session.userBId : session.userAId;

    await prisma.callRating.create({
      data: {
        callId,
        raterId: rater.id,
        ratedId: targetUserId,
        stars,
      },
    });

    await ctx.answerCallbackQuery({ text: `Saved ${stars}-star rating!` });
    await ctx.editMessageText(
      `📞 *Practice Session Complete!*\n\n` +
        `⭐ *Audio Quality Rating*: ${'★'.repeat(stars)}${'☆'.repeat(5 - stars)}\n` +
        `Thank you for your feedback!`,
      { parse_mode: 'Markdown' }
    );
  });

  // Callback: report_partner:<callSessionId>
  bot.callbackQuery(/^report_partner:(.+)$/, async (ctx) => {
    const callId = ctx.match[1];
    const raterTelegramId = BigInt(ctx.from.id);

    const rater = await prisma.user.findUnique({ where: { telegramId: raterTelegramId } });
    if (!rater) {
      await ctx.answerCallbackQuery({ text: 'User not found.' });
      return;
    }

    const session = await prisma.callSession.findUnique({ where: { id: callId } });
    if (!session) {
      await ctx.answerCallbackQuery({ text: 'Call session not found.' });
      return;
    }

    // Verify reporter was actually a participant
    if (session.userAId !== rater.id && session.userBId !== rater.id) {
      await ctx.answerCallbackQuery({ text: 'Unauthorized: You were not a participant in this call.' });
      return;
    }

    // Check if already reported
    const existing = await prisma.callRating.findFirst({
      where: { callId, raterId: rater.id, reported: true },
    });
    if (existing) {
      await ctx.answerCallbackQuery({ text: 'You have already reported this session.' });
      return;
    }

    const targetUserId = session.userAId === rater.id ? session.userBId : session.userAId;

    const modResult = await moderationService.processReport(targetUserId, rater.id, callId, 'Inappropriate behavior');

    await ctx.answerCallbackQuery({ text: 'Report submitted to moderation.' });
    await ctx.editMessageText(
      `⚠️ *Report Submitted*\n\n` +
        `Your report has been logged. Status: ${modResult.penaltyLevel}.\n` +
        `Thank you for keeping our IELTS community safe.`,
      { parse_mode: 'Markdown' }
    );
  });
}
