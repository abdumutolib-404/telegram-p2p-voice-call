import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AiCurationService, _resetDiscoveredModelsCache } from '../services/crawler/aiCurationService';

const signals: Array<AbortSignal | null | undefined> = [];
beforeEach(() => {
  vi.useFakeTimers(); vi.stubEnv('GEMINI_API_KEY', 'synthetic-timeout-fixture');
  _resetDiscoveredModelsCache(); signals.length = 0;
  vi.stubGlobal('fetch', vi.fn((url: string, options?: RequestInit) => {
    if (!String(url).includes(':generateContent')) return Promise.resolve(new Response(JSON.stringify({ models: [] }), { status: 200 }));
    signals.push(options?.signal);
    return new Promise<Response>((_resolve, reject) => {
      options?.signal?.addEventListener('abort', () => reject(new DOMException('Synthetic request aborted', 'AbortError')), { once: true });
    });
  }));
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); _resetDiscoveredModelsCache(); });

it('aborts stalled curation and returns the existing heuristic fallback within the request deadline', async () => {
  const service = new AiCurationService();
  vi.spyOn(service, 'getCandidateModels').mockReturnValue(['synthetic-delayed-model']);
  let result: Awaited<ReturnType<typeof service.curateQuestionBatch>> | undefined;
  const work = service.curateQuestionBatch([{ text: 'What sports or physical exercise activities do you regularly engage in?' }]).then(value => { result = value; });
  await vi.advanceTimersByTimeAsync(30001);
  expect(result).toBeDefined();
  expect(signals).toHaveLength(1); expect(signals[0]?.aborted).toBe(true);
  await work;
  expect(result?.[0].isValidIeltsSpeaking).toBe(true);
  expect(result?.[0].canonicalTopicSlug).toBe('health-fitness-sports');
  expect(service.getGeminiStatus().status).toBe('FAILED');
});

it('cancels the underlying SDK ping when its shorter deadline expires', async () => {
  const service = new AiCurationService();
  vi.spyOn(service, 'getCandidateModels').mockReturnValue(['synthetic-delayed-model']);
  const check = service.checkGeminiConnection(true);
  await vi.advanceTimersByTimeAsync(10001);
  expect((await check).status).toBe('FAILED');
  expect(signals).toHaveLength(1); expect(signals[0]?.aborted).toBe(true);
});
