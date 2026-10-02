export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; this.name = 'ApiError'; }
}
export async function request(endpoint: string, options: RequestInit, config: {
  baseUrl: string; token: string | null; unauthorized: () => void; timeoutMs?: number;
}): Promise<Response> {
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  headers.set('X-Requested-With', 'XMLHttpRequest');
  if (config.token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${config.token}`);
  const controller = new AbortController();
  const abort = () => controller.abort(options.signal?.reason);
  if (options.signal?.aborted) abort();
  else options.signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => controller.abort(new DOMException('Request timed out', 'TimeoutError')), config.timeoutMs ?? 20000);
  try {
    const response = await fetch(`${config.baseUrl.replace(/\/+$/, '')}${path}`, {
      ...options, credentials: 'include', headers, signal: controller.signal,
    });
    if (response.status === 401 && !/^\/api\/admin\/(?:login|auth\/(?:password|otp(?:\/.*)?|login))(?:\?|$)/.test(path)) config.unauthorized();
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      throw new ApiError(data?.error || data?.message || `Request failed (${response.status})`, response.status);
    }
    // Keep the deadline active through body consumption, including protected file downloads.
    const reader = response.body?.getReader(), chunks: Uint8Array[] = []; let size = 0;
    if (reader) while (true) {
      const next = await reader.read(); if (next.done) break;
      size += next.value.length;
      if (size > 25 * 1024 * 1024) { controller.abort(); throw new Error('Response is too large.'); }
      chunks.push(next.value);
    }
    const body = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
    return new Response(response.status === 204 ? null : body, { status:response.status, headers:response.headers });
  } finally {
    clearTimeout(timer); options.signal?.removeEventListener('abort', abort);
  }
}
