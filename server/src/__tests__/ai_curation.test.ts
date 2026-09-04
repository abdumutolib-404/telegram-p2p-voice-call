import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  aiCurationService,
  heuristicCuration,
  stripEmojisAndJunk,
  CuratedQuestionResult,
} from '../services/crawler/aiCurationService';
import { webCrawlerService } from '../services/crawler/webCrawlerService';
import { detectGarbageQuestion, JUNK_PATTERNS, run as runPurgeScript } from '../../scripts/purgeGarbageQuestions';
import { questionIngestionService } from '../services/crawler/ingestionService';
import { prisma } from '../config/database';

describe('Gemini 2.0 Flash AI Curation & Pipeline Sanitation', () => {
  describe('DOM Sanitation in WebCrawlerService', () => {
    it('strips user comments, discussion threads, and sidebar widgets before extraction', () => {
      const dirtyHtml = `
        <html>
          <body>
            <h1>Technology in Education - IELTS Speaking</h1>
            <div class="entry-content">
              <h2>Speaking Part 1</h2>
              <p>Do you use smartphones or digital tablets for studying?</p>
              <p>How often do you browse the internet for academic research?</p>
            </div>

            <!-- Student Discussion & Comments that should be purged -->
            <div id="comments" class="comments-area">
              <h3>Comments</h3>
              <ol class="comment-list">
                <li class="comment-body">
                  <p>Will these questions be asked in 2026? Please reply! 🤔</p>
                </li>
                <li class="comment-body">
                  <p>How long should my answer be for Part 1 questions? Thanks teacher.</p>
                </li>
              </ol>
            </div>

            <!-- Sidebar FAQ & Ads -->
            <aside class="sidebar widget-area">
              <div class="widget">
                <h4>FAQ: How to prepare for IELTS?</h4>
                <p>Is it good for improving my English speaking score?</p>
              </div>
              <div class="advertisement">
                <p>Writing Task 2: Cause and effect essay guide</p>
              </div>
            </aside>

            <footer>
              <nav>
                <a href="/privacy">Privacy Policy</a>
              </nav>
            </footer>
          </body>
        </html>
      `;

      const candidates = webCrawlerService.parseHtmlContent(dirtyHtml, 'https://ieltsliz.com/tech-speaking');

      // Only the 2 authentic article questions should be extracted
      expect(candidates.length).toBe(2);
      expect(candidates[0].questionText).toBe('Do you use smartphones or digital tablets for studying?');
      expect(candidates[1].questionText).toBe('How often do you browse the internet for academic research?');

      // None of the comment, sidebar, or footer text should leak into candidates
      const allExtractedText = candidates.map((c) => c.questionText.toLowerCase()).join(' ');
      expect(allExtractedText).not.toContain('will these questions');
      expect(allExtractedText).not.toContain('how long should');
      expect(allExtractedText).not.toContain('how to prepare');
      expect(allExtractedText).not.toContain('improving my english');
      expect(allExtractedText).not.toContain('cause and effect');
    });

    it('handles null, undefined or non-string html safely without throwing', () => {
      expect(webCrawlerService.parseHtmlContent(null as any, 'https://example.com')).toEqual([]);
      expect(webCrawlerService.parseHtmlContent(undefined as any, 'https://example.com')).toEqual([]);
      expect(webCrawlerService.parseHtmlContent('', 'https://example.com')).toEqual([]);
    });

    it('recognizes questions ending with trailing emojis or quotes', () => {
      const htmlWithEmojiQuestions = `
        <html>
          <body>
            <h2>Music & Hobbies</h2>
            <p>Do you enjoy listening to classical music or jazz? 🎷🤔</p>
            <p>“Do you prefer reading physical books or e-books?”</p>
          </body>
        </html>
      `;
      const candidates = webCrawlerService.parseHtmlContent(htmlWithEmojiQuestions, 'https://ieltsliz.com/music');
      expect(candidates.length).toBe(2);
      expect(candidates[0].questionText).toContain('Do you enjoy listening to classical music or jazz');
      expect(candidates[1].questionText).toContain('Do you prefer reading physical books or e-books');
    });
  });

  describe('Text Cleaning & Emoji Stripping', () => {
    it('strips emojis, question numbers, and blogger notes', () => {
      const dirty1 = '1. Do you enjoy listening to classical music or pop songs? 🤔🎧';
      expect(stripEmojisAndJunk(dirty1)).toBe('Do you enjoy listening to classical music or pop songs?');

      const dirty2 = 'Q2: Describe a memorable trip you took abroad (IELTS Liz) 😂🥀';
      expect(stripEmojisAndJunk(dirty2)).toBe('Describe a memorable trip you took abroad');

      const dirty3 = '• What kinds of food do you like eating? 👀';
      expect(stripEmojisAndJunk(dirty3)).toBe('What kinds of food do you like eating?');
    });

    it('strips technical and pictographic emojis such as clocks and stars', () => {
      const clockPrompt = 'Do you wear a wristwatch or check time on your phone? ⏰⏱';
      expect(stripEmojisAndJunk(clockPrompt)).toBe('Do you wear a wristwatch or check time on your phone?');

      const starPrompt = 'Do you enjoy gazing at the stars at night? ⭐✨';
      expect(stripEmojisAndJunk(starPrompt)).toBe('Do you enjoy gazing at the stars at night?');
    });

    it('preserves leading numbers when part of genuine sentence phrasing', () => {
      const yearPrompt = '20 years ago, people used letters rather than emails. Do you agree?';
      expect(stripEmojisAndJunk(yearPrompt)).toBe('20 years ago, people used letters rather than emails. Do you agree?');

      const examYearPrompt = '2026 is expected to bring new technological advances. What are your views?';
      expect(stripEmojisAndJunk(examYearPrompt)).toBe('2026 is expected to bring new technological advances. What are your views?');
    });
  });

  describe('Heuristic Curation Fallback Engine', () => {
    it('rejects empty or short fragments as incomplete_or_garbage', () => {
      const emptyCandidate = { text: '' };
      const emptyResult = heuristicCuration(emptyCandidate, 0);
      expect(emptyResult.isValidIeltsSpeaking).toBe(false);
      expect(emptyResult.rejectionReason).toBe('incomplete_or_garbage');

      const emojiOnlyCandidate = { text: '🤔😂🥀' };
      const emojiResult = heuristicCuration(emojiOnlyCandidate, 1);
      expect(emojiResult.isValidIeltsSpeaking).toBe(false);
      expect(emojiResult.rejectionReason).toBe('incomplete_or_garbage');

      const shortCandidate = { text: 'Q1: What?' };
      const shortResult = heuristicCuration(shortCandidate, 2);
      expect(shortResult.isValidIeltsSpeaking).toBe(false);
      expect(shortResult.rejectionReason).toBe('incomplete_or_garbage');
    });

    it('rejects student questions and exam inquiries', () => {
      const studentCandidate = {
        text: 'Will these questions be asked in 2026? Can I get band 7?',
      };
      const result = heuristicCuration(studentCandidate, 0);
      expect(result.isValidIeltsSpeaking).toBe(false);
      expect(result.rejectionReason).toBe('student_comment');
    });

    it('rejects test FAQ and timing queries', () => {
      const timingCandidate = {
        text: 'How long should my answer be during the exam?',
      };
      const result = heuristicCuration(timingCandidate, 1);
      expect(result.isValidIeltsSpeaking).toBe(false);
      expect(result.rejectionReason).toBe('student_comment');
    });

    it('rejects blogger banter and commentary', () => {
      const blogCandidate = {
        text: 'Probably by foot I assume😂 What do you think guys?',
      };
      const result = heuristicCuration(blogCandidate, 2);
      expect(result.isValidIeltsSpeaking).toBe(false);
      expect(result.rejectionReason).toBe('blog_commentary');
    });

    it('rejects IELTS Writing task prompts', () => {
      const writingCandidate = {
        text: 'Writing Task 2: Cause and effect essay on public transport',
      };
      const result = heuristicCuration(writingCandidate, 3);
      expect(result.isValidIeltsSpeaking).toBe(false);
      expect(result.rejectionReason).toBe('writing_task_guide');

      const essayCandidate = {
        text: 'Evaluate – What do you think are the advantages and disadvantages?',
      };
      const essayResult = heuristicCuration(essayCandidate, 4);
      expect(essayResult.isValidIeltsSpeaking).toBe(false);
      expect(essayResult.rejectionReason).toBe('writing_task_guide');
    });

    it('accepts authentic IELTS speaking questions and categorizes to canonical topic slugs', () => {
      const techPrompt = {
        text: 'Do you frequently use artificial intelligence tools and mobile apps in your daily routine?',
      };
      const techResult = heuristicCuration(techPrompt, 0);
      expect(techResult.isValidIeltsSpeaking).toBe(true);
      expect(techResult.rejectionReason).toBeNull();
      expect(techResult.part).toBe('PART_1');
      expect(techResult.canonicalTopicSlug).toBe('technology-digital-life');

      const cueCardPrompt = {
        text: 'Describe a memorable journey you took by train.',
        bullets: ['Where you went', 'Who you went with', 'And explain why it was memorable'],
      };
      const cueCardResult = heuristicCuration(cueCardPrompt, 1);
      expect(cueCardResult.isValidIeltsSpeaking).toBe(true);
      expect(cueCardResult.rejectionReason).toBeNull();
      expect(cueCardResult.part).toBe('PART_2');
      expect(cueCardResult.canonicalTopicSlug).toBe('travel-tourism-transport');

      const part3Prompt = {
        text: 'In what ways do you think artificial intelligence and smart robotics will transform our daily digital lives over the coming decade?',
      };
      const part3Result = heuristicCuration(part3Prompt, 2);
      expect(part3Result.isValidIeltsSpeaking).toBe(true);
      expect(part3Result.part).toBe('PART_3');
      expect(part3Result.canonicalTopicSlug).toBe('technology-digital-life');
    });

    it('strips emojis from authentic questions during curation', () => {
      const emojiPrompt = {
        text: 'Do you like wearing perfume or cologne when attending social events? 🤔✨',
      };
      const result = heuristicCuration(emojiPrompt, 0);
      expect(result.isValidIeltsSpeaking).toBe(true);
      expect(result.cleanedText).toBe('Do you like wearing perfume or cologne when attending social events?');
      expect(result.canonicalTopicSlug).toBe('fashion-clothing-accessories');
    });
  });

  describe('AiCurationService Batch Processing & Fallback Resilience', () => {
    it('returns empty array when candidates array is empty', async () => {
      const results = await aiCurationService.curateQuestionBatch([]);
      expect(results).toEqual([]);
    });

    it('gracefully falls back to heuristic curation without crashing when GEMINI_API_KEY is not set', async () => {
      const candidates = [
        { text: 'What is your favorite type of traditional cuisine to cook at home?' },
        { text: 'Will these questions be asked in 2026? 🤔' },
        { text: 'Probably by foot I assume😂' },
      ];

      const results = await aiCurationService.curateQuestionBatch(candidates);
      expect(results.length).toBe(3);

      expect(results[0].isValidIeltsSpeaking).toBe(true);
      expect(results[0].canonicalTopicSlug).toBe('food-dining-culinary');

      expect(results[1].isValidIeltsSpeaking).toBe(false);
      expect(results[1].rejectionReason).toBe('student_comment');

      expect(results[2].isValidIeltsSpeaking).toBe(false);
      expect(results[2].rejectionReason).toBe('blog_commentary');
    });

    it('gracefully handles mock Gemini API error and returns heuristic fallback results', async () => {
      const originalKey = process.env.GEMINI_API_KEY;
      process.env.GEMINI_API_KEY = 'mock_test_key_xyz';

      const spy = vi.spyOn(GoogleGenerativeAI.prototype, 'getGenerativeModel').mockImplementation(() => {
        return {
          generateContent: vi.fn().mockRejectedValue(new Error('503 Service Unavailable: Gemini overloaded')),
        } as any;
      });

      try {
        const candidates = [
          { text: 'What sports or physical exercise activities do you regularly engage in?' },
        ];

        // Should NOT throw! Must catch and return heuristic fallback
        const results = await aiCurationService.curateQuestionBatch(candidates);
        expect(results.length).toBe(1);
        expect(results[0].isValidIeltsSpeaking).toBe(true);
        expect(results[0].canonicalTopicSlug).toBe('health-fitness-sports');
      } finally {
        spy.mockRestore();
        if (originalKey === undefined) {
          delete process.env.GEMINI_API_KEY;
        } else {
          process.env.GEMINI_API_KEY = originalKey;
        }
      }
    });

    it('parses valid structured JSON from Gemini API when successful', async () => {
      const originalKey = process.env.GEMINI_API_KEY;
      process.env.GEMINI_API_KEY = 'mock_valid_key';

      const mockAiResponse = JSON.stringify([
        {
          index: 0,
          isValidIeltsSpeaking: true,
          rejectionReason: null,
          part: 'PART_1',
          canonicalTopicSlug: 'art-music-culture',
          cleanedText: 'What kind of musical instruments do you enjoy playing?',
        },
        {
          index: 1,
          isValidIeltsSpeaking: false,
          rejectionReason: 'student_comment',
          part: 'PART_1',
          canonicalTopicSlug: 'leisure-habits-daily',
          cleanedText: 'Will these questions be asked in 2026?',
        },
      ]);

      const spy = vi.spyOn(GoogleGenerativeAI.prototype, 'getGenerativeModel').mockImplementation(() => {
        return {
          generateContent: vi.fn().mockResolvedValue({
            response: {
              text: () => mockAiResponse,
            },
          }),
        } as any;
      });

      try {
        const candidates = [
          { text: 'What kind of musical instruments do you enjoy playing? 🤔' },
          { text: 'Will these questions be asked in 2026?' },
        ];

        const results = await aiCurationService.curateQuestionBatch(candidates);
        expect(results.length).toBe(2);
        expect(results[0].isValidIeltsSpeaking).toBe(true);
        expect(results[0].canonicalTopicSlug).toBe('art-music-culture');
        expect(results[0].cleanedText).toBe('What kind of musical instruments do you enjoy playing?');

        expect(results[1].isValidIeltsSpeaking).toBe(false);
        expect(results[1].rejectionReason).toBe('student_comment');
      } finally {
        spy.mockRestore();
        if (originalKey === undefined) {
          delete process.env.GEMINI_API_KEY;
        } else {
          process.env.GEMINI_API_KEY = originalKey;
        }
      }
    });

    it('correctly maps Gemini output by candidate index even when returned out of order', async () => {
      const originalKey = process.env.GEMINI_API_KEY;
      process.env.GEMINI_API_KEY = 'mock_valid_key';

      // Reordered: index 1 comes BEFORE index 0 in the Gemini response array
      const mockReorderedResponse = JSON.stringify([
        {
          index: 1,
          isValidIeltsSpeaking: false,
          rejectionReason: 'student_comment',
          part: 'PART_1',
          canonicalTopicSlug: 'leisure-habits-daily',
          cleanedText: 'Will these questions be asked in 2026?',
        },
        {
          index: 0,
          isValidIeltsSpeaking: true,
          rejectionReason: null,
          part: 'PART_1',
          canonicalTopicSlug: 'art-music-culture',
          cleanedText: 'What kind of musical instruments do you enjoy playing?',
        },
      ]);

      const spy = vi.spyOn(GoogleGenerativeAI.prototype, 'getGenerativeModel').mockImplementation(() => {
        return {
          generateContent: vi.fn().mockResolvedValue({
            response: {
              text: () => mockReorderedResponse,
            },
          }),
        } as any;
      });

      try {
        const candidates = [
          { text: 'What kind of musical instruments do you enjoy playing?' },
          { text: 'Will these questions be asked in 2026?' },
        ];

        const results = await aiCurationService.curateQuestionBatch(candidates);
        expect(results.length).toBe(2);

        // Candidate 0 must remain at results[0] regardless of Gemini array ordering
        expect(results[0].index).toBe(0);
        expect(results[0].isValidIeltsSpeaking).toBe(true);
        expect(results[0].canonicalTopicSlug).toBe('art-music-culture');
        expect(results[0].cleanedText).toBe('What kind of musical instruments do you enjoy playing?');

        // Candidate 1 must remain at results[1]
        expect(results[1].index).toBe(1);
        expect(results[1].isValidIeltsSpeaking).toBe(false);
        expect(results[1].rejectionReason).toBe('student_comment');
      } finally {
        spy.mockRestore();
        if (originalKey === undefined) {
          delete process.env.GEMINI_API_KEY;
        } else {
          process.env.GEMINI_API_KEY = originalKey;
        }
      }
    });

    it('strips markdown code fences from Gemini JSON response cleanly', async () => {
      const originalKey = process.env.GEMINI_API_KEY;
      process.env.GEMINI_API_KEY = 'mock_valid_key';

      const mockMarkdownResponse = '```json\n' + JSON.stringify([
        {
          index: 0,
          isValidIeltsSpeaking: true,
          rejectionReason: null,
          part: 'PART_3',
          canonicalTopicSlug: 'technology-digital-life',
          cleanedText: 'How is automation transforming the modern workplace?',
        },
      ]) + '\n```';

      const spy = vi.spyOn(GoogleGenerativeAI.prototype, 'getGenerativeModel').mockImplementation(() => {
        return {
          generateContent: vi.fn().mockResolvedValue({
            response: {
              text: () => mockMarkdownResponse,
            },
          }),
        } as any;
      });

      try {
        const candidates = [
          { text: 'How is automation transforming the modern workplace?' },
        ];

        const results = await aiCurationService.curateQuestionBatch(candidates);
        expect(results.length).toBe(1);
        expect(results[0].isValidIeltsSpeaking).toBe(true);
        expect(results[0].canonicalTopicSlug).toBe('technology-digital-life');
        expect(results[0].cleanedText).toBe('How is automation transforming the modern workplace?');
      } finally {
        spy.mockRestore();
        if (originalKey === undefined) {
          delete process.env.GEMINI_API_KEY;
        } else {
          process.env.GEMINI_API_KEY = originalKey;
        }
      }
    });

    it('preserves partial results with heuristic fallback if Gemini response omits a candidate', async () => {
      const originalKey = process.env.GEMINI_API_KEY;
      process.env.GEMINI_API_KEY = 'mock_valid_key';

      // Gemini only returns result for candidate index 0, omitting candidate 1
      const mockPartialResponse = JSON.stringify([
        {
          index: 0,
          isValidIeltsSpeaking: true,
          rejectionReason: null,
          part: 'PART_1',
          canonicalTopicSlug: 'food-dining-culinary',
          cleanedText: 'What is your favorite type of traditional meal?',
        },
      ]);

      const spy = vi.spyOn(GoogleGenerativeAI.prototype, 'getGenerativeModel').mockImplementation(() => {
        return {
          generateContent: vi.fn().mockResolvedValue({
            response: {
              text: () => mockPartialResponse,
            },
          }),
        } as any;
      });

      try {
        const candidates = [
          { text: 'What is your favorite type of traditional meal?' },
          { text: 'Will these questions be asked in 2026?' },
        ];

        const results = await aiCurationService.curateQuestionBatch(candidates);
        expect(results.length).toBe(2);

        // Candidate 0 curated by AI
        expect(results[0].isValidIeltsSpeaking).toBe(true);
        expect(results[0].canonicalTopicSlug).toBe('food-dining-culinary');

        // Candidate 1 gracefully covered by heuristic fallback
        expect(results[1].isValidIeltsSpeaking).toBe(false);
        expect(results[1].rejectionReason).toBe('student_comment');
      } finally {
        spy.mockRestore();
        if (originalKey === undefined) {
          delete process.env.GEMINI_API_KEY;
        } else {
          process.env.GEMINI_API_KEY = originalKey;
        }
      }
    });
  });

  describe('Database Garbage Detection Script (detectGarbageQuestion)', () => {
    it('detects emoji junk in questions', () => {
      expect(detectGarbageQuestion('Do you like watching movies? 🤔').isGarbage).toBe(true);
      expect(detectGarbageQuestion('Do you like watching movies? 😂').reason).toBe('contains_emoji');
      expect(detectGarbageQuestion('Probably by foot 😂').isGarbage).toBe(true);
      expect(detectGarbageQuestion('Do you wear a wristwatch? ⏰').isGarbage).toBe(true);
      expect(detectGarbageQuestion('Do you like watching stars? ⭐').reason).toBe('contains_emoji');
    });

    it('detects empty or whitespace-only questions', () => {
      expect(detectGarbageQuestion('').reason).toBe('empty_text');
      expect(detectGarbageQuestion('   ').isGarbage).toBe(true);
    });

    it('detects student comments and inquiry phrases', () => {
      expect(detectGarbageQuestion('Will these questions be asked in 2022?').isGarbage).toBe(true);
      expect(detectGarbageQuestion('How long should an answer be?').reason).toBe('student_timing_faq');
      expect(detectGarbageQuestion('Is it good for improving vocabulary?').reason).toBe('student_advice_query');
    });

    it('detects essay prompts and writing structures', () => {
      expect(detectGarbageQuestion('Evaluate – What do you think about climate change?').reason).toBe('essay_prompt_leak');
      expect(detectGarbageQuestion('Write about cause and effect of pollution').reason).toBe('essay_structure_leak');
      expect(detectGarbageQuestion('IELTS Writing task tips and band scores').reason).toBe('writing_task_leak');
    });

    it('returns false for authentic clean IELTS questions', () => {
      expect(detectGarbageQuestion('What qualities make a good interviewer?').isGarbage).toBe(false);
      expect(detectGarbageQuestion('Describe a memorable trip you took with your friends.').isGarbage).toBe(false);
      expect(detectGarbageQuestion('Do you prefer reading books or watching documentaries?').isGarbage).toBe(false);
    });

    it('executes runPurgeScript cleanly in dry-run mode without crashing', async () => {
      const origArgv = process.argv;
      process.argv = [...origArgv, '--dry-run'];
      try {
        await expect(runPurgeScript()).resolves.not.toThrow();
      } finally {
        process.argv = origArgv;
      }
    });
  });

  describe('Ingestion Integration Filtering', () => {
    it('drops student comments and upserts authentic questions during ingestion', async () => {
      const validCandidate = {
        part: 'PART_1' as const,
        questionText: 'Do you prefer cooking homemade meals or dining at restaurants with family?',
        source: 'AI_CURATION_TEST_VALID',
      };

      const junkCandidate = {
        part: 'PART_1' as const,
        questionText: 'Will these questions be asked in 2026? Please reply! 🤔',
        source: 'AI_CURATION_TEST_JUNK',
      };

      const result = await questionIngestionService.runIngestion({
        customSources: [validCandidate, junkCandidate],
        force: true,
      });

      expect(result.status).toBe('SUCCESS');

      // The valid question should exist in database
      const savedValid = await prisma.ieltsQuestion.findFirst({
        where: { questionText: validCandidate.questionText },
      });
      expect(savedValid).toBeDefined();

      // The junk question should NOT exist in database
      const savedJunk = await prisma.ieltsQuestion.findFirst({
        where: { questionText: { contains: 'Will these questions be asked' } },
      });
      expect(savedJunk).toBeNull();
    });
  });
});
