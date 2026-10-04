import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../index';
import { env } from '../config/env';

const original = { nodeEnv: env.NODE_ENV, mini: env.MINI_APP_URL, admin: env.ADMIN_PANEL_URL };
afterEach(() => { env.NODE_ENV = original.nodeEnv; env.MINI_APP_URL = original.mini; env.ADMIN_PANEL_URL = original.admin; });

describe('production HTTP to HTTPS routing', () => {
  it.each(['pairtalk.online', 'app.pairtalk.online', 'admin.pairtalk.online', 'api.pairtalk.online'])('preserves the %s application host', async host => {
    env.NODE_ENV = 'production';
    const response = await request(app).get('/entry?resume=example').set('Host', host).set('X-Forwarded-Proto', 'http');
    expect(response.status).toBe(301);
    expect(response.headers.location).toBe(`https://${host}/entry?resume=example`);
  });
  it('preserves explicitly configured frontend hosts and their HTTPS ports', async () => {
    env.NODE_ENV = 'production'; env.MINI_APP_URL = 'https://practice.example.test:9443/client'; env.ADMIN_PANEL_URL = 'https://operations.example.test/admin';
    for (const [host, authority] of [['practice.example.test', 'practice.example.test:9443'], ['operations.example.test', 'operations.example.test']]) {
      const response = await request(app).get('/client?resume=example').set('Host', host).set('X-Forwarded-Proto', 'http');
      expect(response.status).toBe(301); expect(response.headers.location).toBe(`https://${authority}/client?resume=example`);
    }
  });
  it.each(['www.pairtalk.online', 'untrusted.example', 'admin.untrusted.example'])('canonicalizes %s without reflecting an untrusted authority', async host => {
    env.NODE_ENV = 'production';
    const response = await request(app).get('/client?resume=example').set('Host', host).set('X-Forwarded-Proto', 'http');
    expect(response.status).toBe(301); expect(response.headers.location).toBe('https://pairtalk.online/client?resume=example');
  });
});
