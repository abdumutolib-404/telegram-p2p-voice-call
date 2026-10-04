import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Public SEO is verified by the landing build checks and public fallback tests.
// The Mini App has its own shell; it must not advertise duplicate public offers or reviews.
describe('Private Mini App document and launch contract', () => {
  const html = fs.readFileSync(path.resolve(__dirname, '../../../client/index.html'), 'utf8');

  it('declares an English HTML document and a recognizable application title', () => {
    expect(html).toMatch(/<!doctype html>/i);
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('charset="UTF-8"');
    expect(html).toContain('<title>PairTalk — Speaking Practice</title>');
  });

  it('keeps the authenticated Mini App out of public search indexing', () => {
    expect(html).toContain('name="robots" content="noindex, nofollow"');
    expect(html).not.toContain('content="index, follow');
    expect(html).not.toContain('rel="canonical" href="https://pairtalk.online/"');
  });

  it('allows device zoom without imposing a maximum scale', () => {
    const viewport = html.match(/<meta name="viewport" content="([^"]+)"/)?.[1];
    expect(viewport).toContain('width=device-width');
    expect(viewport).toContain('initial-scale=1.0');
    expect(viewport).not.toContain('user-scalable=no');
    expect(viewport).not.toContain('maximum-scale');
  });

  it('loads the official Telegram SDK and application entry once', () => {
    expect(html.match(/src="https:\/\/telegram.org\/js\/telegram-web-app.js"/g)).toHaveLength(1);
    expect(html.match(/<div id="root"><\/div>/g)).toHaveLength(1);
    expect(html.match(/<script type="module" src="\/src\/main.tsx"><\/script>/g)).toHaveLength(1);
  });

  it('provides launch guidance when JavaScript is disabled', () => {
    const guidance = html.match(/<noscript>([^<]+)<\/noscript>/)?.[1];
    expect(guidance).toContain('Enable JavaScript');
    expect(guidance).toContain('Telegram bot');
  });

  it('does not duplicate public structured data or unsupported marketing guarantees', () => {
    for (const unsupported of ['application/ld+json', 'aggregateRating', 'FAQPage', '< 3 seconds', 'money-back guarantee', '95% cost savings', 'plans_pricing.jpg', 'name="keywords"']) {
      expect(html).not.toContain(unsupported);
    }
  });
});
