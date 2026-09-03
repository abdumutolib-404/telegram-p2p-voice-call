import ipaddr from 'ipaddr.js';
import { getRedis } from '../../config/redis';
import { logger } from '../../utils/logger';

export interface CrawlerFeedConfig {
  name: string;
  url: string;
  uaPattern: RegExp;
}

export const CRAWLER_FEEDS: CrawlerFeedConfig[] = [
  {
    name: 'OpenAI-GPTBot',
    url: 'https://openai.com/gptbot.json',
    uaPattern: /GPTBot/i,
  },
  {
    name: 'OpenAI-SearchBot',
    url: 'https://openai.com/searchbot.json',
    uaPattern: /OAI-SearchBot/i,
  },
  {
    name: 'OpenAI-ChatGPTUser',
    url: 'https://openai.com/chatgpt-user.json',
    uaPattern: /ChatGPT-User/i,
  },
  {
    name: 'Anthropic-ClaudeBot',
    url: 'https://claude.com/crawling/bots.json',
    uaPattern: /ClaudeBot|Claude-Web|anthropic-ai/i,
  },
  {
    name: 'Google-Googlebot',
    url: 'https://developers.google.com/static/search/apis/ipranges/googlebot.json',
    uaPattern: /Googlebot|Google-Extended/i,
  },
  {
    name: 'Google-SpecialCrawlers',
    url: 'https://developers.google.com/static/search/apis/ipranges/special-crawlers.json',
    uaPattern: /GoogleOther|Google-InspectionTool|Storebot-Google/i,
  },
];

export interface PrefixItem {
  ipv4Prefix?: string;
  ipv6Prefix?: string;
}

export interface VendorFeedResponse {
  creationTime?: string;
  prefixes?: PrefixItem[];
}

// In-memory cache of parsed CIDR ranges by feed name
const memoryPrefixCache = new Map<string, { prefixes: string[]; expiresAt: number }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const REDIS_KEY_PREFIX = 'pairtalk:crawler:prefixes:';

/**
 * Normalizes an IP string (including IPv4-mapped IPv6 like ::ffff:1.2.3.4)
 */
export function parseClientIp(rawIp: string): ipaddr.IPv4 | ipaddr.IPv6 | null {
  try {
    const cleanIp = rawIp.trim();
    let addr = ipaddr.parse(cleanIp);
    if (addr instanceof ipaddr.IPv6 && addr.isIPv4MappedAddress()) {
      addr = addr.toIPv4Address();
    }
    return addr;
  } catch {
    return null;
  }
}

/**
 * Checks if an IP matches a CIDR range string (e.g. 192.168.1.0/24 or 2001:db8::/32)
 */
export function isIpInCidr(parsedIp: ipaddr.IPv4 | ipaddr.IPv6, cidrStr: string): boolean {
  try {
    const [range, prefixLength] = ipaddr.parseCIDR(cidrStr.trim());
    if (parsedIp.kind() !== range.kind()) {
      return false;
    }
    return parsedIp.match(range, prefixLength);
  } catch {
    return false;
  }
}

/**
 * Fetches vendor IP prefixes from endpoint with fallback to Redis and memory cache
 */
export async function fetchFeedPrefixes(feed: CrawlerFeedConfig, force = false): Promise<string[]> {
  const now = Date.now();
  const cached = memoryPrefixCache.get(feed.name);
  if (!force && cached && cached.expiresAt > now) {
    return cached.prefixes;
  }

  const redis = getRedis();
  const redisKey = `${REDIS_KEY_PREFIX}${feed.name}`;

  if (!force) {
    try {
      const redisCached = await redis.get(redisKey);
      if (redisCached) {
        const parsed = JSON.parse(redisCached) as string[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          memoryPrefixCache.set(feed.name, { prefixes: parsed, expiresAt: now + CACHE_TTL_MS });
          return parsed;
        }
      }
    } catch {
      // ignore redis error
    }
  }

  // Fetch live from vendor endpoint
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(feed.url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'PairTalk-CrawlerVerifier/1.0' },
    });
    clearTimeout(timeout);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} from ${feed.url}`);
    }

    const data = (await res.json()) as VendorFeedResponse;
    if (!data || !Array.isArray(data.prefixes)) {
      throw new Error(`Invalid prefix payload from ${feed.url}`);
    }

    const prefixes: string[] = [];
    for (const item of data.prefixes) {
      if (item.ipv4Prefix) prefixes.push(item.ipv4Prefix);
      if (item.ipv6Prefix) prefixes.push(item.ipv6Prefix);
    }

    memoryPrefixCache.set(feed.name, { prefixes, expiresAt: now + CACHE_TTL_MS });

    try {
      await redis.set(redisKey, JSON.stringify(prefixes), 'EX', 86400); // 24h
    } catch {
      // ignore
    }

    logger.info(`Refreshed IP prefixes for crawler feed ${feed.name}`, {
      service: 'crawlerVerifier',
      feed: feed.name,
      count: prefixes.length,
    });

    return prefixes;
  } catch (err: unknown) {
    logger.warn(`Failed fetching live prefix feed for ${feed.name}`, {
      service: 'crawlerVerifier',
      feed: feed.name,
      error: err instanceof Error ? err.message : String(err),
    });

    // Fallback to stale cache if available
    if (cached && cached.prefixes.length > 0) {
      return cached.prefixes;
    }
    return [];
  }
}

/**
 * Prime all crawler feed caches in parallel
 */
export async function primeAllCrawlerCaches(): Promise<void> {
  await Promise.allSettled(CRAWLER_FEEDS.map((f) => fetchFeedPrefixes(f, false)));
}

export interface VerifyCrawlerResult {
  isCrawlerUa: boolean;
  isVerified: boolean;
  isSpoofed: boolean;
  crawlerName?: string;
  matchedFeed?: string;
}

/**
 * Verifies if an incoming HTTP request is a genuine crawler from published IP ranges
 */
export async function verifyCrawler(ip: string, userAgent?: string): Promise<VerifyCrawlerResult> {
  const ua = userAgent || '';
  if (!ua) {
    return { isCrawlerUa: false, isVerified: false, isSpoofed: false };
  }

  // Check which feed matches the User-Agent
  const matchingFeed = CRAWLER_FEEDS.find((feed) => feed.uaPattern.test(ua));
  if (!matchingFeed) {
    return { isCrawlerUa: false, isVerified: false, isSpoofed: false };
  }

  const parsedIp = parseClientIp(ip);
  if (!parsedIp) {
    return {
      isCrawlerUa: true,
      isVerified: false,
      isSpoofed: true,
      crawlerName: matchingFeed.name,
    };
  }

  // Load CIDR prefixes for the matching feed
  const prefixes = await fetchFeedPrefixes(matchingFeed);
  if (prefixes.length === 0) {
    // If prefixes could not be loaded, avoid false-positive ban
    return {
      isCrawlerUa: true,
      isVerified: false,
      isSpoofed: false,
      crawlerName: matchingFeed.name,
    };
  }

  // Check if IP belongs to any CIDR prefix
  const isMatch = prefixes.some((cidr) => isIpInCidr(parsedIp, cidr));

  if (isMatch) {
    return {
      isCrawlerUa: true,
      isVerified: true,
      isSpoofed: false,
      crawlerName: matchingFeed.name,
      matchedFeed: matchingFeed.url,
    };
  }

  // UA claimed to be crawler, but IP failed published CIDR match!
  return {
    isCrawlerUa: true,
    isVerified: false,
    isSpoofed: true,
    crawlerName: matchingFeed.name,
  };
}
