import crypto from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Bot } from 'grammy';
import type { MyContext } from '../bot/types';
import { prisma } from '../config/database';
import { completeCallSession } from '../services/callCompletion';
import { handleCallFinishedEvent, type CallFinishedEventMessage } from '../services/eventSubscriber';
import { recoverPostCallJobs, startPostCallWorker } from '../services/postCallOutbox';
import { cleanupDirectCallMessages } from '../services/directCallMessages';

vi.mock('../services/subscriptionExpiry', () => ({ notifyQuotaLimitReachedIfExhausted: vi.fn() }));
vi.mock('../services/directCallMessages', () => ({ cleanupDirectCallMessages: vi.fn().mockResolvedValue(undefined) }));
const bot = { api: { sendMessage: vi.fn() } } as unknown as Bot<MyContext>;
afterEach(async () => { vi.restoreAllMocks(); await prisma.notificationJob.deleteMany(); await prisma.callSession.deleteMany(); await prisma.user.deleteMany(); });
async function fixture(duration = 120, deniedB?: boolean) {
  const a = await prisma.user.create({ data: { alias: 'Candidate <A>', telegramId: 111111n, plan: 'PLUS', dailyLimit: 10 } });
  const b = await prisma.user.create({ data: { alias: 'Candidate B', telegramId: 222222n, plan: 'PLUS', dailyLimit: 10 } });
  const call = await prisma.callSession.create({ data: { roomName: crypto.randomUUID(), userAId: a.id, userBId: b.id, recordingUrl: 'synthetic.wav', recordedByUserId: a.id } });
  await completeCallSession(call.id, { endedAt: new Date(), duration, charge: deniedB === undefined, reason: deniedB === undefined ? undefined : 'microphone_permission_denied', deniedUserId: deniedB === undefined ? undefined : deniedB ? b.id : a.id });
  await prisma.postCallJob.update({ where: { callId: call.id }, data: { nextAttemptAt: new Date(0), retentionA: 7, retentionB: 0 } });
  // A wake-up message deliberately carries incorrect recipient and recording fields.
  const event: CallFinishedEventMessage = { type: 'CALL_FINISHED', sessionId: call.id, roomName: 'forged', userAId: 'forged', userBId: 'forged', userATelegramId: '999999', userBTelegramId: '999998', userAAlias: 'forged', userBAlias: 'forged', durationSeconds: 99999, recordingUrl: 'forged', retentionDaysA: 365, retentionDaysB: 365 };
  return { a, b, call, event };
}
describe('durable completion events', () => {
  it('uses saved recipients, duration and recorder access instead of event fields; replay queues no duplicates', async () => {
    const { a, b, call, event } = await fixture();
    await handleCallFinishedEvent(event, bot);
    const cards = await prisma.notificationJob.findMany({ orderBy: { createdAt: 'asc' } });
    expect(cards).toHaveLength(2);
    const cardA = cards.find(card => card.telegramId === a.telegramId.toString())!;
    const cardB = cards.find(card => card.telegramId === b.telegramId.toString())!;
    expect(cardA.text).toContain('2m 0s'); expect(cardA.optionsJson).toContain('view=history'); expect(cardA.optionsJson).toContain('call=' + call.id);
    expect(cardB.optionsJson).not.toContain('play_rec:'); expect(cardB.text).toContain('Candidate &lt;A&gt;');
    expect(cards.some(card => card.telegramId === '999999')).toBe(false);
    await handleCallFinishedEvent(event, bot);
    expect(await prisma.notificationJob.count()).toBe(2);
    expect((await prisma.postCallJob.findUnique({ where: { callId: call.id } }))?.status).toBe('DONE');
  });
  it('does not queue review cards for a short call', async () => {
    const { event } = await fixture(3); await handleCallFinishedEvent(event, bot);
    expect(await prisma.notificationJob.count()).toBe(0);
  });
  it('cleans up a cancelled call without completed-session cards or referral awards', async () => {
    const a = await prisma.user.create({ data: { alias: 'Cancelled A', telegramId: 555555n } });
    const b = await prisma.user.create({ data: { alias: 'Cancelled B', telegramId: 666666n, referredByUserId: a.id } });
    const call = await prisma.callSession.create({ data: { roomName: crypto.randomUUID(), userAId: a.id, userBId: b.id } });
    await completeCallSession(call.id, { endedAt: new Date(), duration: 35, status: 'CANCELLED' });
    await prisma.postCallJob.update({ where: { callId: call.id }, data: { nextAttemptAt: new Date(0) } });
    expect(await recoverPostCallJobs(bot, call.id)).toBe(1);
    expect(cleanupDirectCallMessages).toHaveBeenCalledWith(bot, call.id);
    expect(await prisma.notificationJob.count()).toBe(0);
    expect(await prisma.referralReward.count({ where: { referredUserId: b.id } })).toBe(0);
  });
  for (const deniedB of [false, true]) it('attributes microphone denial using the saved participant: B=' + deniedB, async () => {
    const { a, b, event } = await fixture(2, deniedB); await handleCallFinishedEvent(event, bot);
    const cards = await prisma.notificationJob.findMany(); expect(cards).toHaveLength(2);
    expect(cards.find(card => card.telegramId === (deniedB ? b : a).telegramId.toString())?.text).toContain('Microphone Access Denied');
    expect(cards.find(card => card.telegramId === (deniedB ? a : b).telegramId.toString())?.text).toContain('Call Disconnected');
    expect((await prisma.user.findUnique({ where: { id: a.id } }))?.dailyCallsUsed).toBe(0);
  });
  it('cannot create effects for a missing call or outbox job', async () => {
    const { event } = await fixture(); event.sessionId = 'missing';
    await handleCallFinishedEvent(event, bot); expect(await prisma.notificationJob.count()).toBe(0);
  });
  it('keeps the work pending until a bot is available', async () => {
    const { call, event } = await fixture(); await handleCallFinishedEvent(event);
    expect((await prisma.postCallJob.findUnique({ where: { callId: call.id } }))?.status).toBe('QUEUED');
    expect(await prisma.notificationJob.count()).toBe(0);
  });
  it('rolls back call status and allowances when the durable job cannot be saved', async () => {
    const a = await prisma.user.create({ data: { alias: 'Atomic A', telegramId: 333333n } });
    const b = await prisma.user.create({ data: { alias: 'Atomic B', telegramId: 444444n } });
    const call = await prisma.callSession.create({ data: { roomName: crypto.randomUUID(), userAId: a.id, userBId: b.id } });
    vi.spyOn(prisma.postCallJob, 'create').mockRejectedValue(new Error('Synthetic persistence failure'));
    await expect(completeCallSession(call.id, { endedAt: new Date(), duration: 35 })).rejects.toThrow('Synthetic persistence failure');
    expect((await prisma.callSession.findUnique({ where: { id: call.id } }))?.status).toBe('ACTIVE');
    for (const user of [a, b]) expect((await prisma.user.findUnique({ where: { id: user.id } }))?.dailyCallsUsed).toBe(0);
  });
  it('retries a partial enqueue without duplicating a card whose delivery is uncertain', async () => {
    const { call, a, b } = await fixture();
    const original = prisma.notificationJob.create;
    const create = vi.spyOn(prisma.notificationJob, 'create').mockImplementation(async args => {
      if (args.data.telegramId === b.telegramId.toString()) throw new Error('Synthetic second enqueue failure');
      return original(args);
    });
    expect(await recoverPostCallJobs(bot, call.id)).toBe(0);
    expect(await prisma.notificationJob.count()).toBe(1);
    const partial = await prisma.notificationJob.findFirst({ where: { telegramId: a.telegramId.toString() } });
    await prisma.notificationJob.update({ where: { id: partial!.id }, data: { status: 'UNCONFIRMED' } });
    const retry = await prisma.postCallJob.findUnique({ where: { callId: call.id } });
    expect(retry?.status).toBe('QUEUED'); expect(retry?.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
    create.mockRestore();
    await prisma.postCallJob.update({ where: { callId: call.id }, data: { nextAttemptAt: new Date(0) } });
    expect(await recoverPostCallJobs(bot, call.id)).toBe(1);
    expect(await prisma.notificationJob.count()).toBe(2);
    expect((await prisma.notificationJob.findUnique({ where: { id: partial!.id } }))?.status).toBe('UNCONFIRMED');
  });
  it('continues polling after a bot becomes available and stops before subsequent work', async () => {
    const { call } = await fixture();
    vi.useFakeTimers();
    let available: Bot<MyContext> | null = null;
    const stop = startPostCallWorker(() => available);
    try {
      await vi.advanceTimersByTimeAsync(1000);
      expect((await prisma.postCallJob.findUnique({ where: { callId: call.id } }))?.status).toBe('QUEUED');
      available = bot;
      await vi.advanceTimersByTimeAsync(5000);
      expect((await prisma.postCallJob.findUnique({ where: { callId: call.id } }))?.status).toBe('DONE');
      await stop();
      await prisma.postCallJob.update({ where: { callId: call.id }, data: { status: 'QUEUED', nextAttemptAt: new Date(0) } });
      await vi.advanceTimersByTimeAsync(10000);
      expect((await prisma.postCallJob.findUnique({ where: { callId: call.id } }))?.status).toBe('QUEUED');
    } finally { await stop(); vi.useRealTimers(); }
  });
});
