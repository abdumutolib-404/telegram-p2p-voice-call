import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../index';

describe('Adversarial Stress Test: Server Edge Routing, Robots, Sitemap & Pre-Rendered SEO', () => {
  describe('A. Edge Routing & Subdomain Boundary Stress Cases', () => {
    it('redirects uppercase and mixed-case app subdomains (APP.PAIRTALK.ONLINE)', async () => {
      const res = await request(app)
        .get('/dashboard')
        .set('Host', 'APP.PAIRTALK.ONLINE');

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('https://pairtalk.online');
    });

    it('redirects app subdomain when custom ports are specified (app.pairtalk.online:8443)', async () => {
      const res = await request(app)
        .get('/practice')
        .set('Host', 'app.pairtalk.online:8443');

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('https://pairtalk.online');
    });

    it('redirects api subdomain with port (api.pairtalk.online:3000) on non-api routes', async () => {
      const res = await request(app)
        .get('/docs')
        .set('Host', 'api.pairtalk.online:3000');

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('https://pairtalk.online');
    });

    it('handles X-Forwarded-Host with port and casing differences', async () => {
      const res = await request(app)
        .get('/')
        .set('X-Forwarded-Host', 'App.PairTalk.Online:443');

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('https://pairtalk.online');
    });

    it('bypasses redirect on app.pairtalk.online when session_token cookie is present', async () => {
      const res = await request(app)
        .get('/')
        .set('Host', 'app.pairtalk.online')
        .set('Cookie', 'session_token=valid-jwt-token-12345');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/html/);
    });

    it('bypasses redirect on app.pairtalk.online when admin_session cookie is present', async () => {
      const res = await request(app)
        .get('/')
        .set('Host', 'app.pairtalk.online')
        .set('Cookie', 'admin_session=valid-admin-session-xyz');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/html/);
    });

    it('bypasses redirect on app.pairtalk.online when Authorization header is present', async () => {
      const res = await request(app)
        .get('/')
        .set('Host', 'app.pairtalk.online')
        .set('Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/html/);
    });

    it('bypasses redirect for tgWebAppStartParam query parameter', async () => {
      const res = await request(app)
        .get('/?tgWebAppStartParam=ref_friend_12345')
        .set('Host', 'app.pairtalk.online');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/html/);
    });

    it('bypasses redirect for tgWebAppPlatform & tgWebAppVersion query parameters', async () => {
      const res = await request(app)
        .get('/?tgWebAppPlatform=ios&tgWebAppVersion=7.10')
        .set('Host', 'app.pairtalk.online');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/html/);
    });

    it('bypasses redirect for Telegram Android / Desktop User-Agent signatures', async () => {
      const uas = [
        'Mozilla/5.0 (Linux; Android 13; SM-S908B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36 Telegram-Android/9.6.1 (Samsung SM-S908B; Android 13; SDK 33)',
        'TelegramDesktop/4.8.4',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Telegram/4.15.0 Safari/537.36',
      ];

      for (const ua of uas) {
        const res = await request(app)
          .get('/')
          .set('Host', 'app.pairtalk.online')
          .set('User-Agent', ua);

        expect(res.status).toBe(200);
      }
    });

    it('bypasses redirect for multiple Telegram web referrers (webk, webz, web)', async () => {
      const referers = [
        'https://webk.telegram.org/',
        'https://webz.telegram.org/#@PairTalkBot',
        'https://web.telegram.org/k/',
      ];

      for (const ref of referers) {
        const res = await request(app)
          .get('/')
          .set('Host', 'app.pairtalk.online')
          .set('Referer', ref);

        expect(res.status).toBe(200);
      }
    });

    it('never redirects admin subdomains regardless of headers or cookies', async () => {
      const hosts = [
        'admin.pairtalk.online',
        'admin.pairtalk.online:8080',
        'admin.staging.pairtalk.online',
      ];

      for (const host of hosts) {
        const res = await request(app)
          .get('/')
          .set('Host', host);

        expect(res.status).toBe(200);
      }
    });

    it('never redirects /health, /robots.txt, or /sitemap.xml even on api.pairtalk.online', async () => {
      const healthRes = await request(app).get('/health').set('Host', 'api.pairtalk.online');
      expect(healthRes.status).toBe(200);

      const robotsRes = await request(app).get('/robots.txt').set('Host', 'api.pairtalk.online');
      expect(robotsRes.status).toBe(200);

      const sitemapRes = await request(app).get('/sitemap.xml').set('Host', 'api.pairtalk.online');
      expect(sitemapRes.status).toBe(200);
    });
  });

  describe('B. Robots.txt Grammar, Bot Matrix & Shielding Stress Tests', () => {
    it('verifies all 13 allowed search/AI bots and 13 blocked scrapers in /robots.txt', async () => {
      const res = await request(app).get('/robots.txt');
      expect(res.status).toBe(200);
      const text = res.text;

      const expectedAllowed = [
        'Googlebot', 'Google-Extended', 'Bingbot', 'ClaudeBot', 'anthropic-ai',
        'GPTBot', 'ChatGPT-User', 'PerplexityBot', 'Applebot', 'facebookexternalhit',
        'FacebookBot', 'Twitterbot', 'TelegramBot',
      ];
      for (const bot of expectedAllowed) {
        expect(text).toContain(`User-agent: ${bot}`);
      }

      const expectedBlocked = [
        'Bytespider', 'TikTokSpider', 'CCBot', 'Baiduspider', 'PetalBot',
        'YandexBot', 'MJ12bot', 'AhrefsBot', 'SemrushBot', 'DotBot',
        'DataForSeoBot', 'Scrapy', 'Sogou',
      ];
      for (const scraper of expectedBlocked) {
        expect(text).toContain(`User-agent: ${scraper}`);
      }

      // Check structural directives
      expect(text).toContain('Disallow: /api/');
      expect(text).toContain('Disallow: /admin');
      expect(text).toContain('Sitemap: https://pairtalk.online/sitemap.xml');
    });
  });

  describe('C. Dynamic XML Sitemap Grammar & Schema Stress Tests', () => {
    it('produces syntactically valid XML conforming to sitemap schema', async () => {
      const res = await request(app).get('/sitemap.xml');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/application\/xml/);

      const xml = res.text;

      // Validate well-formed tags and root enclosure
      expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
      expect(xml).toContain('<urlset');
      expect(xml).toContain('</urlset>');

      // Count exact <url> entries (must be exactly 3)
      const urlMatches = xml.match(/<url>/g);
      expect(urlMatches?.length).toBe(3);

      const locMatches = xml.match(/<loc>(.*?)<\/loc>/g);
      expect(locMatches).toEqual([
        '<loc>https://pairtalk.online/</loc>',
        '<loc>https://pairtalk.online/#guidelines</loc>',
        '<loc>https://pairtalk.online/#privacy</loc>',
      ]);

      // Validate lastmod format YYYY-MM-DD
      const lastmodMatches = xml.match(/<lastmod>(\d{4}-\d{2}-\d{2})<\/lastmod>/g);
      expect(lastmodMatches?.length).toBe(3);

      const today = new Date().toISOString().split('T')[0];
      for (const lm of lastmodMatches!) {
        expect(lm).toBe(`<lastmod>${today}</lastmod>`);
      }

      // Validate priorities
      expect(xml).toContain('<priority>1.0</priority>');
      expect(xml).toContain('<priority>0.8</priority>');
      expect(xml).toContain('<priority>0.7</priority>');

      // Validate changefreqs
      expect(xml).toContain('<changefreq>daily</changefreq>');
      expect(xml).toContain('<changefreq>weekly</changefreq>');
      expect(xml).toContain('<changefreq>monthly</changefreq>');
    });
  });

  describe('D. Pre-Rendered SEO HTML & Schema.org JSON-LD Syntactic Integrity', () => {
    it('extracts and validates Schema.org JSON-LD payload with JSON.parse()', async () => {
      const res = await request(app).get('/');
      expect(res.status).toBe(200);
      const html = res.text;

      const scriptMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
      expect(scriptMatch).not.toBeNull();
      const rawJson = scriptMatch![1].trim();

      // Syntactic parsing stress test
      let parsedSchema: any;
      expect(() => {
        parsedSchema = JSON.parse(rawJson);
      }).not.toThrow();

      expect(parsedSchema['@context']).toBe('https://schema.org');
      expect(Array.isArray(parsedSchema['@graph'])).toBe(true);
      expect(parsedSchema['@graph'].length).toBe(3);

      // Verify SoftwareApplication Entity
      const softApp = parsedSchema['@graph'].find((item: any) =>
        Array.isArray(item['@type']) && item['@type'].includes('SoftwareApplication')
      );
      expect(softApp).toBeDefined();
      expect(softApp.name).toBe('PairTalk');
      expect(softApp.offers.length).toBe(4);
      expect(softApp.offers.map((o: any) => o.name)).toEqual(['FREE Tier', 'PLUS Plan', 'PRO Plan', 'BOSS Plan']);

      // Verify EducationalOrganization Entity
      const eduOrg = parsedSchema['@graph'].find((item: any) =>
        item['@type'] === 'EducationalOrganization'
      );
      expect(eduOrg).toBeDefined();
      expect(eduOrg.name).toBe('PairTalk IELTS Speaking Network');
      expect(eduOrg.contactPoint.url).toBe('https://t.me/PairTalkSupport');
      expect(eduOrg.knowsAbout).toContain('IELTS Speaking Exam 2026');

      // Verify FAQPage Entity with full Q&A matrix
      const faqPage = parsedSchema['@graph'].find((item: any) =>
        item['@type'] === 'FAQPage'
      );
      expect(faqPage).toBeDefined();
      expect(Array.isArray(faqPage.mainEntity)).toBe(true);
      expect(faqPage.mainEntity.length).toBe(10);

      // Ensure every question has acceptedAnswer with valid non-empty text
      for (const qa of faqPage.mainEntity) {
        expect(qa['@type']).toBe('Question');
        expect(typeof qa.name).toBe('string');
        expect(qa.name.length).toBeGreaterThan(10);
        expect(qa.acceptedAnswer['@type']).toBe('Answer');
        expect(typeof qa.acceptedAnswer.text).toBe('string');
        expect(qa.acceptedAnswer.text.length).toBeGreaterThan(20);
      }
    });

    it('verifies OpenGraph, Twitter Cards, and Google Trends power keywords', async () => {
      const res = await request(app).get('/');
      const html = res.text;

      // High-CTR copy check
      expect(html).toContain('Partner ghosted you again? No more excuses.');
      expect(html).toContain('Stop waiting for your study buddy to reply. Get matched with a live IELTS partner in < 3 seconds.');
      expect(html).toContain('https://pairtalk.online/plans_pricing.jpg');
      expect(html).toContain('name="twitter:card" content="summary_large_image"');

      // Canonical link check
      expect(html).toContain('<link rel="canonical" href="https://pairtalk.online/" />');

      // Power keywords
      const keywords = [
        'ielts speaking 2026',
        'ielts speaking band descriptors',
        'ielts speaking part 1',
        'ielts speaking part 2',
        'ielts speaking part 3',
        'ielts pronunciation practice',
        'ielts price',
        'ielts 6.5 speaking',
        'ielts band 7 speaking',
      ];
      for (const kw of keywords) {
        expect(html).toContain(kw);
      }
    });
  });
});
