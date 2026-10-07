import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PricingPage } from '../../landing/src/components/PricingPage';
import { PlansModal } from '../src/components/PlansModal';
import type { PublicPricing, PublicPlan } from '../../server/src/contracts/pricing';

const plus: PublicPlan = { id: 'PLUS', name: 'Focus', description: 'Sample practice plan', calls: 12, unlimitedCalls: false, maxCallMinutes: 35, recordings: 4, retentionDays: 12, validityDays: 45, period: 'subscription', prices: { XTR: 123, UZS: 24000 } };
const catalog: PublicPricing = { version: 1, revision: 'a'.repeat(64), checkedAt: '2026-10-07T12:00:00Z', botUsername: 'FixturePracticeBot', plans: [plus] };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
let container: HTMLDivElement, root: Root, mounted: boolean;
beforeEach(() => { vi.clearAllMocks(); Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); container = document.createElement('div'); document.body.append(container); root = createRoot(container); mounted = true; });
afterEach(async () => { if (mounted) await act(async () => root.unmount()); container.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });

it('uses the same live catalog on the public page and client plan chooser', async () => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => json(catalog)));
  await act(async () => root.render(createElement(PricingPage)));
  expect(container.textContent).toContain('123 Stars'); expect(container.textContent).toContain('24,000 UZS'); expect(container.textContent).toContain('45-day period');
  expect(container.querySelector('a[href*="upgrade_plus"]')?.getAttribute('href')).toContain('FixturePracticeBot');
  await act(async () => root.render(createElement(PlansModal, { isOpen: true, onClose: vi.fn() })));
  expect(container.textContent).toContain('123'); expect(container.textContent).toContain('24,000 UZS'); expect(container.textContent).toContain('12 calls per 45-day period');
  expect(container.textContent).not.toContain('79'); expect(container.textContent).not.toContain('MOST POPULAR');
});
it('refreshes a published price change without reloading the page', async () => {
  vi.useFakeTimers(); const fetchMock = vi.fn().mockResolvedValueOnce(json(catalog)).mockResolvedValue(json({ ...catalog, revision: 'b'.repeat(64), plans: [{ ...plus, prices: { XTR: 187, UZS: 27000 } }] }));
  vi.stubGlobal('fetch', fetchMock); await act(async () => root.render(createElement(PricingPage)));
  expect(container.textContent).toContain('123 Stars');
  await act(async () => vi.advanceTimersByTimeAsync(30000));
  expect(container.textContent).toContain('187 Stars'); expect(container.textContent).not.toContain('123 Stars');
  expect(fetchMock.mock.calls[0][1]).toMatchObject({ cache: 'no-store', credentials: 'omit' });
});
it('removes unavailable offers and never keeps a purchasable stale quote after a refresh failure', async () => {
  vi.useFakeTimers(); const fetchMock = vi.fn().mockResolvedValueOnce(json(catalog)).mockResolvedValue(json({}, 503));
  vi.stubGlobal('fetch', fetchMock); await act(async () => root.render(createElement(PricingPage)));
  await act(async () => vi.advanceTimersByTimeAsync(30000));
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('We could not verify current prices');
  expect(container.textContent).not.toContain('123 Stars'); expect(container.querySelector('a[href*="upgrade_plus"]')).toBeNull();
});
it('bounds a stalled pricing request and lets the learner retry', async () => {
  vi.useFakeTimers(); vi.stubGlobal('fetch', vi.fn((_url, options: RequestInit) => new Promise((_resolve, reject) => options.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))))));
  await act(async () => root.render(createElement(PricingPage)));
  await act(async () => vi.advanceTimersByTimeAsync(8000));
  expect(container.querySelector('[role="alert"]')).toBeTruthy();
  expect(Array.from(container.querySelectorAll('button')).some(button => button.textContent?.includes('Retry prices'))).toBe(true);
});
it('cleans up pricing fetches when a view is closed', async () => {
  let signal: AbortSignal | null | undefined;
  vi.stubGlobal('fetch', vi.fn((_url, options: RequestInit) => new Promise((_resolve, reject) => { signal = options.signal; signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))); })));
  await act(async () => root.render(createElement(PlansModal, { isOpen: true, onClose: vi.fn() })));
  await act(async () => root.unmount()); mounted = false; expect(signal?.aborted).toBe(true);
});
it('compares the selected currency without fabricating an exchange rate', async () => {
  const pro = { ...plus, id: 'PRO' as const, name: 'Intensive', prices: { XTR: 100, UZS: 70000 } };
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ ...catalog, plans: [plus, pro] })));
  await act(async () => root.render(createElement(PricingPage)));
  expect(container.querySelector('.pricing-recommendation')?.textContent).toContain('Intensive');
  await act(async () => Array.from(container.querySelectorAll('button')).find(button => button.textContent === 'Uzbek sum')!.click());
  expect(container.querySelector('.pricing-recommendation')?.textContent).toContain('Focus');
  expect(container.querySelector('.pricing-recommendation')?.textContent).toContain('UZS');
});
