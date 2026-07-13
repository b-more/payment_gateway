import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

// SSRF guard for outbound merchant webhooks (SEC). Merchants supply their own
// callback URL, so we must ensure it can't be pointed at internal services or
// cloud metadata. We reject non-http(s) schemes and any host that is — or
// resolves to — a private / loopback / link-local / reserved address.

export class UnsafeWebhookUrlError extends Error {
  readonly code = 'UNSAFE_WEBHOOK_URL';
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeWebhookUrlError';
  }
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const o = Number(p);
    if (!Number.isInteger(o) || o < 0 || o > 255) return null;
    n = n * 256 + o;
  }
  return n >>> 0;
}

function isPrivateIpv4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  if (n === null) return true; // unparseable -> treat as unsafe
  const inRange = (base: string, bits: number): boolean => {
    const b = ipv4ToInt(base);
    if (b === null) return false;
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (n & mask) === (b & mask);
  };
  return (
    inRange('0.0.0.0', 8) ||        // "this" network / 0.0.0.0
    inRange('10.0.0.0', 8) ||       // private
    inRange('100.64.0.0', 10) ||    // CGNAT
    inRange('127.0.0.0', 8) ||      // loopback
    inRange('169.254.0.0', 16) ||   // link-local incl. 169.254.169.254 metadata
    inRange('172.16.0.0', 12) ||    // private
    inRange('192.0.0.0', 24) ||     // IETF protocol assignments
    inRange('192.168.0.0', 16) ||   // private
    inRange('198.18.0.0', 15) ||    // benchmarking
    inRange('224.0.0.0', 4) ||      // multicast
    inRange('240.0.0.0', 4)         // reserved
  );
}

function isPrivateIpv6(ip: string): boolean {
  const a = ip.toLowerCase().split('%')[0]; // strip zone id
  if (a === '::1' || a === '::') return true; // loopback / unspecified
  // IPv4-mapped / -compatible (::ffff:1.2.3.4) — validate the embedded IPv4
  const mapped = /(?:::ffff:)(\d+\.\d+\.\d+\.\d+)$/i.exec(a) ?? /::(\d+\.\d+\.\d+\.\d+)$/.exec(a);
  if (mapped) return isPrivateIpv4(mapped[1]);
  const first = a.split(':')[0];
  const hextet = parseInt(first || '0', 16);
  if (Number.isNaN(hextet)) return true;
  if ((hextet & 0xfe00) === 0xfc00) return true; // fc00::/7 unique-local
  if ((hextet & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  return false;
}

function isPrivateIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) return isPrivateIpv4(ip);
  if (v === 6) return isPrivateIpv6(ip);
  return true; // not a valid IP literal -> unsafe
}

/** Fast, DNS-free checks (scheme + literal-IP host). Used at save time. */
export function assertSafeWebhookScheme(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new UnsafeWebhookUrlError('callback URL is not a valid URL');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new UnsafeWebhookUrlError(`callback URL scheme must be http(s), got ${url.protocol}`);
  }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host) && isPrivateIp(host)) {
    throw new UnsafeWebhookUrlError('callback URL points at a private/reserved address');
  }
  return url;
}

/** Full check incl. DNS resolution. Throws UnsafeWebhookUrlError if unsafe. */
export async function assertSafeWebhookUrl(rawUrl: string): Promise<void> {
  const url = assertSafeWebhookScheme(rawUrl);
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host)) return; // already validated as a public literal
  let addrs: Array<{ address: string }>;
  try {
    addrs = await lookup(host, { all: true });
  } catch {
    throw new UnsafeWebhookUrlError(`callback URL host does not resolve: ${host}`);
  }
  if (addrs.length === 0) throw new UnsafeWebhookUrlError(`callback URL host does not resolve: ${host}`);
  for (const a of addrs) {
    if (isPrivateIp(a.address)) {
      throw new UnsafeWebhookUrlError('callback URL resolves to a private/reserved address');
    }
  }
}
