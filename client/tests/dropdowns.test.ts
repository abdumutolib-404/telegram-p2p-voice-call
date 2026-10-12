import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Mic, Settings, Sparkles } from 'lucide-react';
import { DashboardMenu } from '../src/components/DashboardMenu';
import { Select } from '../../admin/src/components/ui/Select';

let root: Root, container: HTMLDivElement;
beforeEach(() => {
  vi.useFakeTimers(); Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
const key = (element: Element, value: string) => act(async () => element.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true })));

it('retains a dismissed menu inert until its exit completes, reverses reopening, and restores Escape focus', async () => {
  await act(async () => root.render(createElement(DashboardMenu, { items: [{ id: 'practice', label: 'Practice', icon: Mic }, { id: 'account', label: 'Account', icon: Settings }, { id: 'upgrade', label: 'Upgrade', icon: Sparkles }], current: 'practice', onNavigate: vi.fn() })));
  const trigger = container.querySelector('button')!;
  await act(async () => trigger.click());
  const menu = document.querySelector('[role="menu"]')!;
  await act(async () => vi.advanceTimersByTimeAsync(40));
  await key(document.activeElement!, 'End'); expect(document.activeElement?.textContent).toBe('Upgrade');
  await key(menu, 'Escape'); expect(document.activeElement).toBe(trigger);
  expect(menu.getAttribute('data-state')).toBe('closing'); expect(menu.hasAttribute('inert')).toBe(true);
  await act(async () => vi.advanceTimersByTimeAsync(80));
  await act(async () => trigger.click());
  await act(async () => vi.advanceTimersByTimeAsync(200));
  expect(document.querySelector('[role="menu"]')).toBe(menu); expect(menu.getAttribute('data-state')).toBe('open');
  await key(menu, 'Escape'); await act(async () => vi.advanceTimersByTimeAsync(160));
  expect(document.querySelector('[role="menu"]')).toBeNull();
});
it('skips disabled options, supports multi-letter search, and closes without selecting on Tab', async () => {
  const choose = vi.fn();
  await act(async () => root.render(createElement(Select, { value: 'a', onValueChange: choose, 'aria-label': 'Plan' }, createElement('option', { value: 'a' }, 'Alpha'), createElement('option', { value: 'b', disabled: true }, 'Beta'), createElement('option', { value: 'c' }, 'Charlie'), createElement('option', { value: 'd' }, 'Delta'))));
  const trigger = container.querySelector('button')!;
  await act(async () => { trigger.focus(); trigger.click(); });
  await key(trigger, 'ArrowDown'); await key(trigger, 'Enter'); expect(choose).toHaveBeenLastCalledWith('c');
  await act(async () => trigger.click()); await key(trigger, 'd'); await key(trigger, 'e'); await key(trigger, 'Enter'); expect(choose).toHaveBeenLastCalledWith('d');
  await act(async () => trigger.click()); await act(async () => trigger.blur());
  expect(trigger.getAttribute('aria-expanded')).toBe('false');
  expect(document.querySelector('[role="listbox"]')?.hasAttribute('inert')).toBe(true);
});
it('dismisses outside and releases the popover immediately with reduced motion', async () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
  await act(async () => root.render(createElement(Select, { value: 'a', onValueChange: vi.fn(), 'aria-label': 'Plan' }, createElement('option', { value: 'a' }, 'Alpha'))));
  await act(async () => container.querySelector('button')!.click());
  expect(document.querySelector('[role="listbox"]')).toBeTruthy();
  await act(async () => document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })));
  await act(async () => vi.advanceTimersByTimeAsync(0));
  expect(document.querySelector('[role="listbox"]')).toBeNull();
});
