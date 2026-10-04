import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QuestionsDrawer } from '../src/components/QuestionsDrawer';

let root: Root;
let container: HTMLDivElement;
const close = vi.fn();
const json = (data: unknown) => new Response(JSON.stringify(data), { status: 200 });
const render = async (isOpen: boolean) => act(async () => root.render(createElement(QuestionsDrawer, { isOpen, onClose: close })));
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); vi.clearAllMocks();
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); vi.useRealTimers(); vi.unstubAllGlobals(); container.remove(); });

it('keeps the closed question panel free of background requests', async () => {
  const fetch = vi.fn(async () => json({ success: true, topics: [], questions: [] })); vi.stubGlobal('fetch', fetch);
  await render(false);
  expect(fetch).not.toHaveBeenCalled();
});

it('aborts panel requests when the panel closes', async () => {
  const signals: AbortSignal[] = [];
  vi.stubGlobal('fetch', vi.fn((_url: string, options: RequestInit) => new Promise((_resolve, reject) => {
    if (options.signal) { signals.push(options.signal); options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true }); }
  })));
  await render(true); await render(false);
  expect(signals).toHaveLength(2);
  expect(signals.every(signal => signal.aborted)).toBe(true);
});

it('bounds stalled requests and labels locally available prompts accurately', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', vi.fn((_url: string, options: RequestInit) => new Promise((_resolve, reject) => {
    options.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
  })));
  await render(true); await act(async () => vi.advanceTimersByTimeAsync(8000));
  expect(container.textContent).toContain('Live questions could not be loaded.');
  expect(container.textContent).toContain('practice prompts');
  expect(container.textContent).not.toContain('Loading questions');
});

it('ignores an obsolete question body after a different part is selected', async () => {
  let resolveBody!: (value: unknown) => void;
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.includes('/topics')) return json({ success: true, topics: [] });
    if (url.includes('PART_1')) return { ok: true, json: () => new Promise(resolve => { resolveBody = resolve; }) };
    return json({ success: true, questions: [{ id: 'new-question', topicId: 'topic', part: 'PART_2', questionText: 'Current part-two prompt', questionType: 'CUE_CARD', source: 'synthetic', cueCardBullets: JSON.stringify(['Valid bullet']) }] });
  }));
  await render(true);
  const button = Array.from(container.querySelectorAll('button')).find(button => button.textContent?.includes('PART 2'));
  await act(async () => button!.click());
  await act(async () => resolveBody({ success: true, questions: [{ id: 'old-question', part: 'PART_1', questionText: 'Obsolete prompt' }] }));
  expect(container.textContent).toContain('Current part-two prompt');
  expect(container.textContent).not.toContain('Obsolete prompt');
});

it('supports keyboard dismissal and restores the opener focus', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => json({ success: true, questions: [], topics: [] })));
  const opener = document.createElement('button'); opener.textContent = 'Questions'; document.body.append(opener); opener.focus();
  await render(true);
  const panel = container.querySelector('[role="dialog"]');
  expect(panel).toBeTruthy(); expect(panel?.contains(document.activeElement)).toBe(true);
  await act(async () => document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(close).toHaveBeenCalledOnce(); await render(false); expect(document.activeElement).toBe(opener); opener.remove();
});

it('does not steal question focus when the parent call clock rerenders with a new close callback', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => json({ success: true, questions: [], topics: [] })));
  await act(async () => root.render(createElement(QuestionsDrawer, { isOpen: true, onClose: () => close('first') })));
  const part = Array.from(container.querySelectorAll('button')).find(button => button.textContent?.includes('PART 2'))!;
  part.focus();
  await act(async () => root.render(createElement(QuestionsDrawer, { isOpen: true, onClose: () => close('latest') })));
  expect(document.activeElement).toBe(part);
  await act(async () => part.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(close).toHaveBeenCalledWith('latest');
});

it('handles malformed cue-card bullets without crashing the call interface', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => json(url.includes('/topics') ? { success: true, topics: [] } : {
    success: true, questions: [{ id: 'malformed-cue', topicId: 'topic', part: 'PART_2', questionText: 'A safe cue-card prompt', questionType: 'CUE_CARD', source: 'synthetic', cueCardBullets: JSON.stringify([{ unexpected: 'object' }, 'A valid bullet']) }],
  })));
  await render(true);
  const button = Array.from(container.querySelectorAll('button')).find(button => button.textContent?.includes('PART 2'));
  await act(async () => button!.click());
  expect(container.textContent).toContain('A safe cue-card prompt');
  expect(container.textContent).toContain('A valid bullet');
  expect(container.textContent).not.toContain('unexpected');
  expect(button?.getAttribute('aria-pressed')).toBe('true');
});

const openCueCard = async () => {
  vi.stubGlobal('fetch', vi.fn(async () => json({ success: true, questions: [], topics: [] })));
  await render(true);
  await act(async () => Array.from(container.querySelectorAll('button')).find(button => button.textContent?.includes('PART 2'))!.click());
};

it('keeps cue-card phase deadlines when the browser delays timer callbacks', async () => {
  vi.useFakeTimers(); const startedAt = new Date('2026-10-03T06:00:00Z'); vi.setSystemTime(startedAt);
  await openCueCard();
  await act(async () => Array.from(container.querySelectorAll('button')).find(button => button.textContent?.includes('Prep (1m)'))!.click());
  // Background tabs can postpone callbacks without pausing elapsed practice time.
  vi.setSystemTime(startedAt.getTime() + 75000);
  await act(async () => vi.advanceTimersByTimeAsync(1000));
  expect(container.textContent).toContain('Candidate Speaking');
  expect(container.textContent).toContain('01:44');
  vi.setSystemTime(startedAt.getTime() + 190000);
  await act(async () => document.dispatchEvent(new Event('visibilitychange')));
  expect(container.textContent).toContain('Time Complete');
  expect(container.textContent).toContain('00:00');
  expect(vi.getTimerCount()).toBe(0);
});

it('starts a fresh speaking deadline when preparation is skipped and clears it on close', async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-03T06:00:00Z'));
  await openCueCard();
  await act(async () => Array.from(container.querySelectorAll('button')).find(button => button.textContent?.includes('Prep (1m)'))!.click());
  await act(async () => vi.advanceTimersByTimeAsync(20000));
  await act(async () => Array.from(container.querySelectorAll('button')).find(button => button.textContent?.includes('Speak (2m)'))!.click());
  expect(container.textContent).toContain('02:00');
  await act(async () => vi.advanceTimersByTimeAsync(120000));
  expect(container.textContent).toContain('Time Complete');
  await render(false);
  expect(vi.getTimerCount()).toBe(0);
  await render(true);
  expect(container.textContent).toContain('Exam Prep Timer');
  expect(container.textContent).toContain('01:00');
  await act(async () => vi.advanceTimersByTimeAsync(180000));
  expect(container.textContent).toContain('Exam Prep Timer');
  expect(container.textContent).toContain('01:00');
});
