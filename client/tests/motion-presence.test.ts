import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MotionPresence } from '../src/components/MotionPresence';

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.useFakeTimers();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers();
});
const render = (open: boolean, label = 'Sheet') => act(async () => root.render(
  createElement(MotionPresence, { duration: 240 }, open && createElement('button', null, label)),
));

it('keeps the last sheet inert during exit and releases it at the transition boundary', async () => {
  await render(true);
  await act(async () => vi.advanceTimersByTimeAsync(40));
  expect(container.querySelector('[data-motion-state="open"]')).toBeTruthy();
  await render(false);
  const closing = container.querySelector('[data-motion-state="closing"]');
  expect(closing?.textContent).toBe('Sheet');
  expect(closing?.hasAttribute('inert')).toBe(true);
  expect(closing?.getAttribute('aria-hidden')).toBe('true');
  await act(async () => vi.advanceTimersByTimeAsync(239));
  expect(container.textContent).toBe('Sheet');
  await act(async () => vi.advanceTimersByTimeAsync(1));
  expect(container.textContent).toBe('');
});

it('cancels a pending removal when the sheet is reopened', async () => {
  await render(true, 'First');
  await render(false);
  await act(async () => vi.advanceTimersByTimeAsync(120));
  await render(true, 'Reopened');
  await act(async () => vi.advanceTimersByTimeAsync(300));
  expect(container.textContent).toBe('Reopened');
  expect(container.querySelector('[inert]')).toBeNull();
});

it('skips the exit delay when reduced motion is enabled', async () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
  await render(true);
  await render(false);
  await act(async () => vi.advanceTimersByTimeAsync(0));
  expect(container.textContent).toBe('');
});
