import { describe, it, expect, beforeEach } from 'vitest';
import { generateQuestionFingerprint, normalizeQuestionText } from '../services/crawler/fingerprint';
import { classifyTopic } from '../services/crawler/taxonomy';
import { questionIngestionService } from '../services/crawler/ingestionService';
import { webCrawlerService } from '../services/crawler/webCrawlerService';
import { prisma } from '../config/database';

describe('IELTS Crawler & Ingestion Pipeline', () => {
  describe('Deterministic Fingerprinting', () => {
    it('normalizes curly quotes, hyphens, and whitespace identically', () => {
      const q1 = 'What do you think about “Artificial Intelligence” in modern education?';
      const q2 = 'what  do you think about "artificial intelligence" in modern education';
      const q3 = 'What do you think about "Artificial Intelligence" in modern education...';

      const norm1 = normalizeQuestionText(q1);
      const norm2 = normalizeQuestionText(q2);
      const norm3 = normalizeQuestionText(q3);

      expect(norm1).toBe(norm2);
      expect(norm1).toBe(norm3);

      const fp1 = generateQuestionFingerprint('PART_1', q1);
      const fp2 = generateQuestionFingerprint('PART_1', q2);
      const fp3 = generateQuestionFingerprint('PART_1', q3);

      expect(fp1).toBe(fp2);
      expect(fp1).toBe(fp3);
    });

    it('produces different fingerprints for different parts', () => {
      const text = 'Describe a journey you went on.';
      const fpPart1 = generateQuestionFingerprint('PART_1', text);
      const fpPart2 = generateQuestionFingerprint('PART_2', text);
      expect(fpPart1).not.toBe(fpPart2);
    });
  });

  describe('Topic Classification', () => {
    it('classifies technology questions accurately', () => {
      const text = 'Do you use smartphones and AI apps to assist with your university homework?';
      const topic = classifyTopic(text);
      expect(topic).toBe('technology-ai');
    });

    it('classifies travel and journey questions accurately', () => {
      const text = 'Describe a memorable journey or tourist trip you took abroad.';
      const topic = classifyTopic(text);
      expect(topic).toBe('travel-tourism');
    });

    it('classifies environment and sustainability questions accurately', () => {
      const text = 'How can cities reduce plastic pollution and improve recycling programs?';
      const topic = classifyTopic(text);
      expect(topic).toBe('environment-sustainability');
    });
  });

  describe('Idempotent Ingestion Service', () => {
    it('ingests seed bank on first run and skips all duplicates on second run', async () => {
      // First crawl
      const result1 = await questionIngestionService.runIngestion({ force: true });
      expect(result1.status).toBe('SUCCESS');
      expect(result1.questionsAccepted).toBeGreaterThan(0);
      expect(result1.duplicatesSkipped).toBe(0);

      const totalAfterFirst = await prisma.ieltsQuestion.count();
      expect(totalAfterFirst).toBe(result1.questionsAccepted);

      // Second crawl with identical bank
      const result2 = await questionIngestionService.runIngestion({ force: true });
      expect(result2.status).toBe('SUCCESS');
      expect(result2.questionsAccepted).toBe(0);
      expect(result2.duplicatesSkipped).toBe(result1.questionsAccepted);

      const totalAfterSecond = await prisma.ieltsQuestion.count();
      expect(totalAfterSecond).toBe(totalAfterFirst); // 0 duplicates!
    });
  });

  describe('Depth-1 Spidering & Link Extraction', () => {
    it('extracts internal IELTS links matching patterns and filters assets and external domains', () => {
      const html = `
        <html>
          <body>
            <a href="/ielts-speaking-part-1-topics/">Part 1 Topics</a>
            <a href="/ielts-speaking-part-2-topics-cue-cards/">Part 2 Cue Cards</a>
            <a href="https://ieltsliz.com/speaking/discussion-questions/">Speaking Discussion</a>
            <a href="/cue-card-mirrors/">Cue Card Mirrors</a>
            <a href="/topics/perfume/">Topics Perfume</a>
            <a href="https://external-site.com/speaking/test">External Link</a>
            <a href="/images/speaking-diagram.jpg">Image Asset</a>
            <a href="/documents/ielts-guide.pdf">PDF Asset</a>
            <a href="#comments">Anchor Fragment</a>
            <a href="javascript:void(0)">JS Link</a>
          </body>
        </html>
      `;

      const links = webCrawlerService.extractInternalIeltsLinks(html, 'https://ieltsliz.com/speaking-index');

      expect(links).toContain('https://ieltsliz.com/ielts-speaking-part-1-topics');
      expect(links).toContain('https://ieltsliz.com/ielts-speaking-part-2-topics-cue-cards');
      expect(links).toContain('https://ieltsliz.com/speaking/discussion-questions');
      expect(links).toContain('https://ieltsliz.com/cue-card-mirrors');
      expect(links).toContain('https://ieltsliz.com/topics/perfume');

      // Filtered out
      expect(links.some((l) => l.includes('external-site.com'))).toBe(false);
      expect(links.some((l) => l.includes('.jpg'))).toBe(false);
      expect(links.some((l) => l.includes('.pdf'))).toBe(false);
      expect(links.some((l) => l.includes('#'))).toBe(false);
    });
  });

  describe('Redis Crawl Memory', () => {
    it('records and checks visited URLs using Redis memory to avoid duplicate crawling', async () => {
      const testUrl = 'https://ieltsliz.com/ielts-speaking-part-1-perfume-test';

      expect(await webCrawlerService.isUrlVisited(testUrl)).toBe(false);

      await webCrawlerService.markUrlVisited(testUrl);

      expect(await webCrawlerService.isUrlVisited(testUrl)).toBe(true);
      // Normalized url check
      expect(await webCrawlerService.isUrlVisited(testUrl + '/')).toBe(true);
      expect(await webCrawlerService.isUrlVisited(testUrl + '?utm_source=test')).toBe(true);
    });
  });

  describe('Topic Heading & Slug Extraction', () => {
    it('extracts topic name from <h1> heading cleanly', () => {
      const html1 = '<h1>Perfume - IELTS Speaking Part 1</h1>';
      const topic1 = webCrawlerService.extractTopicNameFromHtmlOrUrl(html1, 'https://ieltsliz.com/page-1');
      expect(topic1).toBe('Perfumes & Scents');

      const html2 = '<h1>IELTS Speaking Part 1: Mirrors</h1>';
      const topic2 = webCrawlerService.extractTopicNameFromHtmlOrUrl(html2, 'https://ieltsliz.com/page-2');
      expect(topic2).toBe('Mirrors');
    });

    it('extracts topic name from <h2> heading if <h1> is absent', () => {
      const html = '<div><h2>Describe a piece of jewelry you own - Cue Card</h2></div>';
      const topic = webCrawlerService.extractTopicNameFromHtmlOrUrl(html, 'https://ieltsmaterial.com/card');
      expect(topic).toBe('Jewelry');
    });

    it('extracts topic name from URL slug if heading has no subject', () => {
      const html = '<h1>IELTS Speaking</h1>';
      const topic = webCrawlerService.extractTopicNameFromHtmlOrUrl(html, 'https://ieltsliz.com/ielts-speaking-part-1-agriculture/');
      expect(topic).toBe('Agriculture & Farming');
    });
  });

  describe('Dynamic Topic Emergence (Non-seed topics never dumped into Daily Life)', () => {
    it('emerges Perfumes & Scents topic when similarity < 3 instead of daily-life-habits', () => {
      const text = 'Do you like wearing perfume when going to social events? What scents do you prefer?';
      const topic = classifyTopic(text);
      expect(topic).toBe('perfumes-scents');
      expect(topic).not.toBe('daily-life-habits');
    });

    it('emerges Mirrors topic when similarity < 3 instead of daily-life-habits', () => {
      const text = 'Do you check yourself in the mirror before leaving your home? Why do people buy decorative mirrors?';
      const topic = classifyTopic(text);
      expect(topic).toBe('mirrors');
      expect(topic).not.toBe('daily-life-habits');
    });

    it('emerges Agriculture & Farming topic when similarity < 3 instead of daily-life-habits', () => {
      const text = 'Is agriculture an essential part of the national economy in your country?';
      const topic = classifyTopic(text);
      expect(topic).toBe('agriculture-farming');
      expect(topic).not.toBe('daily-life-habits');
    });

    it('emerges Jewelry topic when similarity < 3 instead of daily-life-habits', () => {
      const text = 'Describe a piece of jewelry that has sentimental value to you.';
      const topic = classifyTopic(text);
      expect(topic).toBe('jewelry');
      expect(topic).not.toBe('daily-life-habits');
    });

    it('dynamically creates IeltsTopic in database during ingestion for emergent topics', async () => {
      const emergentQuestion = {
        part: 'PART_1' as const,
        questionText: 'Do you often buy luxury perfume or cologne as gifts for your close friends?',
        extractedTopicName: 'Perfumes & Scents',
        source: 'WEB_CRAWLER_TEST',
        sourceUrl: 'https://ieltsliz.com/perfume-questions',
      };

      const result = await questionIngestionService.runIngestion({
        customSources: [emergentQuestion],
        force: true,
      });

      expect(result.status).toBe('SUCCESS');

      // Verify that the new topic was created in DB
      const perfumeTopic = await prisma.ieltsTopic.findUnique({
        where: { slug: 'perfumes-scents' },
      });

      expect(perfumeTopic).toBeDefined();
      expect(perfumeTopic?.name).toBe('Perfumes & Scents');
      expect(perfumeTopic?.relevance).toBe(6);

      // Verify that the question was filed under this new topic
      const savedQuestion = await prisma.ieltsQuestion.findFirst({
        where: { questionText: emergentQuestion.questionText },
      });

      expect(savedQuestion).toBeDefined();
      expect(savedQuestion?.topicId).toBe(perfumeTopic?.id);
    });
  });
});
