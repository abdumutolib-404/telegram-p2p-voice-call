import { Request } from 'express';

/**
 * Escapes HTML control characters in dynamic strings to prevent HTML injection / XSS
 * in Telegram Bot HTML messages and admin notifications.
 */
export function escapeHtml(str: string | number | null | undefined): string {
  if (str === null || str === undefined) {
    return '';
  }
  const text = String(str);
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Validates whether an IP address is a private, loopback, or cloud-metadata address.
 */
function isPrivateOrReservedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().trim().replace(/^\[|\]$/g, '');

  if (
    host === 'localhost' ||
    host === '::1' ||
    host === '0.0.0.0' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host === 'metadata.google.internal' ||
    host === 'instance-data'
  ) {
    return true;
  }

  // IPv4 regex check
  const ipv4Match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const octets = ipv4Match.slice(1, 5).map(Number);
    if (octets.some((o) => o < 0 || o > 255)) {
      return true;
    }
    const [o0, o1] = octets;

    // 127.0.0.0/8 (Loopback)
    if (o0 === 127) return true;
    // 10.0.0.0/8 (Private)
    if (o0 === 10) return true;
    // 172.16.0.0/12 (Private)
    if (o0 === 172 && o1 >= 16 && o1 <= 31) return true;
    // 192.168.0.0/16 (Private)
    if (o0 === 192 && o1 === 168) return true;
    // 169.254.0.0/16 (Link-local / Cloud metadata: 169.254.169.254)
    if (o0 === 169 && o1 === 254) return true;
    // 0.0.0.0/8 (Current network)
    if (o0 === 0) return true;
  }

  return false;
}

/**
 * Approved storage and CDN domain patterns for SSRF prevention.
 */
const APPROVED_STORAGE_DOMAIN_PATTERNS = [
  // AWS S3
  /^(?:[a-zA-Z0-9.\-_]+\.)?s3(?:[.-][a-zA-Z0-9\-_]+)?\.amazonaws\.com$/i,
  /^s3\.amazonaws\.com$/i,
  // Cloudflare R2
  /^(?:[a-zA-Z0-9.\-_]+\.)?r2\.cloudflarestorage\.com$/i,
  /^(?:[a-zA-Z0-9.\-_]+\.)?r2\.dev$/i,
  // Google Cloud Storage
  /^(?:[a-zA-Z0-9.\-_]+\.)?storage\.googleapis\.com$/i,
  // PairTalk domains
  /^(?:[a-zA-Z0-9.\-_]+\.)?pairtalk\.online$/i,
  // Telegram CDN
  /^(?:[a-zA-Z0-9.\-_]+\.)?telegram\.org$/i,
];

/**
 * Validates if an external URL is safe against SSRF attacks:
 * 1. Must use HTTPS protocol.
 * 2. Hostname must not resolve to localhost, private IP, or cloud metadata.
 * 3. Hostname must match approved S3/R2/GCS/PairTalk storage patterns.
 */
export function isSafeStorageUrl(urlString: string): boolean {
  if (!urlString || typeof urlString !== 'string') {
    return false;
  }

  try {
    const parsed = new URL(urlString.trim());

    // Protocol must strictly be HTTPS
    if (parsed.protocol !== 'https:') {
      return false;
    }

    const host = parsed.hostname;
    if (!host || isPrivateOrReservedHost(host)) {
      return false;
    }

    // Must match approved storage domain pattern
    return APPROVED_STORAGE_DOMAIN_PATTERNS.some((pattern) => pattern.test(host));
  } catch {
    return false;
  }
}

/**
 * Validates and sanitizes a URL or base64 data URI.
 * Returns the sanitized string or null if unsafe/invalid.
 */
export function sanitizeUrl(urlOrData: string): string | null {
  if (!urlOrData || typeof urlOrData !== 'string') {
    return null;
  }

  const trimmed = urlOrData.trim();

  // Allow safe image base64 data URIs
  if (trimmed.startsWith('data:image/')) {
    const isBase64Valid = /^data:image\/(?:png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(trimmed);
    return isBase64Valid ? trimmed : null;
  }

  if (isSafeStorageUrl(trimmed)) {
    return trimmed;
  }

  return null;
}

/**
 * Standardized client IP extraction helper.
 * Prioritizes trusted Cloudflare `cf-connecting-ip`, then falls back to Express `req.ip`
 * or socket address, preventing leftmost spoofing on untrusted `X-Forwarded-For`.
 */
export function extractClientIp(req: Request): string {
  const cfIp = req.headers['cf-connecting-ip'];
  if (typeof cfIp === 'string' && cfIp.trim()) {
    return cfIp.trim();
  }
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

export const getClientIp = extractClientIp;
