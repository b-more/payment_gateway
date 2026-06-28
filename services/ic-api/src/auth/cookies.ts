import type { Response } from 'express';

export type Realm = 'admin' | 'merchant';

export const ACCESS_TTL_SECONDS = Number(process.env.AUTH_ACCESS_TTL_SEC ?? 900); // ≤15m (SEC-A3)
export const REFRESH_TTL_SECONDS = Number(process.env.AUTH_REFRESH_TTL_SEC ?? 604_800); // 7d
// Secure cookies are required in production (SEC-A3). Disable only for local http
// dev via COOKIE_SECURE=false.
const COOKIE_SECURE = process.env.COOKIE_SECURE !== 'false';

export const accessCookieName = (realm: Realm): string => `ic_${realm}_session`;
export const refreshCookieName = (realm: Realm): string => `ic_${realm}_refresh`;

export function setAuthCookies(
  res: Response,
  realm: Realm,
  accessToken: string,
  refreshToken: string,
): void {
  // httpOnly + Secure + SameSite (SEC-A3). Realm-scoped names keep admin and
  // merchant sessions separate (SEC-A4).
  const base = { httpOnly: true, secure: COOKIE_SECURE, sameSite: 'strict' as const, path: '/' };
  res.cookie(accessCookieName(realm), accessToken, { ...base, maxAge: ACCESS_TTL_SECONDS * 1000 });
  res.cookie(refreshCookieName(realm), refreshToken, {
    ...base,
    maxAge: REFRESH_TTL_SECONDS * 1000,
  });
}

export function clearAuthCookies(res: Response, realm: Realm): void {
  res.clearCookie(accessCookieName(realm), { path: '/' });
  res.clearCookie(refreshCookieName(realm), { path: '/' });
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0) out[part.slice(0, eq).trim()] = decodeURIComponent(part.slice(eq + 1).trim());
  }
  return out;
}
