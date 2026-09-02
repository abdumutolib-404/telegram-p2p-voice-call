import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Client Index HTML, Schema.org JSON-LD & SEO Validation Suite', () => {
  const clientIndexPath = path.resolve(__dirname, '../../../client/index.html');
  const html = fs.readFileSync(clientIndexPath, 'utf8');

  it('verifies client/index.html exists and is non-empty', () => {
    expect(html.length).toBeGreaterThan(1000);
  });

  describe('1. OpenGraph & Viral Social Preview Cards', () => {
    it('contains the informal partner-ghosting call-out in og:title', () => {
      expect(html).toContain('content="Partner ghosted you again? No more excuses."');
    });

    it('contains descriptive og:description and site_name', () => {
      expect(html).toContain('name="description"');
      expect(html).toContain('property="og:description"');
      expect(html).toContain('property="og:site_name"');
      expect(html).toContain('property="og:type" content="website"');
    });

    it('configures Twitter summary_large_image card', () => {
      expect(html).toContain('name="twitter:card" content="summary_large_image"');
      expect(html).toContain('name="twitter:title" content="Partner ghosted you again? No more excuses."');
    });
  });

  describe('2. Google Trends 2026 Keywords & Metadata', () => {
    it('contains the breakout IELTS Speaking 2026 keyword in metadata', () => {
      expect(html).toContain('ielts speaking 2026');
    });

    it('includes official band descriptors and exam format keywords', () => {
      expect(html).toContain('ielts speaking band descriptors');
      expect(html).toContain('ielts speaking part 1');
      expect(html).toContain('ielts speaking part 2');
      expect(html).toContain('ielts speaking part 3');
      expect(html).toContain('ielts pronunciation practice');
    });

    it('contains the canonical link to pairtalk.online', () => {
      expect(html).toContain('<link rel="canonical" href="https://pairtalk.online/"');
    });
  });

  describe('3. Machine-Readable Schema.org JSON-LD Graph Validation', () => {
    // Extract JSON-LD payload from <script type="application/ld+json">
    const match = html.match(/<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/i);

    it('contains a valid JSON-LD script block', () => {
      expect(match).not.toBeNull();
      expect(match![1]).toBeDefined();
    });

    it('parses as valid, syntactically correct JSON', () => {
      const parsed = JSON.parse(match![1]);
      expect(parsed['@context']).toBe('https://schema.org');
      expect(Array.isArray(parsed['@graph'])).toBe(true);
    });

    it('contains SoftwareApplication entity with Telegram/iOS/Android/Web support', () => {
      const parsed = JSON.parse(match![1]);
      const app = parsed['@graph'].find((e: any) => {
        const types = Array.isArray(e['@type']) ? e['@type'] : [e['@type']];
        return types.includes('SoftwareApplication');
      });
      expect(app).toBeDefined();
      expect(app.name).toBe('PairTalk');
      expect(app.applicationCategory).toBe('EducationalApplication');
      expect(app.operatingSystem).toContain('Telegram');
      expect(app.operatingSystem).toContain('iOS');
      expect(app.operatingSystem).toContain('Android');
    });

    it('contains EducationalOrganization entity linked to PairTalkBot', () => {
      const parsed = JSON.parse(match![1]);
      const org = parsed['@graph'].find((e: any) => e['@type'] === 'EducationalOrganization');
      expect(org).toBeDefined();
      expect(org.name).toContain('PairTalk');
      expect(org.sameAs).toContain('https://t.me/PairTalkBot');
    });

    it('contains FAQPage entity with questions covering 2026, band descriptors, and privacy', () => {
      const parsed = JSON.parse(match![1]);
      const faq = parsed['@graph'].find((e: any) => e['@type'] === 'FAQPage');
      expect(faq).toBeDefined();
      expect(Array.isArray(faq.mainEntity)).toBe(true);
      expect(faq.mainEntity.length).toBeGreaterThanOrEqual(4);

      const questions = faq.mainEntity.map((q: any) => q.name.toLowerCase());
      expect(questions.some((q: string) => q.includes('2026'))).toBe(true);
      expect(questions.some((q: string) => q.includes('band descriptors'))).toBe(true);
      expect(questions.some((q: string) => q.includes('cost') || q.includes('price') || q.includes('free'))).toBe(true);
      expect(questions.some((q: string) => q.includes('anonymous') || q.includes('privacy'))).toBe(true);
    });
  });
});
