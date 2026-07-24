// API client for the merchant portal. Talks to ic-api with credentials so the
// httpOnly session cookies ride along. Realm = merchant.

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
  // Parse defensively. A gateway 502/504, a CSP block or a misrouted request
  // returns HTML, and an unguarded JSON.parse threw a SyntaxError instead of an
  // ApiError. Callers check `err instanceof ApiError`, so that surfaced as a
  // generic "could not do that" and hid the real status from the user.
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text) as unknown;
    } catch {
      if (!res.ok) {
        throw new ApiError(res.status, 'ERROR', res.statusText || `Request failed (${res.status})`);
      }
      throw new ApiError(res.status, 'ERROR', 'The server returned an unexpected response.');
    }
  }
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

export const authApi = {
  login: (email: string, password: string) =>
    apiPost<{ challengeId: string; devCode?: string }>('/v1/auth/merchant/login', { email, password }),
  verifyOtp: (challengeId: string, code: string) =>
    apiPost<{ user: { id: string; email: string; roles: string[] } }>(
      '/v1/auth/merchant/verify-otp',
      { challengeId, code },
    ),
  forgotPassword: (email: string) =>
    apiPost<{ challengeId: string; devCode?: string }>('/v1/auth/merchant/forgot-password', { email }),
  resetPassword: (challengeId: string, code: string, newPassword: string) =>
    apiPost<{ ok: true }>('/v1/auth/merchant/reset-password', { challengeId, code, newPassword }),
  me: () =>
    apiGet<{ userId: string; scope: string; merchantId: string | null; roles: string[] }>(
      '/v1/auth/merchant/me',
    ),
  logout: () => apiPost<{ ok: true }>('/v1/auth/merchant/logout'),
};
