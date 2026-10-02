import https from 'node:https';
import http from 'node:http';
import dns from 'node:dns/promises';
import ipaddr from 'ipaddr.js';
const agent = new https.Agent({ keepAlive: true, maxSockets: 16 });
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 8 });
export function isPublicAddress(address: string): boolean {
  try { const parsed = ipaddr.process(address); return parsed.range() === 'unicast'; } catch { return false; }
}
export async function safeFetch(url: string, options: { headers?: Record<string, string>; signal?: AbortSignal; maxBytes?: number; timeoutMs?: number; allowed?: (url: string) => boolean } = {}): Promise<Response> {
  const controller = new AbortController(), abort = () => controller.abort(options.signal?.reason);
  const timer = setTimeout(() => controller.abort(new Error('External request timed out')), options.timeoutMs ?? 12000);
  if (options.signal?.aborted) abort(); else options.signal?.addEventListener('abort', abort, { once: true });
  try {
    for (let redirect = 0; redirect <= 3; redirect++) {
      const parsed = new URL(url);
      if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password || (parsed.port && !['443', '80'].includes(parsed.port)) || options.allowed?.(url) === false) throw new Error('External URL is not permitted');
      const addresses = await Promise.race([dns.lookup(parsed.hostname, { all: true }), new Promise<never>((_, reject) => {
        if (controller.signal.aborted) reject(controller.signal.reason);
        else controller.signal.addEventListener('abort', () => reject(controller.signal.reason), { once: true });
      })]);
      if (!addresses.length || addresses.some(entry => !isPublicAddress(entry.address))) throw new Error('External target resolves to a private or reserved address');
      const pinned = addresses[0];
      const response = await new Promise<Response>((resolve, reject) => {
        const transport = parsed.protocol === 'https:' ? https : http;
        const req = transport.get(parsed, {
          agent: parsed.protocol === 'https:' ? agent : httpAgent, signal: controller.signal,
          family: pinned.family,
          headers: { ...options.headers, 'Accept-Encoding': 'identity' },
          // Pin the validated address for this connection; retain hostname/SNI and normal TLS verification.
          lookup: (_host, _options, callback) => callback(null, pinned.address, pinned.family),
        }, incoming => {
          const chunks: Buffer[] = []; let size = 0;
          incoming.on('data', chunk => {
            size += chunk.length;
            if (size > (options.maxBytes ?? 5 * 1024 * 1024)) req.destroy(new Error('External response exceeds size limit'));
            else chunks.push(Buffer.from(chunk));
          });
          incoming.on('error', reject); incoming.on('end', () => {
            const headers = new Headers();
            for (const [key, value] of Object.entries(incoming.headers)) if (value) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
            const status = incoming.statusCode || 502;
            resolve(new Response([204, 304].includes(status) ? null : Buffer.concat(chunks), { status, headers }));
          });
        });
        req.on('error', reject);
      });
      if (![301, 302, 303, 307, 308].includes(response.status)) return response;
      const location = response.headers.get('location');
      if (!location || redirect === 3) throw new Error('External redirect limit exceeded');
      const next = new URL(location, parsed);
      if (parsed.protocol === 'https:' && next.protocol !== 'https:') throw new Error('TLS downgrade redirect blocked');
      url = next.toString();
    }
    throw new Error('External redirect limit exceeded');
  } finally { clearTimeout(timer); options.signal?.removeEventListener('abort', abort); }
}
export function closeExternalConnections() { agent.destroy(); httpAgent.destroy(); }
