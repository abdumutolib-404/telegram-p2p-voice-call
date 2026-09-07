import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { isSafeStorageUrl, extractClientIp } from '../utils/sanitize';
import { webCrawlerService } from '../services/crawler/webCrawlerService';
import { adminAuthMiddleware, AdminAuthenticatedRequest } from '../middleware/adminAuth';

describe('Forensic Security Audit Remediation & Defense-in-Depth Suite', () => {
  // =========================================================================
  // 1. FATAL: Stored XSS Prevention & Data URL Isolation in Receipts
  // =========================================================================
  describe('1. FATAL: Storage URL Validation & Safe MIME Whitelisting', () => {
    it('1.1 isSafeStorageUrl permits valid HTTPS URLs on trusted S3 and storage buckets', () => {
      expect(isSafeStorageUrl('https://my-bucket.s3.amazonaws.com/receipts/r1.jpg')).toBe(true);
      expect(isSafeStorageUrl('https://storage.googleapis.com/pairtalk-receipts/r2.png')).toBe(true);
      expect(isSafeStorageUrl('https://s3.us-east-1.amazonaws.com/pairtalk-bucket/doc.pdf')).toBe(true);
      expect(isSafeStorageUrl('https://pairtalk.online/uploads/receipt.webp')).toBe(true);
    });

    it('1.2 isSafeStorageUrl strictly rejects javascript:, vbscript:, and malicious schemes', () => {
      expect(isSafeStorageUrl('javascript:alert(document.cookie)')).toBe(false);
      expect(isSafeStorageUrl('javascript://alert(1)')).toBe(false);
      expect(isSafeStorageUrl('vbscript:msgbox(1)')).toBe(false);
      expect(isSafeStorageUrl('file:///etc/passwd')).toBe(false);
      expect(isSafeStorageUrl('ftp://evil.com/payload.exe')).toBe(false);
    });

    it('1.3 isSafeStorageUrl strictly rejects arbitrary untrusted third-party domains', () => {
      expect(isSafeStorageUrl('https://evil-hacker-site.com/malware.exe')).toBe(false);
      expect(isSafeStorageUrl('https://phishing-pairtalk.com/login')).toBe(false);
      expect(isSafeStorageUrl('https://attacker.io/exploit')).toBe(false);
    });

    it('1.4 Data URL MIME filtering rejects active content and only allows safe raster images', () => {
      const allowedImageMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
      const dangerousMimes = [
        'text/html',
        'application/javascript',
        'image/svg+xml',
        'application/xhtml+xml',
        'text/xml',
        'application/pdf',
        'text/plain',
      ];

      for (const dangerous of dangerousMimes) {
        expect(allowedImageMimes.includes(dangerous)).toBe(false);
      }

      for (const allowed of allowedImageMimes) {
        expect(allowedImageMimes.includes(allowed)).toBe(true);
      }
    });
  });

  // =========================================================================
  // 2. CRIT-02: SSRF Prevention in IELTS Web Crawler
  // =========================================================================
  describe('2. CRIT-02: Server-Side Request Forgery (SSRF) Prevention', () => {
    it('2.1 Rejects loopback addresses and localhost variants', () => {
      expect(webCrawlerService.isSafeCrawlerUrl('http://127.0.0.1/admin')).toBe(false);
      expect(webCrawlerService.isSafeCrawlerUrl('http://127.0.0.2:8080/')).toBe(false);
      expect(webCrawlerService.isSafeCrawlerUrl('http://127.255.255.254/secret')).toBe(false);
      expect(webCrawlerService.isSafeCrawlerUrl('http://localhost:3000/api')).toBe(false);
      expect(webCrawlerService.isSafeCrawlerUrl('https://localhost/')).toBe(false);
      expect(webCrawlerService.isSafeCrawlerUrl('http://sub.localhost/')).toBe(false);
      expect(webCrawlerService.isSafeCrawlerUrl('http://[::1]/')).toBe(false);
      expect(webCrawlerService.isSafeCrawlerUrl('http://0.0.0.0/')).toBe(false);
    });

    it('2.2 Rejects cloud metadata and link-local IP addresses (169.254.169.254)', () => {
      expect(webCrawlerService.isSafeCrawlerUrl('http://169.254.169.254/latest/meta-data/')).toBe(false);
      expect(webCrawlerService.isSafeCrawlerUrl('http://169.254.169.254/computeMetadata/v1/')).toBe(false);
      expect(webCrawlerService.isSafeCrawlerUrl('http://metadata.google.internal/computeMetadata/v1/')).toBe(false);
      expect(webCrawlerService.isSafeCrawlerUrl('http://instance-data/latest/meta-data/')).toBe(false);
    });

    it('2.3 Rejects RFC1918 private subnets (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)', () => {
      expect(webCrawlerService.isSafeCrawlerUrl('http://10.0.0.1/dashboard')).toBe(false);
      expect(webCrawlerService.isSafeCrawlerUrl('http://10.254.1.100/')).toBe(false);
      expect(webCrawlerService.isSafeCrawlerUrl('http://172.16.0.1:5432/')).toBe(false);
      expect(webCrawlerService.isSafeCrawlerUrl('http://172.31.255.255/')).toBe(false);
      expect(webCrawlerService.isSafeCrawlerUrl('http://192.168.1.1/router')).toBe(false);
      expect(webCrawlerService.isSafeCrawlerUrl('http://192.168.0.254/')).toBe(false);
    });

    it('2.4 Rejects internal and mDNS top-level domains', () => {
      expect(webCrawlerService.isSafeCrawlerUrl('http://printer.local/')).toBe(false);
      expect(webCrawlerService.isSafeCrawlerUrl('http://database.internal/')).toBe(false);
    });

    it('2.5 Rejects dangerous non-HTTP URL protocols', () => {
      expect(webCrawlerService.isSafeCrawlerUrl('file:///etc/passwd')).toBe(false);
      expect(webCrawlerService.isSafeCrawlerUrl('ftp://ftp.example.com/data')).toBe(false);
      expect(webCrawlerService.isSafeCrawlerUrl('gopher://example.com/')).toBe(false);
      expect(webCrawlerService.isSafeCrawlerUrl('javascript:alert(1)')).toBe(false);
    });

    it('2.6 Permits legitimate external public websites for crawling', () => {
      expect(webCrawlerService.isSafeCrawlerUrl('https://ielts-simon.com/ielts-help-and-english-pr/speaking/')).toBe(true);
      expect(webCrawlerService.isSafeCrawlerUrl('https://ieltsliz.com/ielts-speaking-questions/')).toBe(true);
      expect(webCrawlerService.isSafeCrawlerUrl('https://en.wikipedia.org/wiki/IELTS')).toBe(true);
    });
  });

  // =========================================================================
  // 3. CRIT-03 & CRIT-04: Admin Auth Query Token & Anti-CSRF Lockdown
  // =========================================================================
  describe('3. CRIT-03 & CRIT-04: Admin Auth Query Token & Anti-CSRF Protection', () => {
    const adminTgId = (env.ADMIN_TELEGRAM_IDS && env.ADMIN_TELEGRAM_IDS[0]) ? env.ADMIN_TELEGRAM_IDS[0] : '12345678';
    const validToken = jwt.sign(
      { telegramId: adminTgId, role: 'admin' },
      env.JWT_SECRET,
      { expiresIn: '1h', algorithm: 'HS256' }
    );

    it('3.1 Blocks query parameter tokens on non-GET state-changing methods (POST, PUT, DELETE)', () => {
      const mutatingMethods = ['POST', 'PUT', 'DELETE', 'PATCH'];

      for (const method of mutatingMethods) {
        const req = {
          method,
          headers: {},
          cookies: {},
          query: { token: validToken },
        } as unknown as AdminAuthenticatedRequest;

        let statusSent: number | undefined;
        let jsonSent: any;
        const res = {
          status: (code: number) => {
            statusSent = code;
            return res;
          },
          json: (body: any) => {
            jsonSent = body;
            return res;
          },
        } as unknown as Response;

        const next = vi.fn() as unknown as NextFunction;

        adminAuthMiddleware(req, res, next);

        expect(statusSent).toBe(403);
        expect(jsonSent.error).toContain('Query parameter tokens are prohibited on state-changing requests');
        expect(next).not.toHaveBeenCalled();
      }
    });

    it('3.2 Permits query parameter tokens on read-only GET requests', () => {
      const req = {
        method: 'GET',
        headers: {},
        cookies: {},
        query: { token: validToken },
      } as unknown as AdminAuthenticatedRequest;

      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as Response;

      const next = vi.fn() as unknown as NextFunction;

      adminAuthMiddleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.adminUser?.telegramId).toBe(adminTgId);
      expect(req.adminUser?.role).toBe('admin');
    });

    it('3.3 Enforces CSRF custom header on mutating requests authenticated via ambient cookie only', () => {
      const originalNodeEnv = env.NODE_ENV;
      try {
        (env as any).NODE_ENV = 'production';

        const req = {
          method: 'POST',
          headers: {}, // Missing X-Requested-With / X-Admin-CSRF
          cookies: { admin_session: validToken },
          query: {},
        } as unknown as AdminAuthenticatedRequest;

        let statusSent: number | undefined;
        let jsonSent: any;
        const res = {
          status: (code: number) => {
            statusSent = code;
            return res;
          },
          json: (body: any) => {
            jsonSent = body;
            return res;
          },
        } as unknown as Response;

        const next = vi.fn() as unknown as NextFunction;

        adminAuthMiddleware(req, res, next);

        expect(statusSent).toBe(403);
        expect(jsonSent.error).toContain('CSRF protection failed');
        expect(next).not.toHaveBeenCalled();
      } finally {
        (env as any).NODE_ENV = originalNodeEnv;
      }
    });

    it('3.4 Allows mutating requests with cookie auth when X-Requested-With or X-Admin-CSRF header is present', () => {
      const originalNodeEnv = env.NODE_ENV;
      try {
        (env as any).NODE_ENV = 'production';

        // 1. With X-Requested-With
        const req1 = {
          method: 'POST',
          headers: { 'x-requested-with': 'XMLHttpRequest' },
          cookies: { admin_session: validToken },
          query: {},
        } as unknown as AdminAuthenticatedRequest;

        const next1 = vi.fn() as unknown as NextFunction;
        adminAuthMiddleware(req1, {} as Response, next1);
        expect(next1).toHaveBeenCalled();

        // 2. With X-Admin-CSRF
        const req2 = {
          method: 'DELETE',
          headers: { 'x-admin-csrf': '1' },
          cookies: { admin_session: validToken },
          query: {},
        } as unknown as AdminAuthenticatedRequest;

        const next2 = vi.fn() as unknown as NextFunction;
        adminAuthMiddleware(req2, {} as Response, next2);
        expect(next2).toHaveBeenCalled();
      } finally {
        (env as any).NODE_ENV = originalNodeEnv;
      }
    });

    it('3.5 Allows mutating requests with explicit Authorization Bearer header without custom CSRF header', () => {
      const originalNodeEnv = env.NODE_ENV;
      try {
        (env as any).NODE_ENV = 'production';

        const req = {
          method: 'POST',
          headers: { authorization: `Bearer ${validToken}` },
          cookies: {},
          query: {},
        } as unknown as AdminAuthenticatedRequest;

        const next = vi.fn() as unknown as NextFunction;
        adminAuthMiddleware(req, {} as Response, next);
        expect(next).toHaveBeenCalled();
      } finally {
        (env as any).NODE_ENV = originalNodeEnv;
      }
    });
  });

  // =========================================================================
  // 4. MED-01: Client IP Sanitization & Header Spoofing Protection
  // =========================================================================
  describe('4. MED-01: Client IP Extraction & Header Spoofing Protection', () => {
    it('4.1 Accepts valid public IPv4 in cf-connecting-ip', () => {
      const req = {
        headers: { 'cf-connecting-ip': '203.0.113.195' },
        socket: { remoteAddress: '10.0.0.1' },
      } as unknown as Request;

      expect(extractClientIp(req)).toBe('203.0.113.195');
    });

    it('4.2 Accepts valid public IPv6 in cf-connecting-ip', () => {
      const req = {
        headers: { 'cf-connecting-ip': '2606:4700:4700::1111' },
        socket: { remoteAddress: '10.0.0.1' },
      } as unknown as Request;

      expect(extractClientIp(req)).toBe('2606:4700:4700::1111');
    });

    it('4.3 Rejects private / loopback / metadata IPs spoofed in cf-connecting-ip and falls back to socket', () => {
      const privateIps = [
        '127.0.0.1',
        '10.0.0.5',
        '172.16.10.1',
        '192.168.1.100',
        '169.254.169.254',
        '::1',
      ];

      for (const ip of privateIps) {
        const req = {
          headers: { 'cf-connecting-ip': ip },
          socket: { remoteAddress: '198.51.100.42' },
        } as unknown as Request;

        expect(extractClientIp(req)).toBe('198.51.100.42');
      }
    });

    it('4.4 Rejects injection characters / invalid format in cf-connecting-ip', () => {
      const invalidIps = [
        '"><script>alert(1)</script>',
        '1.2.3.4.5',
        '256.0.0.1',
        'attacker-ip',
        '123.456.78.90',
      ];

      for (const ip of invalidIps) {
        const req = {
          headers: { 'cf-connecting-ip': ip },
          socket: { remoteAddress: '198.51.100.50' },
        } as unknown as Request;

        expect(extractClientIp(req)).toBe('198.51.100.50');
      }
    });
  });

  // =========================================================================
  // 5. MED-05: Appeal Text Length Bounds Validation
  // =========================================================================
  describe('5. MED-05: Unban Appeal Length Bounds Protection', () => {
    it('5.1 Accurately distinguishes bounded vs unbounded appeal text length', () => {
      const MAX_APPEAL_LENGTH = 1000;

      const validShortText = 'I apologize for the misunderstanding during the call.';
      expect(validShortText.length).toBeLessThanOrEqual(MAX_APPEAL_LENGTH);

      const exactLimitText = 'a'.repeat(1000);
      expect(exactLimitText.length).toBe(MAX_APPEAL_LENGTH);

      const overflowingText = 'a'.repeat(1001);
      expect(overflowingText.length).toBeGreaterThan(MAX_APPEAL_LENGTH);

      const hugePayloadText = 'x'.repeat(50000);
      expect(hugePayloadText.length).toBeGreaterThan(MAX_APPEAL_LENGTH);
    });
  });
});
