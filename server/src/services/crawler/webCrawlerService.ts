import * as cheerio from 'cheerio';
import { IeltsPart } from '@prisma/client';
import { RawCandidateQuestion, CrawlTargetSource, VERIFIED_CRAWLER_TARGETS } from './sources';
import { classifyTopic, cleanSubjectFromHeading, extractSubjectFromUrl, detectGroupStrongSubject } from './taxonomy';
import { getRedis } from '../../config/redis';
import { logger } from '../../utils/logger';

function stripHtml(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<p\b[^>]*>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '\n• ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/&rdquo;/g, '"')
    .replace(/&ldquo;/g, '"')
    .replace(/&ndash;/g, '-')
    .replace(/&mdash;/g, '--')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export class WebCrawlerService {
  private readonly defaultTimeoutMs = 12000;
  private readonly userAgent = 'PairTalk-ExamCrawler/2.0 (+https://pairtalk.online)';
  private readonly visitedSetKey = 'pairtalk:crawler:visited_urls';
  private readonly inMemoryVisited = new Set<string>();
  private readonly minDomainDelayMs = 750; // Polite 750ms spacing between requests to same domain
  private readonly domainLastRequest = new Map<string, number>();
  private readonly domainQueues = new Map<string, Promise<void>>();

  /**
   * Normalizes a URL by trimming trailing slashes, stripping hashes and tracking queries.
   */
  public normalizeUrl(rawUrl: string): string {
    try {
      const parsed = new URL(rawUrl);
      parsed.hash = '';
      const searchParams = new URLSearchParams(parsed.search);
      const trackingKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid'];
      for (const k of trackingKeys) {
        searchParams.delete(k);
      }
      parsed.search = searchParams.toString();

      let pathname = parsed.pathname;
      if (pathname.length > 1 && pathname.endsWith('/')) {
        pathname = pathname.slice(0, -1);
      }
      parsed.pathname = pathname;
      return parsed.toString();
    } catch {
      return rawUrl.trim();
    }
  }

  /**
   * Checks whether a URL has already been crawled using Redis crawl memory.
   */
  public async isUrlVisited(url: string): Promise<boolean> {
    const normalized = this.normalizeUrl(url);
    try {
      const redis = getRedis();
      const isMember = await redis.sismember(this.visitedSetKey, normalized);
      return isMember === 1 || this.inMemoryVisited.has(normalized);
    } catch {
      return this.inMemoryVisited.has(normalized);
    }
  }

  /**
   * Marks a URL as crawled in Redis set pairtalk:crawler:visited_urls.
   */
  public async markUrlVisited(url: string): Promise<void> {
    const normalized = this.normalizeUrl(url);
    this.inMemoryVisited.add(normalized);
    try {
      const redis = getRedis();
      await redis.sadd(this.visitedSetKey, normalized);
    } catch {
      // Redis unavailable; in-memory set handles this cycle
    }
  }

  /**
   * Extracts internal <a href="..."> links matching IELTS patterns (/part-1/, /part-2/, /speaking/, /cue-card/, /topics/).
   */
  public extractInternalIeltsLinks(html: string, baseUrl: string): string[] {
    const links: string[] = [];
    const seen = new Set<string>();
    let baseHost = '';
    try {
      baseHost = new URL(baseUrl).hostname.toLowerCase();
    } catch {
      return [];
    }

    const ieltsPattern = /(?:part-?[123]|speaking|cue-card|topics)/i;
    const assetPattern = /\.(?:jpg|jpeg|png|gif|svg|webp|pdf|css|js|xml|zip|mp3|mp4|json|ico)$/i;

    const hrefRegex = /<a\b[^>]*?\bhref=["']([^"']+)["'][^>]*>/gi;
    let match: RegExpExecArray | null;

    while ((match = hrefRegex.exec(html)) !== null) {
      const rawHref = match[1].trim();
      if (!rawHref || rawHref.startsWith('#') || rawHref.startsWith('javascript:') || rawHref.startsWith('mailto:') || rawHref.startsWith('tel:')) {
        continue;
      }

      try {
        const resolved = new URL(rawHref, baseUrl);
        const resolvedHost = resolved.hostname.toLowerCase();

        if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') {
          continue;
        }

        const isInternal = resolvedHost === baseHost || resolvedHost.endsWith('.' + baseHost) || baseHost.endsWith('.' + resolvedHost);
        if (!isInternal) {
          continue;
        }

        if (assetPattern.test(resolved.pathname)) {
          continue;
        }

        if (!ieltsPattern.test(resolved.pathname)) {
          continue;
        }

        const normalized = this.normalizeUrl(resolved.href);
        const normalizedBase = this.normalizeUrl(baseUrl);
        if (normalized !== normalizedBase && !seen.has(normalized)) {
          seen.add(normalized);
          links.push(normalized);
        }
      } catch {
        // Skip invalid URLs
      }
    }

    return links;
  }

  /**
   * Extracts the topic name from the subpage's <h1> or <h2> heading, <title>, or URL slug.
   * e.g. <h1>Perfume - IELTS Speaking Part 1</h1> -> "Perfumes & Scents"
   */
  public extractTopicNameFromHtmlOrUrl(html: string, sourceUrl: string): string | null {
    // 1. Try <h1>
    const h1Match = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
    if (h1Match && h1Match[1]) {
      const topic = cleanSubjectFromHeading(h1Match[1]);
      if (topic) return topic;
    }

    // 2. Try <h2>
    const h2Match = html.match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/i);
    if (h2Match && h2Match[1]) {
      const topic = cleanSubjectFromHeading(h2Match[1]);
      if (topic) return topic;
    }

    // 3. Try <title>
    const titleMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
    if (titleMatch && titleMatch[1]) {
      const topic = cleanSubjectFromHeading(titleMatch[1]);
      if (topic) return topic;
    }

    // 4. Fallback to URL slug
    return extractSubjectFromUrl(sourceUrl);
  }

  /**
   * SSRF Protection: Validates whether a target URL is safe for external crawling:
   * 1. Protocol must strictly be HTTP or HTTPS.
   * 2. Hostname must NOT resolve to localhost, private IP (10/8, 172.16/12, 192.168/16),
   *    loopback (127/8), or cloud metadata services (169.254.169.254).
   */
  public isSafeCrawlerUrl(urlStr: string): boolean {
    if (!urlStr || typeof urlStr !== 'string') return false;
    try {
      const parsed = new URL(urlStr.trim());
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return false;
      }
      const host = parsed.hostname.toLowerCase().trim().replace(/^\[|\]$/g, '');
      if (
        !host ||
        host === 'localhost' ||
        host === '::1' ||
        host === '0.0.0.0' ||
        host.endsWith('.localhost') ||
        host.endsWith('.local') ||
        host.endsWith('.internal') ||
        host === 'metadata.google.internal' ||
        host === 'instance-data'
      ) {
        return false;
      }

      // Check IPv4 ranges: private, loopback, link-local / metadata (169.254.169.254)
      const ipv4Match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
      if (ipv4Match) {
        const octets = ipv4Match.slice(1, 5).map(Number);
        if (octets.some((o) => o < 0 || o > 255)) return false;
        const [o0, o1] = octets;
        if (o0 === 127 || o0 === 10 || o0 === 0) return false;
        if (o0 === 172 && o1 >= 16 && o1 <= 31) return false;
        if (o0 === 192 && o1 === 168) return false;
        if (o0 === 169 && o1 === 254) return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Serializes requests per target domain to cap concurrency at 1 and enforces polite spacing delay (750ms).
   */
  private async runWithDomainLimiter<T>(domain: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.domainQueues.get(domain) ?? Promise.resolve();
    let release: (() => void) | undefined;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.domainQueues.set(domain, current);

    await previous.catch(() => undefined);
    try {
      const lastTime = this.domainLastRequest.get(domain) ?? 0;
      const elapsed = Date.now() - lastTime;
      if (elapsed < this.minDomainDelayMs) {
        await new Promise((resolve) => setTimeout(resolve, this.minDomainDelayMs - elapsed));
      }
      this.domainLastRequest.set(domain, Date.now());
      return await fn();
    } finally {
      this.domainLastRequest.set(domain, Date.now());
      release?.();
      if (this.domainQueues.get(domain) === current) {
        this.domainQueues.delete(domain);
      }
    }
  }

  /**
   * Fetches raw HTML from a given URL with timeout, user-agent, polite domain-level rate limiting,
   * concurrency caps, and exponential backoff on HTTP 429/503 responses.
   */
  public async fetchHtml(url: string, maxRetries = 2): Promise<string | null> {
    if (!this.isSafeCrawlerUrl(url)) {
      logger.warn('SSRF protection: Crawler blocked request to unsafe or private target', {
        service: 'crawler',
        event: 'crawler_ssrf_blocked',
        url,
      });
      return null;
    }
    let domain = 'unknown-target';
    try {
      domain = new URL(url).hostname.toLowerCase();
    } catch {
      // ignore
    }

    return await this.runWithDomainLimiter(domain, async () => {
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), this.defaultTimeoutMs);

          let response: Response;
          try {
            response = await fetch(url, {
              signal: controller.signal,
              headers: {
                'User-Agent': this.userAgent,
                Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
              },
            });
          } finally {
            clearTimeout(timeoutId);
          }

          if (response.status === 429 || response.status === 503) {
            const retryHeader = response.headers.get('retry-after');
            let backoffMs = Math.min(10000, 1000 * Math.pow(2, attempt));
            if (retryHeader) {
              const parsed = parseInt(retryHeader, 10);
              if (!isNaN(parsed) && parsed > 0) {
                backoffMs = Math.min(30000, parsed * 1000);
              }
            }
            logger.warn(`Crawler hit HTTP ${response.status} on ${domain}. Exponential backoff for ${backoffMs}ms (attempt ${attempt + 1}/${maxRetries + 1})`, {
              service: 'crawler',
              url,
              status: response.status,
              backoffMs,
            });
            if (attempt < maxRetries) {
              await new Promise((resolve) => setTimeout(resolve, backoffMs));
              continue;
            }
            return null;
          }

          if (!response.ok) {
            logger.warn(`Crawler fetch returned HTTP status ${response.status}`, {
              service: 'crawler',
              url,
              status: response.status,
            });
            return null;
          }

          return await response.text();
        } catch (error: any) {
          if (attempt < maxRetries) {
            const backoffMs = 1000 * Math.pow(2, attempt);
            await new Promise((resolve) => setTimeout(resolve, backoffMs));
            continue;
          }
          logger.warn(`Crawler could not reach URL ${url}: ${error?.message || String(error)}`, {
            service: 'crawler',
            url,
          });
          return null;
        }
      }
      return null;
    });
  }

  /**
   * Parses HTML content and extracts IELTS questions.
   * Eliminates defaultTopicSlug override: Always executes classifyTopic(text, bullets)
   * so questions are evaluated by their actual content.
   */
  /**
   * Parses HTML content and extracts IELTS questions.
   * Utilizes hierarchical section heading extraction (h2, h3, h4, strong),
   * context inheritance for questions under subtopics, and merges dependent fragments (e.g. "And how?").
   */
  public parseHtmlContent(html: string, sourceUrl: string): RawCandidateQuestion[] {
    if (!html || typeof html !== 'string') {
      return [];
    }

    // 1. Strip all non-article, sidebars, comments, and navigation DOM nodes with Cheerio
    const $ = cheerio.load(html);
    $('script, style, noscript, #comments, .comments, .comment-list, .comment-respond, .comment-body, .wp-block-comments, aside, .sidebar, footer, nav, .entry-meta, .author-box, .widget, .advertisement, .share-buttons').remove();
    const sanitizedHtml = $.html();

    const pageTopicName = this.extractTopicNameFromHtmlOrUrl(sanitizedHtml, sourceUrl);

    // Pre-process HTML to preserve section headings as structured markers before stripping HTML
    const preprocessedHtml = sanitizedHtml
      .replace(/<(h[1-6])\b[^>]*>([\s\S]*?)<\/\1>/gi, (_match, _tag, content) => {
        return `\n[[SECTION_HEADING: ${content.trim()}]]\n`;
      })
      .replace(/<p\b[^>]*>\s*<strong\b[^>]*>([\s\S]*?)<\/strong>\s*<\/p>/gi, (_match, content) => {
        return `\n[[SECTION_HEADING: ${content.trim()}]]\n`;
      });

    const text = stripHtml(preprocessedHtml);
    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 2);

    interface IntermediateQuestion {
      part: IeltsPart;
      questionText: string;
      cueCardBullets?: string | null;
      questionType?: string;
      sectionTopic?: string | null;
    }

    const intermediateList: IntermediateQuestion[] = [];
    let currentPart: IeltsPart = 'PART_1';
    let currentCuePrompt: string | null = null;
    let currentCueBullets: string[] = [];
    let currentSectionTopic: string | null = null;

    const flushCueCard = () => {
      if (currentCuePrompt) {
        intermediateList.push({
          part: 'PART_2',
          questionText: currentCuePrompt,
          cueCardBullets: currentCueBullets.length > 0 ? JSON.stringify(currentCueBullets) : null,
          questionType: 'CUE_CARD',
          sectionTopic: currentSectionTopic || pageTopicName,
        });
      }
      currentCuePrompt = null;
      currentCueBullets = [];
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lower = line.toLowerCase();

      // Detect and record Section Headings (e.g. [[SECTION_HEADING: Accommodation]])
      if (line.startsWith('[[SECTION_HEADING:') && line.endsWith(']]')) {
        flushCueCard();
        const rawHeading = line.slice(18, -2).trim();
        const cleanedHeading = cleanSubjectFromHeading(rawHeading);
        if (cleanedHeading && cleanedHeading.length >= 3) {
          currentSectionTopic = cleanedHeading;
        }
        continue;
      }

      // Section markers
      if (lower.includes('part 1') || lower.includes('speaking part one')) {
        flushCueCard();
        currentPart = 'PART_1';
        continue;
      }
      if (lower.includes('part 2') || lower.includes('speaking part two') || lower.includes('cue card')) {
        flushCueCard();
        currentPart = 'PART_2';
        continue;
      }
      if (lower.includes('part 3') || lower.includes('speaking part three') || lower.includes('discussion questions')) {
        flushCueCard();
        currentPart = 'PART_3';
        continue;
      }

      // Standalone short section headers that might appear without headings
      if (!line.endsWith('?') && line.length >= 3 && line.length <= 40 && !line.startsWith('•') && !line.startsWith('-')) {
        const potentialTopic = cleanSubjectFromHeading(line);
        if (potentialTopic && potentialTopic.length >= 3) {
          currentSectionTopic = potentialTopic;
          continue;
        }
      }

      // Detect Part 2 Cue Card starting prompts: "Describe a...", "Describe an...", "Talk about..."
      if (
        /^(?:describe|talk about)\s+(?:a|an|the|someone|something|a time|a person|a place|an event)/i.test(line) &&
        line.length > 15 &&
        line.length < 280
      ) {
        flushCueCard();
        currentCuePrompt = line.replace(/^[•\-\d.]+\s*/, '').trim();
        currentPart = 'PART_2';
        continue;
      }

      // Collect Cue Card Bullets
      if (currentCuePrompt && (line.startsWith('•') || line.startsWith('-') || /^(?:what|where|when|who|why|how|and explain)/i.test(line))) {
        if (!lower.includes('you should say') && !lower.includes('preparation time')) {
          const cleanBullet = line.replace(/^[•\-\d.]+\s*/, '').trim();
          if (cleanBullet.length > 8 && cleanBullet.length < 200 && currentCueBullets.length < 6) {
            currentCueBullets.push(cleanBullet);
            continue;
          }
        }
      }

      // Detect General and Discussion Questions (ends with '?' or '?' followed by quotes/emojis)
      const isQuestionLine =
        line.endsWith('?') ||
        /[?？]["'”’\s]*$/u.test(line) ||
        /[?？].*(?:\p{Extended_Pictographic}|[\u{1F300}-\u{1FAFF}])/u.test(line);

      if (isQuestionLine) {
        if (
          lower.includes('how to prepare') ||
          lower.includes('privacy') ||
          lower.includes('cookie') ||
          lower.includes('subscribe') ||
          lower.includes('faq') ||
          lower.includes('comment')
        ) {
          continue;
        }

        const cleanQuestion = line.replace(/^(?:(?:q|question)\s*\d+[:.)\s]*|(?:[•\-\*]|\d+[:.)])\s*)+/i, '').trim();
        if (cleanQuestion.length < 5) continue;

        // Anaphoric / Dependent follow-up fragment detection
        // e.g. "And how?", "Why?", "Why or why not?", "In what way?", "And why?"
        const isDependentFragment =
          /^(?:and\s+(?:how|why|where|when|who|what|in\s+what\s+way)|why\s+or\s+why\s+not|how\s+come|why\?|why\s+not\?)\b/i.test(cleanQuestion) ||
          (cleanQuestion.length < 25 && /^(?:and\s+how|why|how\s+so|in\s+what\s+way)\??$/i.test(cleanQuestion));

        if (isDependentFragment && intermediateList.length > 0) {
          const prev = intermediateList[intermediateList.length - 1];
          let appendix = cleanQuestion.replace(/\?+$/, '').trim();
          if (/^and\b/i.test(appendix)) {
            appendix = appendix.charAt(0).toLowerCase() + appendix.slice(1);
            prev.questionText = prev.questionText.replace(/\?+$/, '').trim() + ', ' + appendix + '?';
          } else {
            prev.questionText = prev.questionText.replace(/\?+$/, '').trim() + '? ' + appendix + '?';
          }
          continue;
        }

        // Filter out excessively short non-fragment noise
        if (cleanQuestion.length < 20 && !cleanQuestion.includes(' ')) {
          continue;
        }

        // Normalize compound question strings within a single line
        // e.g. "Who helps you the most? And How?" -> "Who helps you the most, and how?"
        const normalizedQuestion = cleanQuestion
          .replace(/\?\s+and\s+how\?/gi, ', and how?')
          .replace(/\?\s+why\s+or\s+why\s+not\?/gi, '? Why or why not?')
          .replace(/\?\s+and\s+why\?/gi, ', and why?');

        const part = currentPart === 'PART_2' ? 'PART_3' : currentPart;
        intermediateList.push({
          part,
          questionText: normalizedQuestion,
          questionType: part === 'PART_3' ? 'DISCUSSION' : 'GENERAL',
          sectionTopic: currentSectionTopic || pageTopicName,
        });
      }
    }

    flushCueCard();

    // Group-level emergence detection across the questions on this page
    const groupSubject = detectGroupStrongSubject(intermediateList, pageTopicName, sourceUrl) || pageTopicName;

    // Convert to RawCandidateQuestion by evaluating each question's actual content and inherited section topic
    const finalQuestions: RawCandidateQuestion[] = intermediateList.map((item) => {
      const topicSubject = item.sectionTopic || groupSubject || pageTopicName;
      const topicSlug = classifyTopic(item.questionText, item.cueCardBullets, topicSubject);
      return {
        part: item.part,
        questionText: item.questionText,
        cueCardBullets: item.cueCardBullets ?? null,
        questionType: item.questionType || (item.part === 'PART_2' ? 'CUE_CARD' : 'GENERAL'),
        suggestedTopicSlug: topicSlug,
        extractedTopicName: topicSubject || undefined,
        source: 'WEB_CRAWLER',
        sourceUrl,
      };
    });

    return finalQuestions;
  }

  /**
   * Fetches a URL and extracts its questions. Optionally performs depth-1 spidering.
   */
  public async fetchAndExtractUrl(
    url: string,
    options?: { depth?: number; maxSubpages?: number; delayMs?: number },
  ): Promise<RawCandidateQuestion[]> {
    logger.info(`Crawling IELTS target URL: ${url}`, { service: 'crawler', url });
    await this.markUrlVisited(url);

    const html = await this.fetchHtml(url);
    if (!html) return [];

    const directQuestions = this.parseHtmlContent(html, url);

    if (options?.depth === 1) {
      const maxSubpages = options.maxSubpages ?? 10;
      const delayMs = options.delayMs ?? 200;
      const subLinks = this.extractInternalIeltsLinks(html, url);

      let fetchedSubpages = 0;
      for (const link of subLinks) {
        if (fetchedSubpages >= maxSubpages) break;
        const alreadyVisited = await this.isUrlVisited(link);
        if (alreadyVisited) continue;

        await this.markUrlVisited(link);
        if (delayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }

        const subHtml = await this.fetchHtml(link);
        if (subHtml) {
          const subQuestions = this.parseHtmlContent(subHtml, link);
          directQuestions.push(...subQuestions);
          fetchedSubpages++;
        }
      }
    }

    return directQuestions;
  }

  /**
   * Performs depth-1 link spidering on a target hub page.
   * Extracts internal IELTS subpage links, verifies against Redis crawl memory,
   * fetches subpages, and extracts candidate questions.
   */
  public async spiderHubUrl(
    hubUrl: string,
    maxSubpages = 10,
    delayMs = 250,
  ): Promise<RawCandidateQuestion[]> {
    logger.info(`Visiting IELTS hub page: ${hubUrl}`, { service: 'crawler', hubUrl });
    await this.markUrlVisited(hubUrl);

    const hubHtml = await this.fetchHtml(hubUrl);
    if (!hubHtml) return [];

    const collectedQuestions: RawCandidateQuestion[] = [...this.parseHtmlContent(hubHtml, hubUrl)];

    // Depth-1 link spidering: extract matching internal subpage links
    const subLinks = this.extractInternalIeltsLinks(hubHtml, hubUrl);
    logger.info(`Found ${subLinks.length} candidate internal IELTS links on ${hubUrl}`, {
      service: 'crawler',
      hubUrl,
      count: subLinks.length,
    });

    let subpagesCrawled = 0;
    for (const link of subLinks) {
      if (subpagesCrawled >= maxSubpages) {
        logger.info(`Reached maximum subpage crawl limit (${maxSubpages}) for hub ${hubUrl}`, {
          service: 'crawler',
          hubUrl,
        });
        break;
      }

      // Check Redis crawl memory
      const visited = await this.isUrlVisited(link);
      if (visited) {
        logger.debug(`Skipping previously crawled IELTS URL: ${link}`, { service: 'crawler', link });
        continue;
      }

      // Record in Redis crawl memory
      await this.markUrlVisited(link);

      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }

      logger.info(`Spidering depth-1 subpage: ${link}`, { service: 'crawler', link, hubUrl });
      const subHtml = await this.fetchHtml(link);
      if (!subHtml) continue;

      const subQuestions = this.parseHtmlContent(subHtml, link);
      collectedQuestions.push(...subQuestions);
      subpagesCrawled++;
    }

    logger.info(`Completed depth-1 spidering for ${hubUrl}: crawled ${subpagesCrawled} subpages, found ${collectedQuestions.length} total questions`, {
      service: 'crawler',
      hubUrl,
      subpagesCrawled,
      questionsFound: collectedQuestions.length,
    });

    return collectedQuestions;
  }

  /**
   * Crawls all configured sources with depth-1 spidering and Redis crawl memory.
   */
  public async crawlAllConfiguredSources(options?: {
    maxDepth1PagesPerTarget?: number;
    delayMs?: number;
  }): Promise<RawCandidateQuestion[]> {
    const allCrawled: RawCandidateQuestion[] = [];
    const maxSubpages = options?.maxDepth1PagesPerTarget ?? 10;
    const delayMs = options?.delayMs ?? 250;

    for (const target of VERIFIED_CRAWLER_TARGETS) {
      if (!target.enabled) continue;
      try {
        const results = await this.spiderHubUrl(target.url, maxSubpages, delayMs);
        allCrawled.push(...results);
      } catch (err: unknown) {
        logger.warn(`Depth-1 crawler encountered error on target ${target.url}`, {
          service: 'crawler',
          url: target.url,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return allCrawled;
  }
}

export const webCrawlerService = new WebCrawlerService();
