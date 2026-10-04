import { afterEach, expect, it, vi } from 'vitest';
import { WebCrawlerService } from '../services/crawler/webCrawlerService';

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

it('retries a subpage whose previous download failed', async () => {
  const crawler = new WebCrawlerService();
  const hub = 'https://retry.example.test/speaking';
  const page = hub + '/practice';
  const fetch = vi.spyOn(crawler, 'fetchHtml').mockImplementation(async url => url === hub ? '<a href="/speaking/practice">Practice</a>' : null);
  await crawler.spiderHubUrl(hub, 10, 0);
  expect(await crawler.isUrlVisited(page)).toBe(false);
  await crawler.spiderHubUrl(hub, 10, 0);
  expect(fetch.mock.calls.filter(([url]) => url === page)).toHaveLength(2);
});

it('allows a previously downloaded page to be revisited after the crawl-memory window', async () => {
  vi.useFakeTimers();
  const crawler = new WebCrawlerService();
  const page = 'https://expiry.example.test/speaking/practice';
  await crawler.markUrlVisited(page);
  expect(await crawler.isUrlVisited(page)).toBe(true);
  await vi.advanceTimersByTimeAsync(86400001);
  expect(await crawler.isUrlVisited(page)).toBe(false);
});

it('bounds attempted subpages even when all downloads fail', async () => {
  const crawler = new WebCrawlerService();
  const hub = 'https://budget.example.test/speaking';
  const fetch = vi.spyOn(crawler, 'fetchHtml').mockImplementation(async url => url === hub ? '<a href="/speaking/one">One</a><a href="/speaking/two">Two</a><a href="/speaking/three">Three</a>' : null);
  await crawler.spiderHubUrl(hub, 2, 0);
  expect(fetch.mock.calls.filter(([url]) => url !== hub)).toHaveLength(2);
});
