import { describe, it, expect } from 'vitest';
import {
  parseClientIp,
  isIpInCidr,
  verifyCrawler,
} from '../services/crawler/verifyCrawler';

describe('Crawler Verification Engine', () => {
  describe('IP Parsing and CIDR matching', () => {
    it('correctly parses IPv4, IPv6, and IPv4-mapped IPv6', () => {
      const v4 = parseClientIp('192.168.1.5');
      expect(v4).not.toBeNull();
      expect(v4?.kind()).toBe('ipv4');

      const v6 = parseClientIp('2001:4860:4801:10::1');
      expect(v6).not.toBeNull();
      expect(v6?.kind()).toBe('ipv6');

      const mapped = parseClientIp('::ffff:192.168.1.5');
      expect(mapped).not.toBeNull();
      expect(mapped?.kind()).toBe('ipv4');
    });

    it('matches IPv4 against CIDR correctly', () => {
      const ip = parseClientIp('192.168.1.50')!;
      expect(isIpInCidr(ip, '192.168.1.0/24')).toBe(true);
      expect(isIpInCidr(ip, '192.168.2.0/24')).toBe(false);
      expect(isIpInCidr(ip, '10.0.0.0/8')).toBe(false);
    });

    it('matches IPv6 against CIDR correctly', () => {
      const ip = parseClientIp('2001:4860:4801:10::5')!;
      expect(isIpInCidr(ip, '2001:4860:4801:10::/64')).toBe(true);
      expect(isIpInCidr(ip, '2001:4860:4801:20::/64')).toBe(false);
    });
  });

  describe('User-Agent & IP Verification', () => {
    it('returns non-crawler for standard browser User-Agents', async () => {
      const res = await verifyCrawler(
        '192.168.1.1',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      );
      expect(res.isCrawlerUa).toBe(false);
      expect(res.isVerified).toBe(false);
      expect(res.isSpoofed).toBe(false);
    });

    it('detects spoofed crawler when UA claims to be GPTBot from unauthorized IP', async () => {
      // 1.2.3.4 is not in OpenAI's IP ranges
      const res = await verifyCrawler(
        '1.2.3.4',
        'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)'
      );
      expect(res.isCrawlerUa).toBe(true);
      expect(res.isVerified).toBe(false);
      expect(res.isSpoofed).toBe(true);
      expect(res.crawlerName).toBe('OpenAI-GPTBot');
    });

    it('detects spoofed crawler when UA claims to be ClaudeBot from unauthorized IP', async () => {
      const res = await verifyCrawler(
        '5.6.7.8',
        'Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)'
      );
      expect(res.isCrawlerUa).toBe(true);
      expect(res.isVerified).toBe(false);
      expect(res.isSpoofed).toBe(true);
      expect(res.crawlerName).toBe('Anthropic-ClaudeBot');
    });
  });
});
