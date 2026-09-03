import { describe, it, expect, beforeEach } from 'vitest';
import { generateQuestionFingerprint, normalizeQuestionText } from '../services/crawler/fingerprint';
import { classifyTopic } from '../services/crawler/taxonomy';
import { questionIngestionService } from '../services/crawler/ingestionService';
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
});
