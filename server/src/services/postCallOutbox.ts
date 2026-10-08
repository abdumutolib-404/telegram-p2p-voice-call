import crypto from 'node:crypto';
import type { Bot } from 'grammy';
import type { MyContext } from '../bot/types';
import { prisma } from '../config/database';
import { notificationQueue } from '../bot/notifications';
import { sendPostCallReviewCard } from '../bot/handlers/postCall';
import { onCallFinishedCheckReferralReward } from './referralService';
import { cleanupDirectCallMessages } from './directCallMessages';
import { logger } from '../utils/logger';
import { recoverRecordingDeliveries } from './recordingDelivery';

/** Claims commit before participant locks, preserving admission/completion's User-first lock order. */
export async function recoverPostCallJobs(bot: Bot<MyContext>, callId?: string, stopped: () => boolean = () => false): Promise<number> {
  const now = new Date();
  const eligible = {
    ...(callId ? { callId } : {}),
    OR: [
      { status: 'QUEUED', nextAttemptAt: { lte: now } },
      { status: 'PROCESSING', leaseUntil: { lte: now } },
    ],
  };
  const jobs = await prisma.postCallJob.findMany({ where: eligible, orderBy: { createdAt: 'asc' }, take: 20 });
  let completed = 0;
  for (const job of jobs) {
    if (stopped()) break;
    const owner = crypto.randomUUID();
    const claim = await prisma.postCallJob.updateMany({ where: { ...eligible, callId: job.callId }, data: {
      status: 'PROCESSING', owner, leaseUntil: new Date(Date.now() + 120000), attempts: { increment: 1 },
    } });
    if (claim.count !== 1) continue;
    try {
      // Never trust aliases, recipient IDs, durations or recording access supplied by Pub/Sub.
      const call = await prisma.callSession.findUnique({ where: { id: job.callId }, include: { userA: true, userB: true } });
      if (!call || !['COMPLETED', 'CANCELLED'].includes(call.status) || !call.userA || !call.userB) throw new Error('Terminal call unavailable');
      if (call.status === 'COMPLETED') await onCallFinishedCheckReferralReward(call, bot);
      if (call.status === 'COMPLETED' && job.reason === 'microphone_permission_denied') {
        const denied = job.deniedUserId === call.userBId ? call.userB : call.userA;
        const partner = denied.id === call.userAId ? call.userB : call.userA;
        await notificationQueue.enqueue(bot, denied.telegramId.toString(),
          '🎙️ <b>Call Ended: Microphone Access Denied</b>\n\n' +
          'Microphone access was not granted after 3 attempts. Speaking practice requires a working microphone so your partner can hear you.\n\n' +
          '💡 <i>Please allow microphone permissions in your browser / Telegram settings before starting your next session.</i>',
          { parse_mode: 'HTML' }, true, `postcall-microphone:${call.id}:${denied.id}`);
        await notificationQueue.enqueue(bot, partner.telegramId.toString(),
          '⚠️ <b>Call Disconnected</b>\n\nYour practice partner was unable to grant microphone permissions. No call limits were consumed for this session.',
          { parse_mode: 'HTML' }, true, `postcall-microphone:${call.id}:${partner.id}`);
      } else if (call.status === 'COMPLETED' && call.duration >= 5) {
        const marker = call.recordedByUserId;
        const recorderIds = marker?.split(',').map(id => id.trim()) ?? [];
        const hasRecording = Boolean(call.recordingUrl && (!call.recordingExpiresAt || call.recordingExpiresAt > new Date()));
        for (const [user, partner, retention] of [[call.userA, call.userB, job.retentionA], [call.userB, call.userA, job.retentionB]] as const) {
          const records = hasRecording && retention > 0 && (marker === 'BOTH' || marker === 'ALL' || recorderIds.includes(user.id));
          await sendPostCallReviewCard(bot, user.telegramId.toString(), call.id, partner.alias, call.duration,
            records ? call.recordingUrl! : undefined, records ? retention : undefined);
        }
      }
      const done = await prisma.postCallJob.updateMany({ where: { callId: job.callId, status: 'PROCESSING', owner }, data: {
        status: 'DONE', owner: null, leaseUntil: null, failure: null,
      } });
      completed += done.count;
      // Removing old join buttons is repeatable; it never grants recording or calling access.
      try { if (!stopped()) await cleanupDirectCallMessages(bot, call.id); }
      catch (error) { logger.warn('Post-call join message cleanup failed', { service: 'postCallOutbox', callId: call.id }, error); }
    } catch (error) {
      await prisma.postCallJob.updateMany({ where: { callId: job.callId, status: 'PROCESSING', owner }, data: {
        status: 'QUEUED', owner: null, leaseUntil: null,
        nextAttemptAt: new Date(Date.now() + Math.min(900000, 5000 * 2 ** Math.min(job.attempts, 8))),
        failure: 'Post-call processing unavailable; retry scheduled.',
      } });
      logger.warn('Post-call processing deferred', { service: 'postCallOutbox', callId: job.callId, attempt: job.attempts + 1 }, error);
    }
  }
  return completed;
}

let wakeup: (() => void) | undefined;
export function wakePostCallWorker(): void { wakeup?.(); }

export function startPostCallWorker(supplier: () => Bot<MyContext> | null | undefined): () => Promise<void> {
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;
  let active: Promise<void> | undefined;
  const tick = () => {
    if (stopped || active) return;
    clearTimeout(timer);
    active = Promise.resolve().then(async () => {
      try { const bot = supplier(); if (bot && !stopped) { await recoverPostCallJobs(bot, undefined, () => stopped); await recoverRecordingDeliveries(bot, () => stopped); } }
      catch (error) { logger.warn('Post-call recovery unavailable', { service: 'postCallOutbox' }, error); }
      finally { active = undefined; if (!stopped) timer = setTimeout(tick, 5000); }
    });
  };
  wakeup = tick;
  timer = setTimeout(tick, 1000);
  return async () => { stopped = true; if (wakeup === tick) wakeup = undefined; clearTimeout(timer); await active; };
}
