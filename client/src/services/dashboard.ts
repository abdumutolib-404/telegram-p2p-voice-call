export const publicSiteUrl = (() => {
  try {
    const url = new URL(import.meta.env.VITE_PUBLIC_SITE_URL || 'https://pairtalk.online');
    if (url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) return url.toString();
  } catch { /* Use the public production site when configuration is invalid. */ }
  return 'https://pairtalk.online';
})();
export function redirectToLanding(): void { window.location.replace(publicSiteUrl); }

export class DashboardError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) { super(message); this.status = status; this.code = code; }
}
export async function dashboardRequest<T>(initData: string, path: string, options: RequestInit = {}): Promise<T> {
  const origin = (import.meta.env.VITE_SERVER_URL || '').replace(/\/+$/, '');
  const controller = new AbortController();
  const abort = () => controller.abort(options.signal?.reason);
  options.signal?.addEventListener('abort', abort, { once: true });
  if (options.signal?.aborted) abort();
  let timedOut = false;
  const deadline = window.setTimeout(() => { timedOut = true; controller.abort(); }, 15000);
  try {
    const response = await fetch(`${origin}/api/dashboard${path}`, { ...options, signal: controller.signal, cache: 'no-store', headers: { 'Content-Type': 'application/json', 'x-telegram-init-data': initData, ...options.headers } });
    const data = await response.json();
    if (!response.ok) throw new DashboardError(data.error || 'The request could not be completed. Please try again.', response.status, data.code);
    return data as T;
  } catch (error) {
    if (timedOut) throw new DashboardError(options.method && !['GET', 'HEAD'].includes(options.method.toUpperCase())
      ? 'The server took too long to respond. Check the updated result before submitting again.'
      : 'The server took too long to respond. Please retry.', 408, 'request_timeout');
    throw error;
  } finally {
    window.clearTimeout(deadline);
    options.signal?.removeEventListener('abort', abort);
  }
}
