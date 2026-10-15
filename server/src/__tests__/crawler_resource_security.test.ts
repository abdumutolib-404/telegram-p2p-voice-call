import { afterEach, expect, it, vi } from 'vitest';
import { webCrawlerService } from '../services/crawler/webCrawlerService';
import { aiCurationService, heuristicCuration } from '../services/crawler/aiCurationService';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { questionIngestionService } from '../services/crawler/ingestionService';
import { IeltsPart } from '@prisma/client';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it.each(['?', '？'])('rejects an oversized nonmatching %s line while retaining the following real question', delimiter => {
  const html = `<h2>Speaking Part 1</h2><p>${delimiter.repeat(250000)}x</p><p>How do you usually spend time with your family?</p>`;
  const result = webCrawlerService.parseHtmlContent(html, 'https://example.com/speaking');
  expect(result.map(item => item.questionText)).toEqual(['How do you usually spend time with your family?']);
});

it('rejects unique page and direct AI floods before provider work', async () => {
  expect(() => webCrawlerService.parseHtmlContent(`<h2>Speaking Part 1</h2>${'<p>How do you usually spend time with your family?</p>'.repeat(502)}`, 'https://example.com/speaking')).toThrow('budget');
  await expect(aiCurationService.curateQuestionBatch(Array.from({length:501},()=>({text:'How do you usually spend your weekends?'})))).rejects.toThrow('budget');
  await expect(aiCurationService.curateQuestionBatch([{text:'x'.repeat(3000)}])).rejects.toThrow('budget');
});
it('shares one provider attempt budget across batches and schema/model fallbacks', async () => {
  vi.spyOn(aiCurationService as any, 'getSanitizedApiKey').mockReturnValue('synthetic-budget-key');
  const generate = vi.fn().mockRejectedValue(new Error('400 schema synthetic failure'));
  vi.spyOn(GoogleGenerativeAI.prototype, 'getGenerativeModel').mockReturnValue({ generateContent: generate } as any);
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({models:[]}))); vi.stubGlobal('fetch',fetch);
  const candidates = Array.from({length:500},(_,i)=>({text:`How do you usually spend your weekends with family member ${i}?`}));
  const result = await aiCurationService.curateQuestionBatch(candidates);
  expect(result).toHaveLength(500); expect(result[499].index).toBe(499);
  expect(generate.mock.calls.length + fetch.mock.calls.length).toBeLessThanOrEqual(12);
  expect(generate).toHaveBeenCalled();
});
it('deduplicates repeated raw questions before AI and retains a representative for refresh', async () => {
  const curate = vi.spyOn(aiCurationService, 'curateQuestionBatch').mockImplementation(async candidates => candidates.map((candidate,index)=>heuristicCuration(candidate,index)));
  const candidate = {part:IeltsPart.PART_1,questionText:'How do you usually spend your weekends with your family?',source:'SECURITY_FIXTURE'};
  const result = await questionIngestionService.runIngestion({customSources:Array.from({length:1000},()=>candidate)});
  expect(result.status).toBe('SUCCESS'); expect(curate).toHaveBeenCalledOnce();
  expect(curate.mock.calls[0][0].filter(item=>item.text===candidate.questionText)).toHaveLength(1);
  expect(result.duplicatesSkipped).toBeGreaterThanOrEqual(999);
});
it('recognizes trailing emoji and quotes without accepting an emoji only before a nonterminal question mark', () => {
  const result = webCrawlerService.parseHtmlContent('<h2>Speaking Part 1</h2><p>How do you usually spend your weekends with your family？ ”</p><p>What do you like the most about the town where you grew up? 😊</p><p>😊 This is a heading? followed by ordinary text</p>', 'https://example.com/speaking');
  expect(result).toHaveLength(2);
  expect(result[0].questionText).toContain('weekends'); expect(result[1].questionText).toContain('grew up');
});
