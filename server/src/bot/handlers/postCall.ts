import { Bot, InlineKeyboard } from 'grammy';
import { MyContext } from '../types';
import { prisma } from '../../config/database';
import { moderationService } from '../../services/moderation';
import { notificationQueue } from '../notifications';
import { notifyQuotaLimitReachedIfExhausted } from '../../services/subscriptionExpiry';
import { logger } from '../../utils/logger';

export async function sendPostCallReviewCard(
  bot: Bot<MyContext>,
  userTelegramId: string,
  callSessionId: string,
  partnerAlias: string,
  durationSeconds: number,
  recordingUrl?: string,
  retentionDays?: number
) {
  const durationMin = Math.floor(durationSeconds / 60);
  const durationSec = durationSeconds % 60;
  const durationStr = `${durationMin}m ${durationSec}s`;

  const inlineKb = new InlineKeyboard();

  if (recordingUrl) {
    inlineKb.text('🎧 Listen Recording', `play_rec:${callSessionId}`).row();
  }

  inlineKb
    .text('⭐ Save Partner as Favorite', `favorite_partner:${callSessionId}`)
    .row()
    .text('⚠️ Report Bad Partner', `report_partner:${callSessionId}`);

  const retentionNotice = recordingUrl && retentionDays
    ? `\n\n🎙️ <i>Audio saved. Retention: <b>${retentionDays} day${retentionDays > 1 ? 's' : ''}</b> (automatically deleted thereafter).</i>`
    : '';

  try {
    await notificationQueue.enqueue(
      bot,
      userTelegramId,
      `📞 <b>Practice Session Complete!</b>\n\n` +
        `• <b>Partner</b>: ${partnerAlias}\n` +
        `• <b>Duration</b>: ${durationStr}` +
        `${retentionNotice}`,
      { parse_mode: 'HTML', reply_markup: inlineKb },
      true
    );

    // Check and notify if user has reached their monthly plan limit
    if (/^\d+$/.test(userTelegramId)) {
      prisma.user.findUnique({ where: { telegramId: BigInt(userTelegramId) } }).then((u) => {
        if (u) notifyQuotaLimitReachedIfExhausted(bot, u.id, u);
      }).catch(() => undefined);
    }
  } catch (err) {
    logger.warn('Failed to enqueue review card', {
      service: 'bot',
      event: 'postcall_review_enqueue_failed',
      userTelegramId,
      callSessionId,
    }, err);
  }
}

export function setupPostCallCallbackHandlers(bot: Bot<MyContext>) {
  // Callback: rate_call:<callSessionId>:<stars>
  bot.callbackQuery(/^rate_call:(.+):([1-5])$/, async (ctx) => {
    const match = ctx.match;
    const callId = match[1];
    const stars = parseInt(match[2], 10);
    const raterTelegramId = BigInt(ctx.from.id);

    const [rater, session] = await Promise.all([
      prisma.user.findUnique({ where: { telegramId: raterTelegramId } }),
      prisma.callSession.findUnique({ where: { id: callId } }),
    ]);

    if (!rater) {
      await ctx.answerCallbackQuery({ text: 'User not found.' });
      return;
    }

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

    await ctx.answerCallbackQuery({ text: `Saved ${stars}-star rating!`, show_alert: true });
    await ctx.editMessageText(
      `📞 <b>Practice Session Complete!</b>\n\n` +
        `⭐ <b>Audio Quality Rating</b>: ${'★'.repeat(stars)}${'☆'.repeat(5 - stars)}\n` +
        `Thank you for your feedback!`,
      { parse_mode: 'HTML' }
    );
  });

  // Callback: report_partner:<callSessionId>
  bot.callbackQuery(/^report_partner:(.+)$/, async (ctx) => {
    const callId = ctx.match[1];
    const raterTelegramId = BigInt(ctx.from.id);

    const [rater, session] = await Promise.all([
      prisma.user.findUnique({ where: { telegramId: raterTelegramId } }),
      prisma.callSession.findUnique({ where: { id: callId } }),
    ]);

    if (!rater) {
      await ctx.answerCallbackQuery({ text: 'User not found.', show_alert: true });
      return;
    }

    if (!session) {
      await ctx.answerCallbackQuery({ text: 'Call session not found.', show_alert: true });
      return;
    }

    // Verify reporter was actually a participant
    if (session.userAId !== rater.id && session.userBId !== rater.id) {
      await ctx.answerCallbackQuery({ text: 'Unauthorized: You were not a participant in this call.', show_alert: true });
      return;
    }

    // Check if already reported
    const existing = await prisma.callRating.findFirst({
      where: { callId, raterId: rater.id, reported: true },
    });
    if (existing) {
      await ctx.answerCallbackQuery({ text: 'You have already reported this session.', show_alert: true });
      return;
    }

    const targetUserId = session.userAId === rater.id ? session.userBId : session.userAId;

    const modResult = await moderationService.processReport(targetUserId, rater.id, callId, 'Inappropriate behavior');

    await ctx.answerCallbackQuery({ text: 'Report submitted to moderation.', show_alert: true });
    await ctx.editMessageText(
      `⚠️ <b>Report Submitted</b>\n\n` +
        `Your report has been logged. Status: ${modResult.penaltyLevel}.\n` +
        `Thank you for keeping our IELTS community safe.`,
      { parse_mode: 'HTML' }
    );
  });
}
