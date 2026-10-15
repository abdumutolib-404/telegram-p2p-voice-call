import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { gzipSync } from 'node:zlib';
import { beforeEach, expect, it } from 'vitest';
import { requestBodyMiddleware } from '../middleware/requestBody';
import { env } from '../config/env';

const app = express();
app.use(requestBodyMiddleware());
app.use((req, res) => res.json({ bytes: Buffer.isBuffer(req.body) ? req.body.length : JSON.stringify(req.body).length }));
beforeEach(() => { env.ADMIN_TELEGRAM_IDS = ['90101']; });
const token = () => jwt.sign({ role: 'admin', telegramId: '90101' }, env.JWT_SECRET, { expiresIn: '1h' });

it.each(['/api/auth/verify', '/unused', '/api/admin/login'])('bounds anonymous JSON before handlers at %s', async path => {
  expect((await request(app).post(path).send({ value: 'x'.repeat(65536) })).status).toBe(413);
});
it('bounds form input and rejects compressed bodies instead of expanding them', async () => {
  expect((await request(app).post('/unused').type('form').send(`value=${'x'.repeat(65536)}`)).status).toBe(413);
  expect((await request(app).post('/unused').set('Content-Type', 'application/json').set('Content-Encoding', 'gzip').send(gzipSync('{"value":"ok"}'))).status).toBe(415);
});
it('authorizes large admin bodies before reading them and retains 5MiB proof support', async () => {
  const proof = { refundProof: `data:application/pdf;base64,${Buffer.alloc(5 * 1024 * 1024).toString('base64')}` };
  // No payload bytes are sent: authentication must finish without waiting for them.
  expect((await request(app).post('/api/admin/payments/manual/fixture/refund').type('json').set('Content-Length', '7000000')).status).toBe(401);
  const response = await request(app).post('/api/admin/payments/manual/fixture/refund').auth(token(), { type: 'bearer' }).send(proof);
  expect(response.status).toBe(200); expect(response.body.bytes).toBeGreaterThan(5 * 1024 * 1024);
  expect((await request(app).post('/api/admin/ielts/questions/bulk').auth(token(), { type: 'bearer' }).send({ items: ['x'.repeat(70000)] })).status).toBe(200);
});
it('preserves exact raw webhook bytes and ordinary small requests', async () => {
  const raw = ' { "event": "fixture" } ';
  const response = await request(app).post('/api/livekit/webhook').type('application/webhook+json').send(raw);
  expect(response.status).toBe(200); expect(response.body.bytes).toBe(Buffer.byteLength(raw));
  expect((await request(app).post('/api/auth/verify').send({ initData: 'fixture' })).status).toBe(200);
});
