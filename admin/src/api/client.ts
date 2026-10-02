import { request } from './request';
export { ApiError } from './request';
const TOKEN_KEY = 'admin_jwt';
export function getAdminToken() { return sessionStorage.getItem(TOKEN_KEY); }
export function setAdminToken(token: string) { sessionStorage.setItem(TOKEN_KEY, token); }
export function clearAdminToken() { sessionStorage.removeItem(TOKEN_KEY); }
export async function adminResponse(endpoint: string, options: RequestInit = {}) {
  return request(endpoint, options, {
    baseUrl: import.meta.env.VITE_API_URL || import.meta.env.VITE_SERVER_URL || '', token: getAdminToken(),
    unauthorized: () => { clearAdminToken(); window.dispatchEvent(new Event('admin:unauthorized')); },
  });
}
export async function adminFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const response = await adminResponse(endpoint, options);
  if (response.status === 204) return {} as T;
  const data = await response.json();
  if ((options.method || 'GET').toUpperCase() !== 'GET') window.dispatchEvent(new Event('admin:queues-changed'));
  return data;
}
