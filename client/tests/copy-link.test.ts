import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CopyButton } from '../src/components/CopyLink';

let root: Root, container: HTMLDivElement;
let originalCopy: PropertyDescriptor | undefined;
const value = 'https://t.me/PairTalkBot?start=ref_fixture';
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  originalCopy = Object.getOwnPropertyDescriptor(document, 'execCommand');
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); if (originalCopy) Object.defineProperty(document, 'execCommand', originalCopy); else Reflect.deleteProperty(document, 'execCommand'); });
const render = () => act(async () => root.render(createElement(CopyButton, { value, label: 'invite link' })));

it('copies the exact URL once and confirms only after the clipboard resolves', async () => {
  let finish!: () => void;
  const writeText = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
  vi.stubGlobal('navigator', { clipboard: { writeText } });
  await render(); const button = container.querySelector('button')!;
  await act(async () => { button.click(); button.click(); });
  expect(writeText).toHaveBeenCalledExactlyOnceWith(value);
  expect(button.textContent).toContain('Copying'); expect(button.textContent).not.toContain('Copied');
  await act(async () => finish());
  expect(button.textContent).toContain('Copied'); expect(button.disabled).toBe(false);
  expect(container.querySelector('[role="alert"]')).toBeNull();
});

it('falls back in an older webview, removes the temporary field and preserves focus', async () => {
  vi.stubGlobal('navigator', {});
  const copy = vi.fn(() => true);
  Object.defineProperty(document, 'execCommand', { value: copy, configurable: true });
  await render(); const button = container.querySelector('button')!;
  await act(async () => button.click());
  expect(copy).toHaveBeenCalledWith('copy'); expect(button.textContent).toContain('Copied');
  expect(document.querySelector('textarea')).toBeNull(); expect(document.activeElement).toBe(button);
});

it('provides a selectable URL without claiming success when all clipboard paths fail', async () => {
  vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('Denied')) } });
  Object.defineProperty(document, 'execCommand', { value: vi.fn(() => false), configurable: true });
  await render(); await act(async () => container.querySelector('button')!.click());
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('copy it manually');
  expect(container.querySelector('input')?.value).toBe(value);
  expect(container.querySelector('button')?.textContent).not.toContain('Copied');
  expect(document.querySelector('textarea')).toBeNull();
});

it('does not mark a newly supplied URL copied when the previous copy finishes', async () => {
  let finish!: () => void;
  vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn(() => new Promise<void>(resolve => { finish = resolve; })) } });
  await render(); await act(async () => container.querySelector('button')!.click());
  await act(async () => root.render(createElement(CopyButton, { value: 'https://pairtalk.online/pricing', label: 'price link' })));
  await act(async () => finish());
  expect(container.querySelector('button')?.textContent).toBe('Copy');
  expect(container.querySelector('button')?.disabled).toBe(false);
});
