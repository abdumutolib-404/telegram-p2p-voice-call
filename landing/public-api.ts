import { isPublicPricing } from '../server/src/contracts/pricing';
import { isPublicStats } from '../server/src/contracts/publicStats';

const validators = { '/api/public/plans': isPublicPricing, '/api/public/stats': isPublicStats };
function error(message: string, status: number, head: boolean, extra: Record<string, string> = {}) {
  return new Response(head ? null : JSON.stringify({ error: message }), { status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra } });
}
/** Only these two credential-free read endpoints may cross the public edge. */
export async function servePublicApi(request: Request, origin: string, upstreamFetch: typeof fetch = fetch): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/')) return null;
  const head = request.method === 'HEAD';
  if (!Object.hasOwn(validators, url.pathname)) return error('Public endpoint not found.', 404, head);
  if (request.method !== 'GET' && !head) return error('Only GET and HEAD are supported.', 405, false, { Allow: 'GET, HEAD' });
  const unavailable = () => error('Public data is temporarily unavailable. Please try again later.', 503, head, { 'Retry-After': '30' });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const backend = new URL(origin);
    if (backend.username || backend.password || backend.pathname !== '/' || backend.search || backend.hash || backend.origin === url.origin ||
        (backend.protocol !== 'https:' && !(backend.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(backend.hostname)))) return unavailable();
    const response = await upstreamFetch(new URL(url.pathname, backend), {
      method: 'GET', headers: { Accept: 'application/json' }, redirect: 'manual', signal: controller.signal,
    });
    if (!response.ok || !response.headers.get('Content-Type')?.toLowerCase().includes('application/json')) { await response.body?.cancel(); return unavailable(); }
    const reader = response.body?.getReader();
    if (!reader) return unavailable();
    const decoder = new TextDecoder(); let body = '', bytes = 0;
    try {
      while (true) {
        const chunk = await reader.read(); if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > 65536) { await reader.cancel(); return unavailable(); }
        body += decoder.decode(chunk.value, { stream: true });
      }
      body += decoder.decode();
    } finally { reader.releaseLock(); }
    const data: unknown = JSON.parse(body);
    const validate = validators[url.pathname as keyof typeof validators];
    if (!validate(data)) return unavailable();
    return new Response(head ? null : JSON.stringify(data), { status: 200, headers: {
      'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    } });
  } catch { return unavailable(); }
  finally { clearTimeout(timeout); }
}
