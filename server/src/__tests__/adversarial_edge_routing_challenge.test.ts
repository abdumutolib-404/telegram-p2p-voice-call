import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../index';
import fs from 'node:fs';
import path from 'node:path';
// These integration-level route tests can run before frontend builds on a fresh checkout.
// Dedicated frontendRouting tests always use all three built-shell fixtures.
const privateFrontendStatus = (name: 'client' | 'admin') => [
  path.resolve(__dirname, '../../public', name, 'index.html'),
  path.resolve(__dirname, '../../../', name, 'dist/index.html'),
].some(file => fs.existsSync(file)) ? 200 : 503;

describe('Adversarial Stress Test: Server Edge Routing, Robots, Sitemap & Pre-Rendered SEO', () => {
  describe('A. Edge Routing & Subdomain Boundary Stress Cases', () => {
    it('loads the non-indexable Mini App shell for uppercase and mixed-case app subdomains (APP.PAIRTALK.ONLINE)', async () => {
      const res = await request(app)
        .get('/dashboard')
        .set('Host', 'APP.PAIRTALK.ONLINE');

      expect(res.status).toBe(privateFrontendStatus('client'));
      expect(res.headers.location).toBeUndefined();
      expect(res.headers['x-robots-tag']).toBe('noindex, nofollow');
    });

    it('loads the non-indexable Mini App shell for app subdomain when custom ports are specified (app.pairtalk.online:8443)', async () => {
      const res = await request(app)
        .get('/practice')
        .set('Host', 'app.pairtalk.online:8443');

      expect(res.status).toBe(privateFrontendStatus('client'));
      expect(res.headers.location).toBeUndefined();
      expect(res.headers['x-robots-tag']).toBe('noindex, nofollow');
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

      expect(res.status).toBe(privateFrontendStatus('client'));
      expect(res.headers.location).toBeUndefined();
      expect(res.headers['x-robots-tag']).toBe('noindex, nofollow');
    });

    it('bypasses redirect on app.pairtalk.online when session_token cookie is present', async () => {
      const res = await request(app)
        .get('/')
        .set('Host', 'app.pairtalk.online')
        .set('Cookie', 'session_token=valid-jwt-token-12345');

      expect(res.status).toBe(privateFrontendStatus('client'));
      expect(res.headers['content-type']).toMatch(/text\/html/);
    });

    it('bypasses redirect on app.pairtalk.online when admin_session cookie is present', async () => {
      const res = await request(app)
        .get('/')
        .set('Host', 'app.pairtalk.online')
        .set('Cookie', 'admin_session=valid-admin-session-xyz');

      expect(res.status).toBe(privateFrontendStatus('client'));
      expect(res.headers['content-type']).toMatch(/text\/html/);
    });

    it('bypasses redirect on app.pairtalk.online when Authorization header is present', async () => {
      const res = await request(app)
        .get('/')
        .set('Host', 'app.pairtalk.online')
        .set('Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');

      expect(res.status).toBe(privateFrontendStatus('client'));
      expect(res.headers['content-type']).toMatch(/text\/html/);
    });

    it('bypasses redirect for tgWebAppStartParam query parameter', async () => {
      const res = await request(app)
        .get('/?tgWebAppStartParam=ref_friend_12345')
        .set('Host', 'app.pairtalk.online');

      expect(res.status).toBe(privateFrontendStatus('client'));
      expect(res.headers['content-type']).toMatch(/text\/html/);
    });

    it('bypasses redirect for tgWebAppPlatform & tgWebAppVersion query parameters', async () => {
      const res = await request(app)
        .get('/?tgWebAppPlatform=ios&tgWebAppVersion=7.10')
        .set('Host', 'app.pairtalk.online');

      expect(res.status).toBe(privateFrontendStatus('client'));
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

        expect(res.status).toBe(privateFrontendStatus('client'));
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

        expect(res.status).toBe(privateFrontendStatus('client'));
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

        expect(res.status).toBe(privateFrontendStatus('admin'));
        expect(res.headers['x-robots-tag']).toBe('noindex, nofollow');
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

  describe('D. Public fallback SEO integrity', () => {
    it('parses structured entities and verifies their canonical identities', async () => {
      const html = (await request(app).get('/')).text;
      const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
      expect(match).not.toBeNull();
      const schema = JSON.parse(match![1]);
      expect(schema['@context']).toBe('https://schema.org');
      expect(schema['@graph']).toHaveLength(3);
      for (const entity of schema['@graph']) {
        expect(entity.name).toBe('PairTalk');
        expect(entity.url).toBe('https://pairtalk.online/');
        expect(entity['@id']).toMatch(/^https:\/\/pairtalk\.online\/#/);
        expect(entity.aggregateRating).toBeUndefined();
        expect(entity.review).toBeUndefined();
      }
    });

    it('keeps the public fallback readable without JavaScript or invalid social assets', async () => {
      const html = (await request(app).get('/')).text;
      expect(html).toContain('<html lang="en">');
      expect(html).toContain('<main>');
      expect(html).toContain('name="viewport" content="width=device-width, initial-scale=1"');
      expect(html).not.toContain('/src/main.tsx');
      expect(html).not.toContain('plans_pricing.jpg');
      expect(html).not.toContain('Partner ghosted you again?');
      expect(html).not.toContain('guarantee');
    });
  });
});
