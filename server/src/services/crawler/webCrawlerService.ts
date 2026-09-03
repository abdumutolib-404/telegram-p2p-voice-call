import { IeltsPart } from '@prisma/client';
import { RawCandidateQuestion, CrawlTargetSource, VERIFIED_CRAWLER_TARGETS } from './sources';
import { classifyTopic } from './taxonomy';
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

  public async fetchAndExtractUrl(url: string, defaultTopicSlug?: string): Promise<RawCandidateQuestion[]> {
    logger.info(`Crawling IELTS target URL: ${url}`, { service: 'crawler', url });
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
        logger.warn(`Crawler fetch failed with status ${response.status}`, { service: 'crawler', url, status: response.status });
        return [];
      }

      const html = await response.text();
      return this.parseHtmlContent(html, url, defaultTopicSlug);
    } catch (error: any) {
      logger.warn(`Crawler could not reach URL ${url}: ${error?.message || String(error)}`, { service: 'crawler', url });
      return [];
    }
  }

  public parseHtmlContent(html: string, sourceUrl: string, defaultTopicSlug?: string): RawCandidateQuestion[] {
    const text = stripHtml(html);
    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 5);

    const questions: RawCandidateQuestion[] = [];
    let currentPart: IeltsPart = 'PART_1';
    let currentCuePrompt: string | null = null;
    let currentCueBullets: string[] = [];

    const flushCueCard = () => {
      if (currentCuePrompt) {
        questions.push({
          part: 'PART_2',
          questionText: currentCuePrompt,
          cueCardBullets: currentCueBullets.length > 0 ? JSON.stringify(currentCueBullets) : null,
          questionType: 'CUE_CARD',
          suggestedTopicSlug: defaultTopicSlug || classifyTopic(currentCuePrompt, JSON.stringify(currentCueBullets)),
          source: 'WEB_CRAWLER',
          sourceUrl,
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
        // Skip administrative or navigation questions
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
        questions.push({
          part,
          questionText: cleanQuestion,
          questionType: part === 'PART_3' ? 'DISCUSSION' : 'GENERAL',
          suggestedTopicSlug: defaultTopicSlug || classifyTopic(cleanQuestion),
          source: 'WEB_CRAWLER',
          sourceUrl,
        });
      }
    }

    flushCueCard();
    return questions;
  }

  public async crawlAllConfiguredSources(): Promise<RawCandidateQuestion[]> {
    const allCrawled: RawCandidateQuestion[] = [];
    for (const target of VERIFIED_CRAWLER_TARGETS) {
      if (!target.enabled) continue;
      const results = await this.fetchAndExtractUrl(target.url, target.suggestedTopicSlug);
      allCrawled.push(...results);
    }
    return allCrawled;
  }
}

export const webCrawlerService = new WebCrawlerService();
