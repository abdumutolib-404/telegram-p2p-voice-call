import { afterEach, describe, expect, it, vi } from 'vitest';
import crypto from 'node:crypto';
import { prisma } from '../config/database';
import { getRedis } from '../config/redis';
import { env } from '../config/env';
import { saveOtpChallengeToRedis, verifyOtpChallengeAtomic } from '../routes/admin';
import { escapeCsvField } from '../utils/csv';
import { completeCallSession } from '../services/callCompletion';
import { setupSocketSignaling } from '../socket/signaling';
import { setupPaymentHandlers } from '../bot/handlers/payments';
import { getPlansConfig } from '../services/plan';
import { changeRecordingIntent, trackRecordingKey } from '../services/recordingLifecycle';
import { isUserSessionRecorder } from '../utils/recordingAccess';

const providers = vi.hoisted(() => ({ recording: 0, stop: vi.fn(), delete: vi.fn(async () => {}), refund: vi.fn(async () => true) }));
vi.mock('../config/livekit', () => ({
  generateLiveKitToken: async () => 'synthetic-token', stopAudioEgress: providers.stop,
  deleteLiveKitRoom: providers.delete, areCallParticipantsPresent: async () => true,
  countCallParticipants: async () => 2,
  enableCallSubscriptions: async () => {},
  getAudioEgressInfo: async () => ({status: 1}),
  startAudioEgress: async (_room: string, prepare: Function) => {
    const n = ++providers.recording, relativeUrl = `recordings/synthetic-${n}.mp3`;
    await prepare(relativeUrl);
    return { egressId: `synthetic-egress-${n}`, relativeUrl };
  },
}));

afterEach(() => { vi.restoreAllMocks(); vi.clearAllTimers(); vi.useRealTimers(); });
let sequence = 0;
async function participants() {
  const n = ++sequence;
  const a = await prisma.user.create({ data: { telegramId: BigInt(78000000 + n * 3), alias: `security-a-${n}` } });
  const b = await prisma.user.create({ data: { telegramId: BigInt(78000001 + n * 3), alias: `security-b-${n}` } });
  return { a, b, roomName: `security-room-${n}` };
}

describe('security boundary regressions', () => {
  it.each(['=1+1', '+SUM(1,2)', '-1+1', '@SUM(1,2)', '\t=1+1', '\r\n+1', '\uFEFF=1', '\u0000-2', '\u200B@x'])('exports %j as literal spreadsheet text', value => {
    expect(escapeCsvField(value)).toBe(`"'${value}"`);
  });
  it('preserves ordinary CSV text, delimiters, newlines, and null', () => {
    expect(escapeCsvField('How, "exactly"?\nNext')).toBe('"How, ""exactly""?\nNext"');
    expect(escapeCsvField(null)).toBe('""');
    expect(escapeCsvField('What is 2 + 2?')).toBe('"What is 2 + 2?"');
  });

  it('cannot revive a Redis challenge consumed on another replica, even during a Redis error', async () => {
    const id = crypto.randomUUID(), otp = '123789';
    await saveOtpChallengeToRedis(id, { challengeId: id, otpHash: crypto.createHash('sha256').update(otp).digest('hex'), expiresAt: Date.now()+300000, attempts: 0, maxAttempts: 5, consumed: false });
    const redis = getRedis();
    // The other replica's atomic verification removes shared storage, not this module's map.
    await redis.del(`otp:challenge:${id}`);
    expect((await verifyOtpChallengeAtomic(id, otp)).success).toBe(false);
    vi.spyOn(redis, 'eval').mockRejectedValue(new Error('Synthetic Redis outage'));
    expect((await verifyOtpChallengeAtomic(id, otp)).success).toBe(false);
  });
  it('accepts a valid shared challenge exactly once and preserves memory-only development support', async () => {
    const otp = '654987';
    const make = () => ({ challengeId: crypto.randomUUID(), otpHash: crypto.createHash('sha256').update(otp).digest('hex'), expiresAt: Date.now()+300000, attempts: 0, maxAttempts: 5, consumed: false });
    const shared = make(); await saveOtpChallengeToRedis(shared.challengeId, shared);
    expect((await verifyOtpChallengeAtomic(shared.challengeId, otp)).success).toBe(true);
    expect((await verifyOtpChallengeAtomic(shared.challengeId, otp)).success).toBe(false);
    vi.spyOn(getRedis(), 'set').mockRejectedValueOnce(new Error('Synthetic write outage'));
    const memory = make(); await saveOtpChallengeToRedis(memory.challengeId, memory);
    expect((await verifyOtpChallengeAtomic(memory.challengeId, otp)).success).toBe(true);
    expect((await verifyOtpChallengeAtomic(memory.challengeId, otp)).success).toBe(false);
  });

  it('charges a long call with a forged permission reason once, while a short failure is free', async () => {
    const { a, b, roomName } = await participants();
    const month = new Date().toISOString().slice(0,7);
    for (const id of [a.id,b.id]) await prisma.user.update({ where: { id }, data: { dailyCallsUsed: 1, lastCallDate: month } });
    const session = await prisma.callSession.create({ data: { roomName, userAId: a.id, userBId: b.id, mediaAuthorizedAt: new Date() } });
    const completion = { endedAt: new Date(), duration: 35, charge: false, reason: 'microphone_permission_denied', deniedUserId: a.id };
    expect(await completeCallSession(session.id, completion)).toEqual({ count: 1 });
    expect(await completeCallSession(session.id, completion)).toEqual({ count: 0 });
    expect((await prisma.user.findUnique({ where: { id: a.id } }))?.dailyCallsUsed).toBe(2);
    const job = await prisma.postCallJob.findUnique({ where: { callId: session.id } });
    expect(job?.reason).toBe('call_finished'); expect(job?.deniedUserId).toBeUndefined();
    const short = await prisma.callSession.create({ data: { roomName: roomName+'-short', userAId: a.id, userBId: b.id } });
    await completeCallSession(short.id, { ...completion, duration: 2 });
    expect((await prisma.user.findUnique({ where: { id: a.id } }))?.dailyCallsUsed).toBe(2);
  });

  it('rejects a saved downgrade invoice and refunds a late paid event without changing the higher entitlement', async () => {
    const { a } = await participants();
    const expires = new Date(Date.now()+7*86400000);
    await prisma.user.update({ where: { id: a.id }, data: { plan: 'BOSS', subscriptionStatus: 'ACTIVE', subscriptionExpiresAt: expires, dailyCallsUsed: 8 } });
    const handlers: Record<string, Function> = {};
    setupPaymentHandlers({ on: (name: string, fn: Function) => { handlers[name]=fn; }, callbackQuery: () => {}, api: { refundStarPayment: providers.refund } } as any);
    const amount = getPlansConfig().PLUS.starsPrice, chargeId = crypto.randomUUID();
    const base = { from: { id: Number(a.telegramId) } }, invoice = `plan_purchase:PLUS:${a.telegramId}:S1`;
    const answer = vi.fn();
    await handlers.pre_checkout_query({ ...base, preCheckoutQuery: { invoice_payload: invoice, currency: 'XTR', total_amount: amount }, answerPreCheckoutQuery: answer });
    expect(answer.mock.calls[0][0]).toBe(false);
    const ctx = { ...base, reply: vi.fn(), message: { successful_payment: { invoice_payload: invoice, currency: 'XTR', total_amount: amount, telegram_payment_charge_id: chargeId } } };
    await handlers['message:successful_payment'](ctx);
    await handlers['message:successful_payment'](ctx);
    const user = await prisma.user.findUnique({ where: { id: a.id } });
    expect(user?.plan).toBe('BOSS'); expect(user?.subscriptionExpiresAt).toEqual(expires); expect(user?.dailyCallsUsed).toBe(8);
    expect((await prisma.starsTransaction.findUnique({ where: { telegramPaymentId: chargeId } }))?.status).toBe('REFUNDED');
  });

  it('keeps private ownership after stop and retains every restart key through the socket handlers', async () => {
    vi.useFakeTimers();
    const { a,b,roomName } = await participants();
    const { connect } = socketHarness();
    const first = connect(a.id), second = connect(b.id);
    const session = await prisma.callSession.create({ data: { roomName, userAId: a.id, userBId: b.id, mediaAuthorizedAt: new Date() } });
    await first.toggle_record({ roomName, record: true });
    await first.toggle_record({ roomName, record: false });
    const stopped = await prisma.callSession.findUnique({ where: { id: session.id } });
    expect(stopped?.activeRecorderIds).toBeNull(); expect(stopped?.recordedByUserId).toBe(a.id);
    expect(isUserSessionRecorder(stopped!.recordedByUserId, b.id)).toBe(false);
    await second.toggle_record({ roomName, record: true });
    const restarted = await prisma.callSession.findUnique({ where: { id: session.id } });
    expect(restarted?.recordedByUserId).toBe(b.id); expect(restarted?.recordingKeys).toHaveLength(2);
    expect(isUserSessionRecorder(restarted!.recordedByUserId, a.id)).toBe(false);
    await changeRecordingIntent(session.id,a.id,true,restarted!.egressId!);
    await changeRecordingIntent(session.id,b.id,false,restarted!.egressId!);
    const joined = await prisma.callSession.findUnique({ where: { id: session.id } });
    expect(joined?.activeRecorderIds).toBe(a.id); expect(joined?.recordedByUserId?.split(',')).toContain(b.id);
    await trackRecordingKey(session.id,'recordings/losing-start.mp3');
    expect((await prisma.callSession.findUnique({ where: { id: session.id } }))?.recordingKeys).toHaveLength(3);
    await completeCallSession(session.id,{ endedAt:new Date(),duration:2,egressId:stopped!.egressId,recordingUrl:stopped!.recordingUrl });
    const finished=await prisma.callSession.findUnique({where:{id:session.id}});
    expect(finished?.recordingUrl).toBe(restarted?.recordingUrl);
    expect(finished?.egressId).toBe(restarted?.egressId);
    expect(finished?.recordingExpiresAt).toBeInstanceOf(Date);
  });

  it('only starts readiness for the actual active participants, and starts it once', async () => {
    vi.useFakeTimers();
    const { a,b,roomName } = await participants(), { connect, emit } = socketHarness();
    const first=connect(a.id), second=connect(b.id), outsider=connect('outsider');
    await first.peer_ready({ roomName:'unknown-room' }); await second.peer_ready({ roomName:'unknown-room' });
    expect(emit).not.toHaveBeenCalledWith('call_started',expect.anything());
    await prisma.callSession.create({ data: { roomName, userAId:a.id,userBId:b.id } });
    await outsider.peer_ready({ roomName }); await first.peer_ready({ roomName });
    expect(emit).not.toHaveBeenCalledWith('call_started',expect.anything());
    await Promise.all([second.peer_ready({ roomName }),second.peer_ready({ roomName })]);
    expect(emit.mock.calls.filter(call=>call[0]==='call_started')).toHaveLength(1);
  });
  it('late readiness cannot reset billing or the server deadline, and finishing closes the media room once', async () => {
    vi.useFakeTimers(); providers.delete.mockClear();
    const {a,b,roomName}=await participants(),{connect,emit}=socketHarness();
    const first=connect(a.id),second=connect(b.id),admittedAt=new Date();
    const session=await prisma.callSession.create({data:{roomName,userAId:a.id,userBId:b.id,createdAt:admittedAt}});
    await first.peer_ready({roomName});vi.setSystemTime(admittedAt.getTime()+30000);
    await second.peer_ready({roomName});
    const started=emit.mock.calls.find(call=>call[0]==='call_started')![1];
    expect(started.startedAt).toBe(admittedAt.getTime());expect(started.expiresAt).toBe(admittedAt.getTime()+900000);
    vi.setSystemTime(admittedAt.getTime()+31000);
    await first.finish_call({roomName,reason:'microphone_permission_denied'});
    await first.finish_call({roomName,reason:'microphone_permission_denied'});
    expect((await prisma.callSession.findUnique({where:{id:session.id}}))?.duration).toBe(31);
    expect((await prisma.user.findUnique({where:{id:a.id}}))?.dailyCallsUsed).toBe(1);
    expect(providers.delete).toHaveBeenCalledOnce();expect(providers.delete).toHaveBeenCalledWith(roomName);
  });
});

function socketHarness() {
  let connection: Function = () => {};
  const emit=vi.fn();
  const io={ use: () => {}, on: (_name: string, fn: Function) => { connection=fn; }, to: () => ({emit}), sockets: { sockets:new Map() } };
  setupSocketSignaling(io as any);
  return { emit, connect: (userId: string) => {
    const handlers: Record<string,Function>={};
    connection({ id:crypto.randomUUID(), data:{userId}, use: () => {}, on:(name:string,fn:Function)=>{handlers[name]=fn;}, emit:vi.fn(), join:()=>{}, leave:()=>{} });
    return handlers;
  } };
}
