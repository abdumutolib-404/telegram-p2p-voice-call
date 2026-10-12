import { expect, it, vi } from 'vitest';
import { servePublicApi } from '../../landing/public-api';

const stats = { updatedAt: '2026-10-11T12:00:00Z', completedCalls: 10, practiceHours: 2, practicingLearners: 8, activeTopics: 4, ratings: { average: null, count: 0, distribution: [] }, monthly: [] };
const catalog = { version: 1, revision: 'a'.repeat(64), checkedAt: '2026-10-11T12:00:00Z', botUsername: 'PairTalkBot', plans: [{ id: 'FREE', name: 'Free', description: 'Practice', calls: 3, unlimitedCalls: false, maxCallMinutes: 15, recordings: 0, retentionDays: 1, validityDays: 0, period: 'calendar_month', prices: { XTR: 0, UZS: 0 } }] };
const request = (path: string, method = 'GET') => new Request(`https://pairtalk.online${path}`, { method, headers: { Cookie: 'private=session', Authorization: 'Bearer private' } });
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });

it.each([['plans', catalog], ['stats', stats]])('serves validated %s JSON without forwarding credentials or query parameters', async (name, body) => {
  const upstream = vi.fn<typeof fetch>().mockResolvedValue(json(body));
  const response = await servePublicApi(request(`/api/public/${name}?token=private`), 'https://api.pairtalk.online', upstream);
  expect(response?.status).toBe(200);
  expect(await response?.json()).toEqual(body);
  expect(response?.headers.get('cache-control')).toBe('no-store');
  const [url, options] = upstream.mock.calls[0];
  expect(String(url)).toBe(`https://api.pairtalk.online/api/public/${name}`);
  expect(options?.headers).toEqual({ Accept: 'application/json' });
  expect(options?.redirect).toBe('manual');
});
it('keeps public failures JSON, including HTML fallbacks, redirects, malformed bodies and missing apps', async () => {
  for (const upstreamResponse of [new Response('<html>SPA fallback</html>'), new Response('{}', { status: 404 }), new Response(null, { status: 302, headers: { Location: '/login' } }), json({ private: 'backend error' }), new Response('{', { headers: { 'Content-Type': 'application/json' } }), json({ ...stats, monthly: [null] })]) {
    const response = await servePublicApi(request('/api/public/stats'), 'https://api.pairtalk.online', vi.fn<typeof fetch>().mockResolvedValue(upstreamResponse));
    expect(response?.status).toBe(503);
    expect(response?.headers.get('retry-after')).toBe('30');
    expect(response?.headers.get('content-type')).toContain('application/json');
    expect(await response?.text()).not.toMatch(/SPA fallback|private|backend error/);
  }
});
it('bounds response size and handles network failure without stale or invented data', async () => {
  for (const upstream of [vi.fn<typeof fetch>().mockResolvedValue(json({ ...stats, padding: 'x'.repeat(65536) })), vi.fn<typeof fetch>().mockRejectedValue(new Error('Private service address'))]) {
    const response = await servePublicApi(request('/api/public/stats'), 'https://api.pairtalk.online', upstream);
    expect(response?.status).toBe(503); expect(await response?.text()).not.toContain('Private');
  }
});
it('rejects unknown API routes and mutations while leaving static pages to the assets handler', async () => {
  const upstream = vi.fn<typeof fetch>();
  expect(await servePublicApi(request('/pricing'), 'https://api.pairtalk.online', upstream)).toBeNull();
  expect((await servePublicApi(request('/api/admin/users'), 'https://api.pairtalk.online', upstream))?.status).toBe(404);
  const rejected = await servePublicApi(request('/api/public/plans', 'POST'), 'https://api.pairtalk.online', upstream);
  expect(rejected?.status).toBe(405); expect(rejected?.headers.get('allow')).toBe('GET, HEAD');
  expect(upstream).not.toHaveBeenCalled();
});
it('serves body-free HEAD and rejects recursive, credential-bearing and invalid upstreams', async () => {
  const upstream = vi.fn<typeof fetch>().mockImplementation(async () => json(stats));
  const head = await servePublicApi(request('/api/public/stats', 'HEAD'), 'https://api.pairtalk.online', upstream);
  expect(head?.status).toBe(200); expect(await head?.text()).toBe('');
  for (const origin of ['https://pairtalk.online', 'https://user:secret@api.pairtalk.online', 'https://api.pairtalk.online/path', 'file:///data', 'invalid']) {
    expect((await servePublicApi(request('/api/public/stats'), origin, upstream))?.status).toBe(503);
  }
  expect(upstream).toHaveBeenCalledTimes(1);
});
