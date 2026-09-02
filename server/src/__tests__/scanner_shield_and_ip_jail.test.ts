import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../index';
import { isExploitProbe, isIpJailed } from '../middleware/scannerShield';

describe('Scanner Shield & Exploit Bot Firewall Test Suite', () => {
  describe('1. Exploit Probe Pattern Recognition', () => {
    it('detects sensitive config & environment file probes', () => {
      expect(isExploitProbe('/.env')).toBe(true);
      expect(isExploitProbe('/BACK/.env')).toBe(true);
      expect(isExploitProbe('/backend/.env.local')).toBe(true);
      expect(isExploitProbe('/.git/config')).toBe(true);
      expect(isExploitProbe('/.git/HEAD')).toBe(true);
      expect(isExploitProbe('/.aws/credentials')).toBe(true);
      expect(isExploitProbe('/.docker/config.json')).toBe(true);
      expect(isExploitProbe('/.terraform/terraform.tfstate')).toBe(true);
    });

    it('detects legacy PHP, CGI, and WordPress exploit probes', () => {
      expect(isExploitProbe('/phpinfo.php')).toBe(true);
      expect(isExploitProbe('/test.php')).toBe(true);
      expect(isExploitProbe('/cgi-bin/test.cgi')).toBe(true);
      expect(isExploitProbe('/wp-admin/login.php')).toBe(true);
      expect(isExploitProbe('/wp-json/wp/v2/users')).toBe(true);
      expect(isExploitProbe('/xmlrpc.php')).toBe(true);
    });

    it('detects infrastructure configs, profilers and path traversal probes', () => {
      expect(isExploitProbe('/docker-compose.yml')).toBe(true);
      expect(isExploitProbe('/serverless.yml')).toBe(true);
      expect(isExploitProbe('/_profiler/phpinfo')).toBe(true);
      expect(isExploitProbe('/actuator/health')).toBe(true);
      expect(isExploitProbe('/etc/passwd')).toBe(true);
      expect(isExploitProbe('/app/[...catchAll]')).toBe(true);
    });

    it('allows legitimate application and public endpoints', () => {
      expect(isExploitProbe('/')).toBe(false);
      expect(isExploitProbe('/health')).toBe(false);
      expect(isExploitProbe('/robots.txt')).toBe(false);
      expect(isExploitProbe('/sitemap.xml')).toBe(false);
      expect(isExploitProbe('/api/auth/verify')).toBe(false);
      expect(isExploitProbe('/api/calls/initiate')).toBe(false);
    });
  });

  describe('2. Pre-Routing Exploit Probe Rejection (HTTP 403)', () => {
    it('instantly drops .env probe with HTTP 403 Connection: close', async () => {
      const res = await request(app)
        .get('/BACK/.env')
        .set('cf-connecting-ip', '203.0.113.10');

      expect(res.status).toBe(403);
      expect(res.headers['connection']).toBe('close');
    });

    it('instantly drops phpinfo probe with HTTP 403', async () => {
      const res = await request(app)
        .get('/phpinfo.php')
        .set('cf-connecting-ip', '203.0.113.11');

      expect(res.status).toBe(403);
      expect(res.headers['connection']).toBe('close');
    });

    it('instantly drops .git probe with HTTP 403', async () => {
      const res = await request(app)
        .get('/.git/config')
        .set('cf-connecting-ip', '203.0.113.12');

      expect(res.status).toBe(403);
      expect(res.headers['connection']).toBe('close');
    });
  });

  describe('3. Automated 24-Hour IP Jailing Enforcement', () => {
    it('blocks subsequent legitimate requests from jailed IP', async () => {
      const botIp = '203.0.113.50';

      // 1. Bot probes an exploit path
      const probeRes = await request(app)
        .get('/.env')
        .set('cf-connecting-ip', botIp);
      expect(probeRes.status).toBe(403);

      // 2. IP is now recorded in jail
      const jailed = await isIpJailed(botIp);
      expect(jailed).toBe(true);

      // 3. Subsequent request to /health from same IP is dropped in 0ms with 403
      const subsequentRes = await request(app)
        .get('/health')
        .set('cf-connecting-ip', botIp);
      expect(subsequentRes.status).toBe(403);
      expect(subsequentRes.headers['connection']).toBe('close');
    });

    it('permits unjailed benign client IPs to access /health normally', async () => {
      const cleanIp = '203.0.113.99';
      const res = await request(app)
        .get('/health')
        .set('cf-connecting-ip', cleanIp);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });
  });

  describe('4. Resilient URL Decoding & Anomaly Safety', () => {
    it('safely handles malformed percent-encoded URIs without crashing', async () => {
      const res = await request(app)
        .get('/%99%ZZ%invalid')
        .set('cf-connecting-ip', '203.0.113.80');

      // Returns 400 Bad Request or 403/404, never an unhandled 500
      expect([400, 403, 404]).toContain(res.status);
    });
  });
});
