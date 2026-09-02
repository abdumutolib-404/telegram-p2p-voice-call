import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../index';

describe('Server Edge Routing, Robots.txt, Dynamic Sitemap & SEO Pre-Rendering', () => {
  describe('1. Robots.txt Crawler & Scraper Policy (/robots.txt)', () => {
    it('serves robots.txt with 200 OK and text/plain content type', async () => {
      const res = await request(app).get('/robots.txt');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/plain/);
      expect(res.headers['cache-control']).toContain('public, max-age=86400');
    });

    it('allows major search engines and AI crawlers', async () => {
      const res = await request(app).get('/robots.txt');
      const text = res.text;

      // AI Crawlers
      expect(text).toContain('User-agent: ClaudeBot');
      expect(text).toContain('User-agent: anthropic-ai');
      expect(text).toContain('User-agent: GPTBot');
      expect(text).toContain('User-agent: ChatGPT-User');
      expect(text).toContain('User-agent: PerplexityBot');

      // Major Search Engines & Social Crawlers
      expect(text).toContain('User-agent: Googlebot');
      expect(text).toContain('User-agent: Google-Extended');
      expect(text).toContain('User-agent: Bingbot');
      expect(text).toContain('User-agent: Applebot');
      expect(text).toContain('User-agent: facebookexternalhit');
      expect(text).toContain('User-agent: FacebookBot');
      expect(text).toContain('User-agent: Twitterbot');
      expect(text).toContain('User-agent: TelegramBot');
    });

    it('blocks aggressive scrapers and data harvesters', async () => {
      const res = await request(app).get('/robots.txt');
      const text = res.text;

      expect(text).toContain('User-agent: Bytespider');
      expect(text).toContain('User-agent: TikTokSpider');
      expect(text).toContain('User-agent: CCBot');
      expect(text).toContain('User-agent: Baiduspider');
      expect(text).toContain('User-agent: PetalBot');
      expect(text).toContain('User-agent: YandexBot');
      expect(text).toContain('User-agent: MJ12bot');
      expect(text).toContain('User-agent: AhrefsBot');
      expect(text).toContain('User-agent: SemrushBot');
      expect(text).toContain('User-agent: DotBot');
      expect(text).toContain('User-agent: DataForSeoBot');
      expect(text).toContain('User-agent: Scrapy');
      expect(text).toContain('User-agent: Sogou');
    });

    it('shields /api/ and /admin routes and references dynamic sitemap', async () => {
      const res = await request(app).get('/robots.txt');
      const text = res.text;

      expect(text).toContain('Disallow: /api/');
      expect(text).toContain('Disallow: /admin');
      expect(text).toContain('Sitemap: https://pairtalk.online/sitemap.xml');
    });
  });

  describe('2. Dynamic XML Sitemap (/sitemap.xml)', () => {
    it('serves sitemap.xml with 200 OK and application/xml content type', async () => {
      const res = await request(app).get('/sitemap.xml');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/application\/xml/);
      expect(res.headers['cache-control']).toContain('public, max-age=86400');
    });

    it('contains all required URLs with correct priorities and change frequencies', async () => {
      const res = await request(app).get('/sitemap.xml');
      const xml = res.text;

      expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"');
      expect(xml).toContain('<loc>https://pairtalk.online/</loc>');
      expect(xml).toContain('<priority>1.0</priority>');
      expect(xml).toContain('<changefreq>daily</changefreq>');

      expect(xml).toContain('<loc>https://pairtalk.online/#guidelines</loc>');
      expect(xml).toContain('<priority>0.8</priority>');
      expect(xml).toContain('<changefreq>weekly</changefreq>');

      expect(xml).toContain('<loc>https://pairtalk.online/#privacy</loc>');
      expect(xml).toContain('<priority>0.7</priority>');
      expect(xml).toContain('<changefreq>monthly</changefreq>');
    });

    it('dynamically computes real-time YYYY-MM-DD lastmod timestamp', async () => {
      const res = await request(app).get('/sitemap.xml');
      const xml = res.text;
      const today = new Date().toISOString().split('T')[0];

      expect(xml).toContain(`<lastmod>${today}</lastmod>`);
    });
  });

  describe('3. Root GET / Pre-Rendered SEO, Social Cards & Schema.org JSON-LD', () => {
    it('serves pre-rendered SEO HTML with 200 OK on GET /', async () => {
      const res = await request(app).get('/');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/html/);
    });

    it('contains high-CTR OpenGraph and Twitter card metadata', async () => {
      const res = await request(app).get('/');
      const html = res.text;

      expect(html).toContain('property="og:title" content="Partner ghosted you again? No more excuses."');
      expect(html).toContain('property="og:description"');
      expect(html).toContain('< 3 seconds');
      expect(html).toContain('property="og:image" content="https://pairtalk.online/plans_pricing.jpg"');

      expect(html).toContain('name="twitter:card" content="summary_large_image"');
      expect(html).toContain('name="twitter:title" content="Partner ghosted you again? No more excuses."');
      expect(html).toContain('name="twitter:image" content="https://pairtalk.online/plans_pricing.jpg"');
    });

    it('contains Google Trends 2-4 word power keywords and search intent tags', async () => {
      const res = await request(app).get('/');
      const html = res.text;

      expect(html).toContain('ielts speaking 2026');
      expect(html).toContain('ielts speaking band descriptors');
      expect(html).toContain('ielts speaking part 1');
      expect(html).toContain('ielts speaking part 2');
      expect(html).toContain('ielts speaking part 3');
      expect(html).toContain('ielts pronunciation practice');
      expect(html).toContain('ielts price');
      expect(html).toContain('ielts 6.5 speaking');
      expect(html).toContain('ielts band 7 speaking');
    });

    it('contains valid Schema.org JSON-LD graphs for SoftwareApplication, EducationalOrganization, and FAQPage', async () => {
      const res = await request(app).get('/');
      const html = res.text;

      expect(html).toContain('type="application/ld+json"');
      expect(html).toContain('"@context": "https://schema.org"');
      expect(html).toContain('"@graph"');

      expect(html).toContain('"@type": ["SoftwareApplication", "EducationalApplication"]');
      expect(html).toContain('"name": "PairTalk"');
      expect(html).toContain('FREE Tier');
      expect(html).toContain('PLUS Plan');
      expect(html).toContain('PRO Plan');
      expect(html).toContain('BOSS Plan');

      expect(html).toContain('"@type": "EducationalOrganization"');
      expect(html).toContain('"name": "PairTalk IELTS Speaking Network"');

      expect(html).toContain('"@type": "FAQPage"');
      expect(html).toContain('What is PairTalk and how does live IELTS Speaking matchmaking work?');
    });
  });

  describe('4. Subdomain Edge Routing & Direct Navigation Shielding', () => {
    it('redirects external browser direct on app.pairtalk.online to pairtalk.online (302)', async () => {
      const res = await request(app)
        .get('/')
        .set('Host', 'app.pairtalk.online');

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('https://pairtalk.online');
    });

    it('redirects external browser direct with X-Forwarded-Host to pairtalk.online (302)', async () => {
      const res = await request(app)
        .get('/')
        .set('X-Forwarded-Host', 'app.pairtalk.online');

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('https://pairtalk.online');
    });

    it('allows app.pairtalk.online requests with x-telegram-init-data header (200 OK)', async () => {
      const res = await request(app)
        .get('/')
        .set('Host', 'app.pairtalk.online')
        .set('x-telegram-init-data', 'query_id=AAHd&user=%7B%22id%22%3A123456%7D&auth_date=1620000000&hash=abc');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/html/);
    });

    it('allows app.pairtalk.online requests with tgWebAppData query parameter (200 OK)', async () => {
      const res = await request(app)
        .get('/?tgWebAppData=user%3D12345')
        .set('Host', 'app.pairtalk.online');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/html/);
    });

    it('allows app.pairtalk.online requests with Telegram User-Agent (200 OK)', async () => {
      const res = await request(app)
        .get('/')
        .set('Host', 'app.pairtalk.online')
        .set('User-Agent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Telegram-iOS/9.6.1');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/html/);
    });

    it('allows app.pairtalk.online requests with telegram.org Referer (200 OK)', async () => {
      const res = await request(app)
        .get('/')
        .set('Host', 'app.pairtalk.online')
        .set('Referer', 'https://web.telegram.org/a/');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/html/);
    });

    it('redirects external browser navigation on api.pairtalk.online to pairtalk.online (302)', async () => {
      const res = await request(app)
        .get('/')
        .set('Host', 'api.pairtalk.online');

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('https://pairtalk.online');
    });

    it('bypasses redirection on api.pairtalk.online for /health (200 OK)', async () => {
      const res = await request(app)
        .get('/health')
        .set('Host', 'api.pairtalk.online');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });

    it('bypasses redirection on api.pairtalk.online for /robots.txt and /sitemap.xml (200 OK)', async () => {
      const resRobots = await request(app)
        .get('/robots.txt')
        .set('Host', 'api.pairtalk.online');
      expect(resRobots.status).toBe(200);

      const resSitemap = await request(app)
        .get('/sitemap.xml')
        .set('Host', 'api.pairtalk.online');
      expect(resSitemap.status).toBe(200);
    });

    it('preserves admin.pairtalk.online portal without redirection (200 OK)', async () => {
      const res = await request(app)
        .get('/')
        .set('Host', 'admin.pairtalk.online');

      expect(res.status).toBe(200);
    });
  });
});
