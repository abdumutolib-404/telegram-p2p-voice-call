import crypto from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { afterEach, expect, it, vi } from 'vitest';
import { env } from '../config/env';
import { prisma } from '../config/database';
import { currentTerms } from '../services/terms';
import { getAllowancePeriod } from '../services/plan';
import calls from '../routes/calls';
import dashboard from '../routes/dashboard';
import auth from '../routes/auth';

vi.mock('../config/livekit', () => ({ generateLiveKitToken: vi.fn().mockResolvedValue('synthetic-voice-token') }));
vi.mock('../socket/signaling', () => ({ scheduleConnectionHandshakeTimer: vi.fn(), setRoomDurationLimit: vi.fn() }));
const app = express(); app.use(express.json()); app.use('/calls', calls); app.use('/dashboard', dashboard); app.use('/auth', auth);
const users: string[] = [], sessions: string[] = [];
async function member(data = {}) {
  const user = await prisma.user.create({ data: { telegramId: BigInt('0x' + crypto.randomBytes(6).toString('hex')), alias: 'Synthetic readiness fixture',
    onboarded: true, termsAcceptedVersion: currentTerms.version, termsDocumentSha256: currentTerms.sha256, termsAcceptedAt: new Date(), ...data } });
  users.push(user.id); return user;
}
function signed(id: bigint) {
  const params = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id: Number(id), first_name: 'Fixture' }) });
  params.sort();
  const text = [...params].map(([key, value]) => `${key}=${value}`).join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(env.BOT_TOKEN).digest();
  params.set('hash', crypto.createHmac('sha256', secret).update(text).digest('hex')); return params.toString();
}
afterEach(async () => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  await prisma.callSession.deleteMany({ where: { id: { in: sessions.splice(0) } } });
  await prisma.user.deleteMany({ where: { id: { in: users.splice(0) } } });
});

it('keeps period bounds consistent when the request crosses a UTC month boundary', () => {
  const OriginalDate = Date;
  let reads = 0;
  const instants = [OriginalDate.parse('2026-12-31T23:59:59.999Z'), OriginalDate.parse('2027-01-01T00:00:00.000Z')];
  vi.stubGlobal('Date', class extends OriginalDate {
    constructor(value?: string | number | Date) {
      super(value === undefined ? instants[Math.min(reads++, 1)] : value instanceof OriginalDate ? value.getTime() : value);
    }
  });
  expect(getAllowancePeriod({})).toEqual({ kind: 'calendar_month', startsAt: '2026-12-01T00:00:00.000Z', endsAt: '2027-01-01T00:00:00.000Z' });
});

it('returns original authorized timing and full duration when a participant reopens mid-call', async () => {
  const [a, b, outsider] = await Promise.all([member(), member(), member()]);
  const startedAt = new Date(Date.now() - 600000);
  const call = await prisma.callSession.create({ data: { roomName: crypto.randomUUID(), userAId: a.id, userBId: b.id, status: 'ACTIVE', mediaAuthorizedAt: startedAt } });
  sessions.push(call.id);
  const response = await request(app).get('/calls/active').set('x-telegram-init-data', signed(a.telegramId));
  expect(response.status).toBe(200);
  expect(response.body).toMatchObject({ hasActiveCall: true, callDurationLimit: 900, maxDurationSeconds: 900,
    startedAt: startedAt.getTime(), expiresAt: startedAt.getTime() + 900000 });
  expect((await request(app).get('/calls/active').set('x-telegram-init-data', signed(outsider.telegramId))).body).toEqual({ hasActiveCall: false });
});

it('does not invent a speaking start before the media gate opens', async () => {
  const [a, b] = await Promise.all([member(), member()]);
  const call = await prisma.callSession.create({ data: { roomName: crypto.randomUUID(), userAId: a.id, userBId: b.id, status: 'ACTIVE' } }); sessions.push(call.id);
  const response = await request(app).get('/calls/active').set('x-telegram-init-data', signed(a.telegramId));
  expect(response.body).toMatchObject({ hasActiveCall: true, callDurationLimit: 900, startedAt: null, expiresAt: null });
});

it('reports only the current participant active session and confirms when it becomes terminal', async () => {
  const [a, b, outsider] = await Promise.all([member(), member(), member()]);
  const call = await prisma.callSession.create({ data: { roomName: crypto.randomUUID(), userAId: a.id, userBId: b.id, status: 'ACTIVE' } }); sessions.push(call.id);
  expect((await request(app).get('/dashboard/summary').set('x-telegram-init-data', signed(a.telegramId))).body.activeCall).toEqual({ roomName: call.roomName });
  expect((await request(app).get('/dashboard/summary').set('x-telegram-init-data', signed(outsider.telegramId))).body.activeCall).toBeNull();
  await prisma.callSession.update({ where: { id: call.id }, data: { status: 'CANCELLED', endedAt: new Date() } });
  expect((await request(app).get('/dashboard/summary').set('x-telegram-init-data', signed(a.telegramId))).body.activeCall).toBeNull();
});

it('keeps custom subscription periods and calendar-month rollover explicit without resetting balances', async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-12-31T22:30:00Z'));
  expect(getAllowancePeriod({})).toEqual({ kind: 'calendar_month', startsAt: '2026-12-01T00:00:00.000Z', endsAt: '2027-01-01T00:00:00.000Z' });
  expect(getAllowancePeriod({ subscriptionStartsAt: '2026-12-20T09:15:00Z', subscriptionExpiresAt: '2027-03-20T09:15:00Z', subscriptionDurationDays: 90 })).toEqual({ kind: 'subscription', startsAt: '2026-12-20T09:15:00.000Z', endsAt: '2027-03-20T09:15:00.000Z' });
  expect(getAllowancePeriod({ subscriptionExpiresAt: '2026-12-01T00:00:00Z' }).kind).toBe('calendar_month');
});

it('returns the same allowance dates and included/bonus split during launch and account refresh', async () => {
  const a = await member();
  await prisma.referralReward.create({ data: { userId: a.id, referredUserId: a.id, status: 'AVAILABLE' } });
  const token = signed(a.telegramId);
  const launch = await request(app).post('/auth/verify').set('x-telegram-init-data', token).send({});
  const summary = await request(app).get('/dashboard/summary').set('x-telegram-init-data', token);
  expect(launch.status).toBe(200); expect(summary.status).toBe(200);
  expect(summary.body.user).toMatchObject({ includedCallsRemaining: 3, bonusCallsRemaining: 1, callsRemaining: 4, allowancePeriod: launch.body.user.allowancePeriod });
  expect(summary.body.user.allowancePeriod.kind).toBe('calendar_month');
});
