import crypto from 'node:crypto';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { env } from '../config/env';
import { prisma } from '../config/database';
import { getPlansConfig, updatePlansConfig } from '../services/plan';
import publicPricing from '../routes/publicPricing';
import adminRoutes from '../routes/admin';
import { isPublicPricing, matchesNeeds, pricePerIncludedCall, recommendPlan, publicPlan, type PublicPricing } from '../contracts/pricing';
import { renderPlansOverview } from '../bot/handlers/payments';
import type { MyContext } from '../bot/types';

const app = express(); app.use(express.json()); app.use('/api/public', publicPricing); app.use('/api/admin', adminRoutes);
const original = structuredClone(getPlansConfig());
beforeEach(async () => { updatePlansConfig(original); await prisma.auditLog.deleteMany({ where: { action: 'GLOBAL_PLANS_UPDATE' } }); });
afterEach(async () => { updatePlansConfig(original); await prisma.auditLog.deleteMany({ where: { action: 'GLOBAL_PLANS_UPDATE' } }); vi.restoreAllMocks(); });
it('exposes only validated public allowances and exact quoted currencies', async () => {
  const response = await request(app).get('/api/public/plans');
  expect(response.status).toBe(200); expect(response.headers['cache-control']).toBe('no-store');
  expect(isPublicPricing(response.body)).toBe(true);
  expect(response.body.plans.find(plan => plan.id === 'PLUS')).toMatchObject({ calls: 10, maxCallMinutes: 30, recordings: 3, retentionDays: 7, validityDays: 30, prices: { XTR: 79, UZS: 15000 } });
  expect(response.body.plans[0]).toMatchObject({ period: 'calendar_month', validityDays: 0 });
  expect(JSON.stringify(response.body)).not.toMatch(/BOT_TOKEN|adminId|beforeState|afterState|JWT_SECRET|telegramId/);
});
it('publishes an authenticated admin edit to public prices and the bot without a rebuild', async () => {
  const adminId = env.ADMIN_TELEGRAM_IDS[0]; expect(adminId).toBeTruthy();
  const token = jwt.sign({ role: 'admin', telegramId: adminId }, env.JWT_SECRET, { expiresIn: '5m' });
  const before = await request(app).get('/api/public/plans');
  const saved = await request(app).put('/api/admin/plans').set('Authorization', `Bearer ${token}`).send({ PLUS: { starsPrice: 123, uzsPrice: 24000, dailyLimit: 14, maxDuration: 35, recordingLimit: 4, retentionDays: 12, subscriptionDurationDays: 45 }, PRO: { active: false } });
  expect(saved.status).toBe(200);
  const after = await request(app).get('/api/public/plans');
  expect(after.body.revision).not.toBe(before.body.revision);
  expect(after.body.plans.some(plan => plan.id === 'PRO')).toBe(false);
  expect(after.body.plans.find(plan => plan.id === 'PLUS')).toMatchObject({ calls: 14, maxCallMinutes: 35, recordings: 4, retentionDays: 12, validityDays: 45, prices: { XTR: 123, UZS: 24000 } });
  const reply = vi.fn().mockResolvedValue(true);
  await renderPlansOverview({ from: { id: 0 }, session: { step: 'idle' }, reply } as unknown as MyContext);
  const text = reply.mock.calls[0][0];
  expect(text).toContain('123 Stars'); expect(text).toContain('24,000 UZS'); expect(text).toContain('45-day period'); expect(text).toContain('Minutes per call: 35'); expect(text).not.toContain('<b>Pro</b>');
  expect((await prisma.auditLog.findFirst({ where: { action: 'GLOBAL_PLANS_UPDATE' } }))?.adminId).toBe(adminId);
});
it('keeps publishing private and rejects a public mutation attempt', async () => {
  expect((await request(app).put('/api/admin/plans').send({ PLUS: { starsPrice: 1 } })).status).toBe(401);
  expect((await request(app).put('/api/public/plans').send({ PLUS: { starsPrice: 1 } })).status).toBe(404);
});
it('fails closed when persisted plans cannot be read', async () => {
  vi.spyOn(prisma.auditLog, 'findFirst').mockRejectedValueOnce(new Error('Synthetic database failure'));
  const response = await request(app).get('/api/public/plans'); expect(response.status).toBe(503); expect(response.body.plans).toBeUndefined();
});
it('compares complete needs and independently quoted currencies without inventing a per-unit price', () => {
  const plus = publicPlan('PLUS', original.PLUS), pro = publicPlan('PRO', { ...original.PRO, starsPrice: 70, uzsPrice: 99000 });
  const needs = { calls: 10, minutes: 20, recordings: 0, retentionDays: 90 };
  expect(recommendPlan([plus, pro], needs, 'XTR')?.id).toBe('PRO'); expect(recommendPlan([plus, pro], needs, 'UZS')?.id).toBe('PLUS');
  expect(matchesNeeds(plus, { ...needs, recordings: 1 })).toBe(false);
  expect(pricePerIncludedCall(plus, 'XTR')).toBe(7.9);
  expect(pricePerIncludedCall({ ...plus, calls: 0 }, 'XTR')).toBeNull();
  expect(pricePerIncludedCall({ ...plus, unlimitedCalls: true }, 'XTR')).toBeNull();
  const catalog: PublicPricing = { version: 1, revision: crypto.randomBytes(32).toString('hex'), checkedAt: new Date().toISOString(), botUsername: 'PairTalkBot', plans: [plus] };
  expect(isPublicPricing(catalog)).toBe(true);
  for (const malformed of [{ ...catalog, plans: [plus, plus] }, { ...catalog, plans: [{ ...plus, prices: { XTR: -1, UZS: 0 } }] }, { ...catalog, botUsername: 'bad/link' }, { ...catalog, checkedAt: [catalog.checkedAt] }]) expect(isPublicPricing(malformed)).toBe(false);
});
