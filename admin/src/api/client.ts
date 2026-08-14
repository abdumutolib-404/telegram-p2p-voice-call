const TOKEN_KEY = 'admin_jwt';

export function getAdminToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function setAdminToken(token: string): void {
  sessionStorage.setItem(TOKEN_KEY, token);
}

export function clearAdminToken(): void {
  sessionStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

export async function adminFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getAdminToken();
  const rawBaseUrl = (import.meta.env.VITE_API_URL || import.meta.env.VITE_SERVER_URL || '').replace(/\/+$/, '');
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const url = `${rawBaseUrl}${cleanEndpoint}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const config: RequestInit = {
    ...options,
    credentials: 'include',
    headers,
  };

  const response = await fetch(url, config);

  if (!response.ok) {
    let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
    try {
      const errorData = await response.json();
      if (errorData && typeof errorData.error === 'string') {
        errorMessage = errorData.error;
      } else if (errorData && typeof errorData.message === 'string') {
        errorMessage = errorData.message;
      }
    } catch {
      // Ignore JSON parse failure on error body
    }

    if (response.status === 401 || response.status === 403) {
      if (!cleanEndpoint.includes('/auth/password') && !cleanEndpoint.includes('/auth/otp') && !cleanEndpoint.includes('/auth/login')) {
        clearAdminToken();
        window.dispatchEvent(new Event('admin:unauthorized'));
      }
    }

    throw new ApiError(errorMessage, response.status);
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
}
