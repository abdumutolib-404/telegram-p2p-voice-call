import { Request, Response, NextFunction } from 'express';
import { getRedis } from '../config/redis';
import { logger } from '../utils/logger';
import { verifyCrawler } from '../services/crawler/verifyCrawler';

// In-memory fallback cache for jailed IPs when Redis is disconnected
const memoryJailedIps = new Map<string, number>();

// Consecutive 404 tracking for heuristic anomaly banishment
const anomaly404Tracker = new Map<string, { count: number; firstAt: number }>();

const PROBE_PATTERNS = [
  // Env and configuration leaks
  /\.env(?:\.|$|\/|~)/i,
  /\.git(?:\.|$|\/)/i,
  /\.aws(?:\.|$|\/)/i,
  /\.docker(?:\.|$|\/)/i,
  /\.terraform(?:\.|$|\/)/i,
  /\.s3cfg/i,
  /\.gitlab-ci/i,
  /\.boto/i,
  /\.netrc/i,
  /\.git-credentials/i,
  // PHP / Legacy / CGI exploit probes
  /phpinfo/i,
  /\.php(?:\?|$)/i,
  /\.cgi(?:\?|$)/i,
  /\.asp(?:x)?(?:\?|$)/i,
  /\.jsp(?:\?|$)/i,
  // Known CMS / WordPress scanners
  /\/wp-json/i,
  /\/wp-content/i,
  /\/wp-admin/i,
  /\/xmlrpc\.php/i,
  /\/wordpress/i,
  // Infrastructure configs & credentials
  /docker-compose/i,
  /serverless\.y(?:a)?ml/i,
  /amplify\.y(?:a)?ml/i,
  /appsettings(?:\..+)?\.json/i,
  /terraform\.tfstate/i,
  /s3\.(?:secret|key|yaml|yml|properties)/i,
  /aws_credentials/i,
  /aws_s3_/i,
  /stripe-credentials/i,
  /stripe-keys/i,
  // Server debuggers and profilers
  /\/_profiler/i,
  /\/actuator/i,
  /\/cgi-bin/i,
  /\/webmin/i,
  /\/etc\/passwd/i,
  /\/etc\/apache2/i,
  /\/var\/www/i,
  /\/var\/task/i,
  /\[\.\.\.catchall\]/i,
  /\[tenant\]/i,
  /\[workspace\]/i,
  /\[locale\]/i,
  /\[slug\]/i,
];

function decodeSafely(uri: string): string {
  try {
    return decodeURIComponent(uri);
  } catch {
    return uri;
  }
}

import { getClientIp, extractClientIp } from '../utils/sanitize';
export { getClientIp, extractClientIp };

export async function isIpJailed(ip: string): Promise<boolean> {
  if (!ip || ip === 'unknown' || ip === '127.0.0.1' || ip === '::1') {
    return false;
  }

  const now = Date.now();
  const memExp = memoryJailedIps.get(ip);
  if (memExp && memExp > now) {
    return true;
  }

  try {
    const redis = getRedis();
    const exists = await redis.exists(`shield:jail:${ip}`);
    if (exists) {
      memoryJailedIps.set(ip, now + 3600 * 1000);
      return true;
    }
  } catch {
    // Redis offline, fallback to memory
  }

  return false;
}

export async function jailIp(ip: string, reason: string, path: string): Promise<void> {
  if (!ip || ip === 'unknown' || ip === '127.0.0.1' || ip === '::1') {
    return;
  }

  const durationSec = 86400; // 24-hour banishment
  memoryJailedIps.set(ip, Date.now() + durationSec * 1000);

  try {
    const redis = getRedis();
    await redis.set(`shield:jail:${ip}`, reason, 'EX', durationSec);
  } catch {
    // Memory fallback preserved
  }

  logger.warn(`[Shield 🛡️ Bot Banned] IP: ${ip} jailed for 24h. Reason: ${reason} (Path: ${path.slice(0, 100)})`, {
    service: 'shield',
    event: 'ip_jailed',
    ip,
    reason,
    path: path.slice(0, 100),
  });
}

export function isExploitProbe(path: string): boolean {
  return PROBE_PATTERNS.some((pattern) => pattern.test(path));
}

/**
 * Pre-Routing Scanner Shield Middleware
 * Drops jailed IPs and instantly bans automated vulnerability scanners
 */
export async function scannerShieldMiddleware(req: Request, res: Response, next: NextFunction) {
  const ip = getClientIp(req);
  const rawUrl = req.originalUrl || req.url || '';
  const decoded = decodeSafely(rawUrl);
  const userAgent = req.headers['user-agent'];

  // 0. Pre-check Crawler Authenticity
  const crawlerCheck = await verifyCrawler(ip, userAgent);

  // If a request spoofs a known crawler User-Agent from an unauthorized IP:
  if (crawlerCheck.isSpoofed) {
    await jailIp(ip, `Spoofed Crawler User-Agent (${crawlerCheck.crawlerName})`, decoded);
    res.status(403).setHeader('Connection', 'close').end();
    return;
  }

  // 1. Fast reject jailed IPs (genuine crawlers are never jailed)
  if (!crawlerCheck.isVerified && (await isIpJailed(ip))) {
    res.status(403).setHeader('Connection', 'close').end();
    return;
  }

  // 2. Exploit Probe Detection
  if (isExploitProbe(decoded)) {
    await jailIp(ip, 'Malicious Scanner Probe', decoded);
    res.status(403).setHeader('Connection', 'close').end();
    return;
  }

  // 3. Track 404s after response finish for heuristic brute-force banishment (skip for genuine verified crawlers)
  if (!crawlerCheck.isVerified) {
    res.on('finish', () => {
      if (res.statusCode === 404) {
        const now = Date.now();
        const current = anomaly404Tracker.get(ip) || { count: 0, firstAt: now };
        if (now - current.firstAt > 30000) {
          // Reset window every 30s
          anomaly404Tracker.set(ip, { count: 1, firstAt: now });
        } else {
          current.count += 1;
          anomaly404Tracker.set(ip, current);
          if (current.count >= 15) {
            // Banish aggressive 404 scrapers
            anomaly404Tracker.delete(ip);
            jailIp(ip, 'Excessive 404 Anomaly (>15 in 30s)', decoded).catch(() => {});
          }
        }
      }
    });
  }

  next();
}
