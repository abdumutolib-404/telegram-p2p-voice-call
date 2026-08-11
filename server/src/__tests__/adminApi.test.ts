import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../index';
import { env } from '../config/env';

describe('Admin REST API & Stealth 2FA Exchange', () => {
  let jwtToken: string;

  it('exchanges master password & 2FA token for admin JWT', async () => {
    const res = await request(app)
      .post('/api/admin/login')
      .send({
        token: 'test_admin_token',
        masterPassword: env.MASTER_PASSWORD,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.jwtToken).toBeDefined();

    jwtToken = res.body.jwtToken;
  });

  it('rejects login with invalid master password (401)', async () => {
    const res = await request(app)
      .post('/api/admin/login')
      .send({
        token: 'test_admin_token',
        masterPassword: 'wrong_password',
      });

    expect(res.status).toBe(401);
  });

  it('fetches analytics stats with valid admin JWT', async () => {
    const res = await request(app)
      .get('/api/admin/stats')
      .set('Authorization', `Bearer ${jwtToken}`);

    expect(res.status).toBe(200);
    expect(res.body.totalUsers).toBeDefined();
    expect(res.body.starsRevenue).toBeDefined();
  });

  it('fetches and updates plan configuration limits', async () => {
    const getRes = await request(app)
      .get('/api/admin/plans')
      .set('Authorization', `Bearer ${jwtToken}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.FREE).toBeDefined();

    const putRes = await request(app)
      .put('/api/admin/plans')
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({
        FREE: { maxDuration: 15, dailyLimit: 3, retentionDays: 1, starsPrice: 0 },
      });

    expect(putRes.status).toBe(200);
    expect(putRes.body.success).toBe(true);
  });

  it('returns pending unblock appeals queue', async () => {
    const res = await request(app)
      .get('/api/admin/appeals')
      .set('Authorization', `Bearer ${jwtToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
