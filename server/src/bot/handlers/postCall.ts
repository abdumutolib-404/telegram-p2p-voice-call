import { Bot } from 'grammy';
import { MyContext } from '../types';
import { prisma } from '../../config/database';
import { notificationQueue } from '../notifications';
import { notifyQuotaLimitReachedIfExhausted } from '../../services/subscriptionExpiry';
import { escapeHtml } from '../../utils/sanitize';
import { dashboardKeyboard } from './dashboardNavigation';

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

  const inlineKb = dashboardKeyboard('history', callSessionId);

  const retentionNotice = recordingUrl && retentionDays
    ? `\n\n🎙️ <i>Audio saved. Retention: <b>${retentionDays} day${retentionDays > 1 ? 's' : ''}</b> (automatically deleted thereafter).</i>`
    : '';

  await notificationQueue.enqueue(
    bot,
    userTelegramId,
    `📞 <b>Practice Session Complete!</b>\n\n` +
      `• <b>Partner</b>: ${escapeHtml(partnerAlias)}\n` +
      `• <b>Duration</b>: ${durationStr}` +
      `${retentionNotice}`,
    { parse_mode: 'HTML', reply_markup: inlineKb },
    true,
    `postcall:${callSessionId}:${userTelegramId}`
  );

  if (/^\d+$/.test(userTelegramId)) {
    const user = await prisma.user.findUnique({ where: { telegramId: BigInt(userTelegramId) } });
    if (user) await notifyQuotaLimitReachedIfExhausted(bot, user.id, user);
  }
}
