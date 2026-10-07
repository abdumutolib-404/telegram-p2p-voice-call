import crypto from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '../config/env';
import { prisma } from '../config/database';
import { currentTerms } from '../services/terms';
import dashboardRoutes, { setDashboardBot } from '../routes/dashboard';
import authRoutes from '../routes/auth';
import type { Bot } from 'grammy';
import type { MyContext } from '../bot/types';
import { notificationQueue } from '../bot/notifications';
vi.mock('../socket/signaling', () => ({ scheduleConnectionHandshakeTimer: vi.fn(), setRoomDurationLimit: vi.fn() }));
vi.mock('../bot/notifications', () => ({ notificationQueue: { enqueue: vi.fn().mockResolvedValue(undefined) } }));
const app = express(); app.use(express.json()); app.use('/dashboard', dashboardRoutes); app.use('/auth', authRoutes);
app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => res.status(500).json({ error: error.message }));
const consent = { onboarded: true, termsAcceptedVersion: currentTerms.version, termsAcceptedAt: new Date(), termsDocumentSha256: currentTerms.sha256 };
const signed = (id: bigint) => {
  const params = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id: Number(id), first_name: 'Synthetic fixture' }) });
  const text = [...params].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(env.BOT_TOKEN).digest();
  params.set('hash', crypto.createHmac('sha256', secret).update(text).digest('hex')); return params.toString();
};
let sequence = 910000000n;
async function member(data = {}) { sequence++; return prisma.user.create({ data: { telegramId: sequence, alias: `P2P-${crypto.randomBytes(4).toString('hex').toUpperCase()}`, ...consent, ...data } }); }
describe('Telegram-only member dashboard', () => {
  beforeEach(() => { setDashboardBot({ token: 'synthetic-token' } as Bot<MyContext>); vi.mocked(notificationQueue.enqueue).mockReset().mockResolvedValue(undefined); });
  it('rejects direct and forged requests without reading private data', async () => {
    expect((await request(app).get('/dashboard/sessions')).status).toBe(403);
    expect((await request(app).get('/dashboard/sessions').set('x-telegram-init-data', 'forged')).body.code).toBe('auth_rejected');
  });
  it('does not register someone through a signed web launch', async () => {
    sequence++;
    const response = await request(app).post('/auth/verify').set('x-telegram-init-data', signed(sequence));
    expect(response.body.code).toBe('registration_required');
    expect(await prisma.user.findUnique({ where: { telegramId: sequence } })).toBeNull();
  });
  it.each([{ onboarded: false, code: 'registration_required' }, { termsAcceptedVersion: '2020-01-01', code: 'terms_required' }, { termsDocumentSha256: '0'.repeat(64), code: 'terms_required' }])('requires completed registration and current document: $code', async ({ code, ...data }) => {
    const user = await member(data);
    for (const route of ['/dashboard/summary', '/dashboard/sessions', '/dashboard/favorites']) {
      const response = await request(app).get(route).set('x-telegram-init-data', signed(user.telegramId)); expect(response.status).toBe(403); expect(response.body.code).toBe(code);
    }
  });
  it('keeps the dashboard available with zero calls and protects immutable account fields', async () => {
    const user = await member({ dailyCallsUsed: 3, lastCallDate: new Date().toISOString().slice(0, 10) });
    const auth = await request(app).post('/auth/verify').set('x-telegram-init-data', signed(user.telegramId));
    expect(auth.status).toBe(200); expect(auth.body.status).toBe('granted'); expect(auth.body.canStartCall).toBe(false);
    const token = signed(user.telegramId);
    const summary = await request(app).get('/dashboard/summary').set('x-telegram-init-data', token);
    expect(summary.body.user.callsRemaining).toBe(0); expect(summary.headers['cache-control']).toBe('no-store');
    expect((await request(app).patch('/dashboard/account').set('x-telegram-init-data', token).send({ plan: 'BOSS', alias: 'spoof' })).status).toBe(400);
    expect((await request(app).patch('/dashboard/account').set('x-telegram-init-data', token).send({ subFC: 7 })).status).toBe(400);
    expect((await request(app).patch('/dashboard/account').set('x-telegram-init-data', token).send({ dnd: true, subFC: 6, subLR: 7, subGRA: 6.5, subP: 7 })).status).toBe(200);
    const stored = await prisma.user.findUnique({ where: { id: user.id } }); expect(stored?.dnd).toBe(true); expect(stored?.band).toBe(6.5); expect(stored?.alias).toBe(user.alias);
  });
  it('enforces session ownership for viewing, rating, reporting and saving partners', async () => {
    const [a, b, outsider] = await Promise.all([member(), member(), member()]);
    const session = await prisma.callSession.create({ data: { userAId: a.id, userBId: b.id, roomName: crypto.randomUUID(), status: 'COMPLETED' } });
    const token = signed(outsider.telegramId);
    expect((await request(app).get(`/dashboard/sessions/${session.id}`).set('x-telegram-init-data', token)).status).toBe(404);
    for (const [action, body] of [['rating', { stars: 5 }], ['report', { reason: 'Harassment' }], ['favorite', {}]] as const) expect((await request(app).post(`/dashboard/sessions/${session.id}/${action}`).set('x-telegram-init-data', token).send(body)).status).toBe(404);
    const history = await request(app).get('/dashboard/sessions').set('x-telegram-init-data', signed(a.telegramId));
    expect(history.status).toBe(200); expect(history.body.sessions.map((item: { id: string }) => item.id)).toEqual([session.id]);
    expect(JSON.stringify(history.body)).not.toContain(String(b.telegramId)); expect(JSON.stringify(history.body)).not.toContain(b.id);
  });
  it('allows rating and reporting independently and makes duplicate actions atomic', async () => {
    const [a, b] = await Promise.all([member(), member()]);
    const session = await prisma.callSession.create({ data: { userAId: a.id, userBId: b.id, roomName: crypto.randomUUID(), status: 'COMPLETED' } });
    const token = signed(a.telegramId);
    const rated = await Promise.all([1, 2].map(() => request(app).post(`/dashboard/sessions/${session.id}/rating`).set('x-telegram-init-data', token).send({ stars: 5 })));
    expect(rated.map(result => result.status).sort()).toEqual([200, 409]);
    const reported = await Promise.all([1, 2].map(() => request(app).post(`/dashboard/sessions/${session.id}/report`).set('x-telegram-init-data', token).send({ reason: 'Harassment' })));
    expect(reported.map(result => result.status).sort()).toEqual([200, 409]);
    expect((await prisma.user.findUnique({ where: { id: b.id } }))?.warningCount).toBe(1);
    const history = await request(app).get(`/dashboard/sessions/${session.id}`).set('x-telegram-init-data', token);
    expect(history.body.session.rating).toBe(5); expect(history.body.session.reported).toBe(true);
  });
  it('hides expired and other participants recordings without leaking storage URLs', async () => {
    const [a, b] = await Promise.all([member(), member()]);
    await prisma.callSession.create({ data: { userAId: a.id, userBId: b.id, roomName: crypto.randomUUID(), status: 'COMPLETED', recordingUrl: 'private-storage-key', recordedByUserId: b.id, recordingExpiresAt: new Date(Date.now() + 100000) } });
    const history = await request(app).get('/dashboard/sessions').set('x-telegram-init-data', signed(a.telegramId));
    expect(history.body.sessions[0].recordingAvailable).toBe(false); expect(JSON.stringify(history.body)).not.toContain('private-storage-key');
  });
  it('paginates history with a stable cursor and rejects a foreign cursor', async () => {
    const [a, b, outsider] = await Promise.all([member(), member(), member()]);
    for (let index = 0; index < 24; index++) await prisma.callSession.create({ data: { userAId: a.id, userBId: b.id, roomName: crypto.randomUUID(), status: 'COMPLETED', createdAt: new Date('2026-10-01') } });
    const token = signed(a.telegramId); const first = await request(app).get('/dashboard/sessions').set('x-telegram-init-data', token);
    expect(first.body.sessions).toHaveLength(20);
    const second = await request(app).get(`/dashboard/sessions?cursor=${first.body.nextCursor}`).set('x-telegram-init-data', token);
    expect(second.body.sessions).toHaveLength(4); expect(second.body.nextCursor).toBeNull();
    expect(new Set([...first.body.sessions, ...second.body.sessions].map(item => item.id)).size).toBe(24);
    expect((await request(app).get(`/dashboard/sessions?cursor=${first.body.nextCursor}`).set('x-telegram-init-data', signed(outsider.telegramId))).status).toBe(404);
  });
  it('accepts only the callee, rejects expired invitations and honors changed DND', async () => {
    const [a, b] = await Promise.all([member(), member()]);
    const invitation = await prisma.callSession.create({ data: { userAId: a.id, userBId: b.id, roomName: `direct_${crypto.randomUUID()}`, status: 'PENDING' } });
    expect((await request(app).post(`/dashboard/invitations/${invitation.id}/accept`).set('x-telegram-init-data', signed(a.telegramId))).status).toBe(403);
    await prisma.user.update({ where: { id: b.id }, data: { dnd: true } });
    expect((await request(app).post(`/dashboard/invitations/${invitation.id}/accept`).set('x-telegram-init-data', signed(b.telegramId))).status).toBe(409);
    await prisma.user.update({ where: { id: b.id }, data: { dnd: false } });
    await prisma.callSession.update({ where: { id: invitation.id }, data: { createdAt: new Date(Date.now() - 70000) } });
    expect((await request(app).post(`/dashboard/invitations/${invitation.id}/accept`).set('x-telegram-init-data', signed(b.telegramId))).status).toBe(409);
  });
  it('saves partners idempotently and removes only the current users favorite', async () => {
    const [a, b] = await Promise.all([member(), member()]);
    const session = await prisma.callSession.create({ data: { userAId: a.id, userBId: b.id, roomName: crypto.randomUUID(), status: 'COMPLETED' } });
    for (const user of [a, a, b]) expect((await request(app).post(`/dashboard/sessions/${session.id}/favorite`).set('x-telegram-init-data', signed(user.telegramId))).status).toBe(200);
    const list = await request(app).get('/dashboard/favorites').set('x-telegram-init-data', signed(a.telegramId));
    expect(list.body.favorites).toEqual([{ id: b.id, alias: b.alias, band: b.band, available: true }]);
    expect((await request(app).delete(`/dashboard/favorites/${b.id}`).set('x-telegram-init-data', signed(a.telegramId))).status).toBe(200);
    expect((await request(app).get('/dashboard/favorites').set('x-telegram-init-data', signed(a.telegramId))).body.favorites).toEqual([]);
    expect((await request(app).get('/dashboard/favorites').set('x-telegram-init-data', signed(b.telegramId))).body.favorites).toHaveLength(1);
  });
  it('sends a saved-partner invitation and accepts it exactly once', async () => {
    const [a, b] = await Promise.all([member(), member()]);
    await prisma.favoritePartner.create({ data: { userId: a.id, partnerId: b.id } });
    const invited = await request(app).post('/dashboard/invitations').set('x-telegram-init-data', signed(a.telegramId)).send({ partnerId: b.id });
    expect(invited.status).toBe(201); expect(notificationQueue.enqueue).toHaveBeenCalledOnce();
    const incoming = await request(app).get('/dashboard/invitations').set('x-telegram-init-data', signed(b.telegramId));
    expect(incoming.body.invitations).toMatchObject([{ id: invited.body.id, incoming: true, partnerAlias: a.alias }]);
    const accepted = await Promise.all([1, 2].map(() => request(app).post(`/dashboard/invitations/${invited.body.id}/accept`).set('x-telegram-init-data', signed(b.telegramId))));
    expect(accepted.map(result => result.status).sort()).toEqual([200, 409]);
    expect(accepted.find(result => result.status === 200)?.body.activeCallId).toBe(invited.body.id);
    expect((await prisma.callSession.findUnique({ where: { id: invited.body.id } }))?.status).toBe('ACTIVE');
  });
  it('cancels an invitation when durable notification enqueue fails', async () => {
    const [a, b] = await Promise.all([member(), member()]);
    await prisma.favoritePartner.create({ data: { userId: a.id, partnerId: b.id } });
    vi.mocked(notificationQueue.enqueue).mockRejectedValueOnce(new Error('Synthetic queue failure'));
    const response = await request(app).post('/dashboard/invitations').set('x-telegram-init-data', signed(a.telegramId)).send({ partnerId: b.id });
    expect(response.status).toBe(500);
    const sessions = await prisma.callSession.findMany({ where: { userAId: a.id, userBId: b.id } });
    expect(sessions).toHaveLength(1); expect(sessions[0].status).toBe('CANCELLED');
  });
});
