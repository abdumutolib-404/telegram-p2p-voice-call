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
  const response = await fetch(`${origin}/api/dashboard${path}`, { ...options, cache: 'no-store', headers: { 'Content-Type': 'application/json', 'x-telegram-init-data': initData, ...options.headers } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new DashboardError(data.error || 'The request could not be completed. Please try again.', response.status, data.code);
  return data as T;
}
