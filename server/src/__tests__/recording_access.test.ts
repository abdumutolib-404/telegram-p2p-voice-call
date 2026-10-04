import { beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import request from 'supertest';

const fixture = vi.hoisted(() => ({
  findUnique: vi.fn(),
  configured: vi.fn(),
  exists: vi.fn(),
  presign: vi.fn(),
  entitlement: vi.fn(),
  env: {
    NODE_ENV: 'production', BOT_TOKEN: '123456789:synthetic-recording-auth',
    RECORDINGS_DIR: 'synthetic-recording-access',
  },
}));
vi.mock('../config/env', () => ({ env: fixture.env }));
vi.mock('../config/database', () => ({ prisma: { callSession: { findUnique: fixture.findUnique } } }));
vi.mock('../utils/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));
vi.mock('../config/livekit', () => ({ generateLiveKitToken: vi.fn() }));
vi.mock('../services/plan', () => ({
  getEffectiveEntitlement: fixture.entitlement, calculateEffectiveCallDuration: vi.fn(),
}));
vi.mock('../services/s3Storage', () => ({
  isS3Configured: fixture.configured,
  checkS3ObjectExists: fixture.exists,
  generatePresignedDownloadUrl: fixture.presign,
}));

import callsRouter from '../routes/calls';

const app = express();
app.use('/api/calls', callsRouter);
const aliases = ['/api/calls/recording/private-call', '/api/calls/private-call/recording'];
const deliveryModes = [
  { name: 'JSON', query: '?format=json', accept: 'application/json', cloud: true },
  { name: 'redirect', query: '', accept: 'audio/mpeg', cloud: true },
  { name: 'local file', query: '', accept: 'audio/mpeg', cloud: false },
];
let session: {
  id: string; recordingUrl: string | null; recordingExpiresAt: Date | null; createdAt: Date;
  recordedByUserId: string | null;
  userA: { id: string; telegramId: bigint }; userB: { id: string; telegramId: bigint };
};

function signedInitData(id: number, token = fixture.env.BOT_TOKEN, ageSeconds = 0): string {
  const params = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000) - ageSeconds),
    user: JSON.stringify({ id, first_name: 'Synthetic user' }),
  });
  params.sort();
  const secret = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
  const check = [...params.entries()].map(([key, value]) => `${key}=${value}`).join('\n');
  params.set('hash', crypto.createHmac('sha256', secret).update(check).digest('hex'));
  return params.toString();
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
  session = {
    id: 'private-call', recordingUrl: 'recordings/private.mp3',
    recordingExpiresAt: new Date(Date.now() + 86400000), createdAt: new Date(),
    recordedByUserId: 'qa-owner',
    userA: { id: 'qa-owner', telegramId: 1001n }, userB: { id: 'qa-peer', telegramId: 1002n },
  };
  fixture.findUnique.mockImplementation(async () => session);
  fixture.configured.mockReturnValue(true);
  fixture.exists.mockResolvedValue({ exists: true, size: 512, contentType: 'audio/mpeg' });
  fixture.presign.mockResolvedValue('https://synthetic.invalid/private.mp3');
  fixture.entitlement.mockReturnValue({ retentionDays: 30 });
});

describe.each(aliases)('signed recording access through %s', alias => {
  it.each(deliveryModes)('denies the non-recorder before storage access for $name', async mode => {
    fixture.configured.mockReturnValue(mode.cloud);
    const localLookup = vi.spyOn(fs, 'existsSync');
    const localStream = vi.spyOn(express.response, 'sendFile');
    const response = await request(app).get(alias + mode.query).set('Accept', mode.accept)
      .set('x-telegram-init-data', signedInitData(1002));

    expect(response.status).toBe(403);
    expect(response.body.url).toBeUndefined();
    expect(response.headers.location).toBeUndefined();
    expect(fixture.configured).not.toHaveBeenCalled();
    expect(fixture.exists).not.toHaveBeenCalled();
    expect(fixture.presign).not.toHaveBeenCalled();
    expect(fixture.entitlement).not.toHaveBeenCalled();
    expect(localLookup).not.toHaveBeenCalled();
    expect(localStream).not.toHaveBeenCalled();
  });

  it.each(deliveryModes.filter(mode => mode.cloud))('delivers to the signed recorder as $name', async mode => {
    const response = await request(app).get(alias + mode.query).set('Accept', mode.accept)
      .set('x-telegram-init-data', signedInitData(1001));
    expect(response.status).toBe(mode.name === 'JSON' ? 200 : 302);
    expect(mode.name === 'JSON' ? response.body.url : response.headers.location)
      .toBe('https://synthetic.invalid/private.mp3');
    expect(fixture.presign).toHaveBeenCalledWith('recordings/private.mp3', 3600);
  });

  it.each(['BOTH', 'ALL', 'qa-owner,qa-peer', ' qa-owner, qa-peer , ', null, ''])
    ('preserves participant access for marker %s', async marker => {
      session.recordedByUserId = marker;
      const response = await request(app).get(alias + '?format=json')
        .set('x-telegram-init-data', signedInitData(1002));
      expect(response.status).toBe(200);
      expect(response.body.url).toBe('https://synthetic.invalid/private.mp3');
    });

  it.each(['qa-peer-extra', 'extra-qa-peer', 'qa-owner,qa-peer-extra', 'both'])
    ('denies markers without an exact authorized identity: %s', async marker => {
      session.recordedByUserId = marker;
      expect((await request(app).get(alias + '?format=json')
        .set('x-telegram-init-data', signedInitData(1002))).status).toBe(403);
      expect(fixture.exists).not.toHaveBeenCalled();
      expect(fixture.presign).not.toHaveBeenCalled();
    });

  it.each(['BOTH', 'ALL', 'qa-outsider', null])('denies signed outsiders even with marker %s', async marker => {
    session.recordedByUserId = marker;
    expect((await request(app).get(alias + '?format=json')
      .set('x-telegram-init-data', signedInitData(1003))).status).toBe(403);
    expect(fixture.configured).not.toHaveBeenCalled();
  });

  it.each(['missing', 'forged', 'expired'])('rejects %s authentication before querying the session', async kind => {
    const query = request(app).get(alias + '?format=json');
    if (kind !== 'missing') query.set('x-telegram-init-data', kind === 'forged'
      ? signedInitData(1001, 'wrong-synthetic-token') : signedInitData(1001, fixture.env.BOT_TOKEN, 86401));
    expect((await query).status).toBe(403);
    expect(fixture.findUnique).not.toHaveBeenCalled();
    expect(fixture.configured).not.toHaveBeenCalled();
  });

  it('still enforces individual plan retention for an authorized recorder', async () => {
    session.createdAt = new Date(Date.now() - 2 * 86400000);
    fixture.entitlement.mockReturnValue({ retentionDays: 1 });
    expect((await request(app).get(alias + '?format=json')
      .set('x-telegram-init-data', signedInitData(1001))).status).toBe(403);
    expect(fixture.configured).not.toHaveBeenCalled();
  });

  it('still rejects expired recordings before storage access', async () => {
    session.recordingExpiresAt = new Date(0);
    expect((await request(app).get(alias + '?format=json')
      .set('x-telegram-init-data', signedInitData(1001))).status).toBe(404);
    expect(fixture.configured).not.toHaveBeenCalled();
  });
});

it('streams an authorized local recording without exposing a cloud URL', async () => {
  fixture.configured.mockReturnValue(false);
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'pairtalk-recording-access-'));
  const filename = path.join(temporary, 'delivered.mp3');
  const bytes = Buffer.from('synthetic recording bytes');
  fs.writeFileSync(filename, bytes);
  // Substitute only the sendFile target, retaining Express's real streaming path.
  // No files are created or deleted in the configured recording directory.
  const original = express.response.sendFile;
  vi.spyOn(fs, 'existsSync').mockReturnValue(true);
  vi.spyOn(express.response, 'sendFile').mockImplementation(function (_path, callback) {
    return original.call(this, filename, callback);
  });
  try {
    const response = await request(app).get(aliases[0])
      .set('x-telegram-init-data', signedInitData(1001));
    expect(response.status).toBe(200);
    expect(response.body).toEqual(bytes);
    expect(fixture.presign).not.toHaveBeenCalled();
  } finally {
    vi.restoreAllMocks();
    fs.unlinkSync(filename);
    fs.rmdirSync(temporary);
  }
});
