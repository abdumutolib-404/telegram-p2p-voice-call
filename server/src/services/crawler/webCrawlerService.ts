import { IeltsPart } from '@prisma/client';
import { RawCandidateQuestion, CrawlTargetSource, VERIFIED_CRAWLER_TARGETS } from './sources';
import { classifyTopic, cleanSubjectFromHeading, extractSubjectFromUrl, detectGroupStrongSubject } from './taxonomy';
import { getRedis } from '../../config/redis';
import { logger } from '../../utils/logger';

function stripHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
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
   * Fetches raw HTML from a given URL with timeout and user-agent.
   */
  public async fetchHtml(url: string): Promise<string | null> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.defaultTimeoutMs);

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': this.userAgent,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });
      clearTimeout(timeoutId);

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
      logger.warn(`Crawler could not reach URL ${url}: ${error?.message || String(error)}`, {
        service: 'crawler',
        url,
      });
      return null;
    }
  }

  /**
   * Parses HTML content and extracts IELTS questions.
   * Eliminates defaultTopicSlug override: Always executes classifyTopic(text, bullets)
   * so questions are evaluated by their actual content.
   */
  public parseHtmlContent(html: string, sourceUrl: string): RawCandidateQuestion[] {
    const pageTopicName = this.extractTopicNameFromHtmlOrUrl(html, sourceUrl);
    const text = stripHtml(html);
    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 5);

    interface IntermediateQuestion {
      part: IeltsPart;
      questionText: string;
      cueCardBullets?: string | null;
      questionType?: string;
    }

    const intermediateList: IntermediateQuestion[] = [];
    let currentPart: IeltsPart = 'PART_1';
    let currentCuePrompt: string | null = null;
    let currentCueBullets: string[] = [];

    const flushCueCard = () => {
      if (currentCuePrompt) {
        intermediateList.push({
          part: 'PART_2',
          questionText: currentCuePrompt,
          cueCardBullets: currentCueBullets.length > 0 ? JSON.stringify(currentCueBullets) : null,
          questionType: 'CUE_CARD',
        });
      }
      currentCuePrompt = null;
      currentCueBullets = [];
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lower = line.toLowerCase();

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

      // Detect General and Discussion Questions (ends with '?')
      if (line.endsWith('?') && line.length >= 20 && line.length <= 250) {
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

        const cleanQuestion = line.replace(/^[•\-\d.]+\s*/, '').trim();
        const part = currentPart === 'PART_2' ? 'PART_3' : currentPart;
        intermediateList.push({
          part,
          questionText: cleanQuestion,
          questionType: part === 'PART_3' ? 'DISCUSSION' : 'GENERAL',
        });
      }
    }

    flushCueCard();

    // Group-level emergence detection across the questions on this page
    const groupSubject = detectGroupStrongSubject(intermediateList, pageTopicName, sourceUrl) || pageTopicName;

    // Convert to RawCandidateQuestion by evaluating each question's actual content
    const finalQuestions: RawCandidateQuestion[] = intermediateList.map((item) => {
      const topicSlug = classifyTopic(item.questionText, item.cueCardBullets, groupSubject);
      return {
        part: item.part,
        questionText: item.questionText,
        cueCardBullets: item.cueCardBullets ?? null,
        questionType: item.questionType || (item.part === 'PART_2' ? 'CUE_CARD' : 'GENERAL'),
        suggestedTopicSlug: topicSlug,
        extractedTopicName: groupSubject || undefined,
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
