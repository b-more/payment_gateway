// API client for the admin portal. Talks to ic-api with credentials so the
// httpOnly session cookies (SEC-A3) ride along. Base URL via NEXT_PUBLIC_API_URL.

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8030';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: 'include',
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  const data = text ? (JSON.parse(text) as unknown) : null;
  if (!res.ok) {
    // Session expired / not authenticated mid-use: bounce to the login page.
    if (
      res.status === 401 &&
      typeof window !== 'undefined' &&
      !window.location.pathname.startsWith('/login')
    ) {
      window.location.href = '/login';
    }
    const err = (data as { error?: { code?: string; message?: string } } | null)?.error;
    throw new ApiError(res.status, err?.code ?? 'ERROR', err?.message ?? res.statusText);
  }
  return data as T;
}

export const apiGet = <T>(path: string): Promise<T> => request<T>('GET', path);
export const apiPost = <T>(path: string, body?: unknown): Promise<T> => request<T>('POST', path, body);
export const apiPut = <T>(path: string, body?: unknown): Promise<T> => request<T>('PUT', path, body);
export const apiDelete = <T>(path: string): Promise<T> => request<T>('DELETE', path);

/** Download a file (e.g. CSV) with credentials, triggering a browser save. */
export async function downloadFile(path: string, filename: string): Promise<void> {
  const res = await fetch(`${BASE}${path}`, { credentials: 'include' });
  if (!res.ok) throw new ApiError(res.status, 'ERROR', 'Download failed');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Auth (realm = admin)
export const authApi = {
  login: (email: string, password: string) =>
    apiPost<{ challengeId: string; devCode?: string }>('/v1/auth/admin/login', { email, password }),
  verifyOtp: (challengeId: string, code: string) =>
    apiPost<{ user: { id: string; email: string; roles: string[] } }>('/v1/auth/admin/verify-otp', {
      challengeId,
      code,
    }),
  forgotPassword: (email: string) =>
    apiPost<{ challengeId: string; devCode?: string }>('/v1/auth/admin/forgot-password', { email }),
  resetPassword: (challengeId: string, code: string, newPassword: string) =>
    apiPost<{ ok: true }>('/v1/auth/admin/reset-password', { challengeId, code, newPassword }),
  me: () =>
    apiGet<{ userId: string; scope: string; merchantId: string | null; roles: string[] }>(
      '/v1/auth/admin/me',
    ),
  logout: () => apiPost<{ ok: true }>('/v1/auth/admin/logout'),
};
