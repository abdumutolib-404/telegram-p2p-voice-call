import { describe, it, expect } from 'vitest';
import { generateQuestionFingerprint, normalizeQuestionText } from '../services/crawler/fingerprint';
import { classifyTopic, SEED_TOPICS, normalizeToCanonicalSlug } from '../services/crawler/taxonomy';
import { questionIngestionService } from '../services/crawler/ingestionService';
import { questionFilterService } from '../services/crawler/questionFilterService';
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

  describe('Topic Classification (15 Canonical Cambridge IELTS Families)', () => {
    it('classifies technology questions accurately', () => {
      const text = 'Do you use smartphones and AI apps to assist with your university homework?';
      const topic = classifyTopic(text);
      expect(topic).toBe('technology-digital-life');
    });

    it('classifies travel and journey questions accurately', () => {
      const text = 'Describe a memorable journey or tourist trip you took abroad.';
      const topic = classifyTopic(text);
      expect(topic).toBe('travel-tourism-transport');
    });

    it('classifies environment and sustainability questions accurately', () => {
      const text = 'How can cities reduce plastic pollution and improve recycling programs?';
      const topic = classifyTopic(text);
      expect(topic).toBe('environment-nature-wildlife');
    });

    it('classifies education and learning questions accurately', () => {
      const text = 'What subjects did you study at university and who was your favorite professor?';
      const topic = classifyTopic(text);
      expect(topic).toBe('education-learning');
    });

    it('classifies work and career questions accurately', () => {
      const text = 'What are your career ambitions and what job promotion do you hope to achieve?';
      const topic = classifyTopic(text);
      expect(topic).toBe('work-career-ambition');
    });

    it('classifies food and dining questions accurately', () => {
      const text = 'Do you enjoy cooking Italian pasta and dining at local seafood restaurants?';
      const topic = classifyTopic(text);
      expect(topic).toBe('food-dining-culinary');
    });

    it('classifies hometown and urban life questions accurately', () => {
      const text = 'Describe your hometown and what you like most about your local neighborhood.';
      const topic = classifyTopic(text);
      expect(topic).toBe('hometown-urban-life');
    });

    it('classifies family, friends and people questions accurately', () => {
      const text = 'Who was your closest childhood friend and how did your parents influence you?';
      const topic = classifyTopic(text);
      expect(topic).toBe('family-friends-people');
    });

    it('classifies media and entertainment questions accurately', () => {
      const text = 'Do you prefer watching movies at the cinema or reading literature novels?';
      const topic = classifyTopic(text);
      expect(topic).toBe('media-entertainment');
    });

    it('classifies health, fitness and sports questions accurately', () => {
      const text = 'Do you enjoy playing sports like football or going to the gym for physical exercise?';
      const topic = classifyTopic(text);
      expect(topic).toBe('health-fitness-sports');
    });

    it('classifies art, music and cultural heritage questions accurately', () => {
      const text = 'What musical instruments do you play and do you enjoy visiting art museums and galleries?';
      const topic = classifyTopic(text);
      expect(topic).toBe('art-music-culture');
    });

    it('classifies fashion, clothing and accessories questions accurately', () => {
      const text = 'Do you often wear accessories such as sunglasses, jewelry, and wristwatches?';
      const topic = classifyTopic(text);
      expect(topic).toBe('fashion-clothing-accessories');
    });

    it('classifies leisure, habits and daily routine questions accurately', () => {
      const text = 'What is your morning daily routine and how do you spend your free time on weekends?';
      const topic = classifyTopic(text);
      expect(topic).toBe('leisure-habits-daily');
    });

    it('classifies society, law and community questions accurately', () => {
      const text = 'Have you ever taken part in volunteer work or civic community support activities?';
      const topic = classifyTopic(text);
      expect(topic).toBe('society-law-community');
    });

    it('classifies science, space and innovation questions accurately', () => {
      const text = 'Are you fascinated by space exploration, astronomy, and scientific discoveries?';
      const topic = classifyTopic(text);
      expect(topic).toBe('science-space-innovation');
    });
  });

  describe('Plural & Irregular Morphology Keyword Matching', () => {
    it('matches plural -ies forms of words ending in consonant + y', () => {
      expect(classifyTopic('Which universities offer the most prestigious academic programs?')).toBe('education-learning');
      expect(classifyTopic('What digital technologies and artificial intelligence systems are changing work?')).toBe('technology-digital-life');
      expect(classifyTopic('What physical activities help people recover from illness?')).toBe('health-fitness-sports');
      expect(classifyTopic('How can local communities organize public volunteer projects?')).toBe('society-law-community');
      expect(classifyTopic('Which international cities have the most impressive architecture?')).toBe('hometown-urban-life');
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
      const topic = webCrawlerService.extractTopicNameFromHtmlOrUrl(
        html,
        'https://ieltsliz.com/ielts-speaking-part-1-agriculture/',
      );
      expect(topic).toBe('Agriculture & Farming');
    });
  });

  describe('Canonical Topic Absorption (Absorbs perfumes, mirrors, shoes, etc.)', () => {
    it('absorbs perfume questions into fashion-clothing-accessories', () => {
      const text = 'Do you like wearing perfume when going to social events? What scents do you prefer?';
      const topic = classifyTopic(text);
      expect(topic).toBe('fashion-clothing-accessories');
      expect(topic).not.toBe('perfumes-scents');
    });

    it('absorbs mirrors into fashion-clothing-accessories', () => {
      const text = 'Do you check yourself in the mirror before leaving your home? Why do people buy decorative mirrors?';
      const topic = classifyTopic(text);
      expect(topic).toBe('fashion-clothing-accessories');
      expect(topic).not.toBe('mirrors');
    });

    it('absorbs agriculture into environment-nature-wildlife', () => {
      const text = 'Is agriculture an essential part of the national economy in your country?';
      const topic = classifyTopic(text);
      expect(topic).toBe('environment-nature-wildlife');
      expect(topic).not.toBe('agriculture-farming');
    });

    it('absorbs jewelry into fashion-clothing-accessories', () => {
      const text = 'Describe a piece of jewelry that has sentimental value to you.';
      const topic = classifyTopic(text);
      expect(topic).toBe('fashion-clothing-accessories');
      expect(topic).not.toBe('jewelry');
    });

    it('absorbs shoes and footwear into fashion-clothing-accessories', () => {
      const text = 'Do you prefer buying comfortable sneakers or formal shoes for special occasions?';
      const topic = classifyTopic(text);
      expect(topic).toBe('fashion-clothing-accessories');
      expect(topic).not.toBe('shoes-footwear');
    });

    it('files crawled questions under canonical topics without creating redundant micro-topics', async () => {
      const perfumeQuestion = {
        part: 'PART_1' as const,
        questionText: 'Do you often buy luxury perfume or cologne as gifts for your close friends?',
        extractedTopicName: 'Perfumes & Scents',
        source: 'WEB_CRAWLER_TEST',
        sourceUrl: 'https://ieltsliz.com/perfume-questions',
      };

      const result = await questionIngestionService.runIngestion({
        customSources: [perfumeQuestion],
        force: true,
      });

      expect(result.status).toBe('SUCCESS');

      // Verify that no micro-topic 'perfumes-scents' was created in DB
      const microTopic = await prisma.ieltsTopic.findUnique({
        where: { slug: 'perfumes-scents' },
      });
      expect(microTopic).toBeNull();

      // Verify that canonical topic exists
      const fashionTopic = await prisma.ieltsTopic.findUnique({
        where: { slug: 'fashion-clothing-accessories' },
      });
      expect(fashionTopic).toBeDefined();

      // Verify that the question was filed under canonical topic
      const savedQuestion = await prisma.ieltsQuestion.findFirst({
        where: { questionText: perfumeQuestion.questionText },
      });

      expect(savedQuestion).toBeDefined();
      expect(savedQuestion?.topicId).toBe(fashionTopic?.id);
    });
  });

  describe('Consolidation & Orphan Purge Routine (questionFilterService)', () => {
    it('reclassifies non-canonical questions to canonical families and purges orphan topics', async () => {
      // 1. Create a legacy/non-canonical topic with a question
      const legacyTopic = await prisma.ieltsTopic.create({
        data: {
          name: 'Pasta Dishes Unique',
          slug: 'pasta-dishes-unique',
          description: 'Questions about pasta dishes.',
          relevance: 5,
          isActive: true,
        },
      });

      const questionInLegacy = await prisma.ieltsQuestion.create({
        data: {
          topicId: legacyTopic.id,
          part: 'PART_1',
          questionText: 'How often do you cook delicious pasta with vegetables at home for dinner?',
          source: 'TEST_LEGACY',
          sourceHash: generateQuestionFingerprint('PART_1', 'How often do you cook delicious pasta with vegetables at home for dinner?'),
          isActive: true,
        },
      });

      // 2. Create an orphan non-canonical topic with 0 questions
      const orphanTopic = await prisma.ieltsTopic.create({
        data: {
          name: 'Standalone Shoes Unique',
          slug: 'shoes-standalone-unique',
          description: 'Orphan topic with zero questions.',
          relevance: 3,
          isActive: true,
        },
      });

      // 3. Run filter cycle
      const filterResult = await questionFilterService.runFilterCycle({ force: true });
      expect(filterResult.status).toBe('SUCCESS');
      expect(filterResult.reclassifiedCount).toBeGreaterThan(0);
      expect(filterResult.orphansPurgedCount).toBeGreaterThan(0);

      // 4. Verify the question was reclassified to food-dining-culinary
      const culinaryTopic = await prisma.ieltsTopic.findUnique({
        where: { slug: 'food-dining-culinary' },
      });
      expect(culinaryTopic).toBeDefined();

      const updatedQuestion = await prisma.ieltsQuestion.findUnique({
        where: { id: questionInLegacy.id },
      });
      expect(updatedQuestion?.topicId).toBe(culinaryTopic?.id);

      // 5. Verify orphan topics were purged from database
      const purgedLegacy = await prisma.ieltsTopic.findUnique({
        where: { id: legacyTopic.id },
      });
      expect(purgedLegacy).toBeNull();

      const purgedOrphan = await prisma.ieltsTopic.findUnique({
        where: { id: orphanTopic.id },
      });
      expect(purgedOrphan).toBeNull();

      // 6. Verify all 15 canonical seed topics still exist
      const canonicalCount = await prisma.ieltsTopic.count({
        where: { slug: { in: SEED_TOPICS.map((s) => s.slug) } },
      });
      expect(canonicalCount).toBe(15);
    });

    it('reclassifies questions mistakenly placed in another topic to leisure-habits-daily without being reverted', async () => {
      const educationTopic = await prisma.ieltsTopic.findUnique({
        where: { slug: 'education-learning' },
      });
      expect(educationTopic).toBeDefined();

      const leisureQuestion = await prisma.ieltsQuestion.create({
        data: {
          topicId: educationTopic!.id,
          part: 'PART_1',
          questionText: 'What is your typical morning daily routine and how do you spend your free time on weekends?',
          source: 'MISCLASSIFIED_TEST',
          sourceHash: generateQuestionFingerprint(
            'PART_1',
            'What is your typical morning daily routine and how do you spend your free time on weekends?',
          ),
          isActive: true,
        },
      });

      const result = await questionFilterService.runFilterCycle({ force: true });
      expect(result.status).toBe('SUCCESS');

      const reclassified = await prisma.ieltsQuestion.findUnique({
        where: { id: leisureQuestion.id },
      });

      const leisureTopic = await prisma.ieltsTopic.findUnique({
        where: { slug: 'leisure-habits-daily' },
      });
      expect(reclassified?.topicId).toBe(leisureTopic?.id);
    });

    it('correctly reclassifies a question misclassified under work-career-ambition with travel keywords to travel-tourism-transport', async () => {
      const workTopic = await prisma.ieltsTopic.findUnique({
        where: { slug: 'work-career-ambition' },
      });
      expect(workTopic).toBeDefined();

      const travelQuestion = await prisma.ieltsQuestion.create({
        data: {
          topicId: workTopic!.id,
          part: 'PART_1',
          questionText: 'Do you enjoy traveling by train or plane when taking vacations and trips abroad?',
          source: 'MISCLASSIFIED_WORK_TEST',
          sourceHash: generateQuestionFingerprint(
            'PART_1',
            'Do you enjoy traveling by train or plane when taking vacations and trips abroad?',
          ),
          isActive: true,
        },
      });

      const result = await questionFilterService.runFilterCycle({ force: true });
      expect(result.status).toBe('SUCCESS');

      const reclassified = await prisma.ieltsQuestion.findUnique({
        where: { id: travelQuestion.id },
      });

      const travelTopic = await prisma.ieltsTopic.findUnique({
        where: { slug: 'travel-tourism-transport' },
      });
      expect(reclassified?.topicId).toBe(travelTopic?.id);
    });

    it('normalizes legacy slugs containing keywords to their true canonical families via normalizeToCanonicalSlug', () => {
      expect(normalizeToCanonicalSlug('pasta-dishes-unique')).toBe('food-dining-culinary');
      expect(normalizeToCanonicalSlug('shoes-standalone-unique')).toBe('fashion-clothing-accessories');
      expect(normalizeToCanonicalSlug('space-exploration-topics')).toBe('science-space-innovation');
      expect(normalizeToCanonicalSlug('completely-unknown-topic-xyz')).toBe('leisure-habits-daily');
      expect(normalizeToCanonicalSlug(null)).toBe('leisure-habits-daily');
    });

    it('reclassifies inactive questions linked to non-canonical topics and purges the orphan topic', async () => {
      const legacyTopic = await prisma.ieltsTopic.create({
        data: {
          name: 'Hats Standalone Legacy',
          slug: 'hats-standalone-legacy',
          description: 'Legacy hats topic with inactive question.',
          relevance: 2,
          isActive: true,
        },
      });

      const inactiveQuestion = await prisma.ieltsQuestion.create({
        data: {
          topicId: legacyTopic.id,
          part: 'PART_1',
          questionText: 'Do you like wearing hats or caps when the weather is cold outside?',
          source: 'INACTIVE_TEST',
          sourceHash: generateQuestionFingerprint(
            'PART_1',
            'Do you like wearing hats or caps when the weather is cold outside?',
          ),
          isActive: false, // Inactive question
        },
      });

      const result = await questionFilterService.runFilterCycle({ force: true });
      expect(result.status).toBe('SUCCESS');

      const fashionTopic = await prisma.ieltsTopic.findUnique({
        where: { slug: 'fashion-clothing-accessories' },
      });
      expect(fashionTopic).toBeDefined();

      const updatedInactive = await prisma.ieltsQuestion.findUnique({
        where: { id: inactiveQuestion.id },
      });
      expect(updatedInactive?.topicId).toBe(fashionTopic?.id);

      const purgedLegacy = await prisma.ieltsTopic.findUnique({
        where: { id: legacyTopic.id },
      });
      expect(purgedLegacy).toBeNull();
    });
  });
});
