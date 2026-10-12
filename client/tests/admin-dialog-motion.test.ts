import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Dialog } from '../../admin/src/components/ui/Dialog';
import { DialogPresence } from '../../admin/src/components/ui/DialogPresence';

let root: Root, container: HTMLDivElement;
beforeEach(() => {
  vi.useFakeTimers(); Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  HTMLDialogElement.prototype.showModal = vi.fn(function(this: HTMLDialogElement) { this.open = true; });
  HTMLDialogElement.prototype.close = vi.fn(function(this: HTMLDialogElement) { this.open = false; });
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
const render = (open: boolean) => act(async () => root.render(createElement(DialogPresence, null, open && createElement(Dialog, { title: 'Edit', onClose: vi.fn() }, createElement('input', { defaultValue: 'Retained draft', 'aria-label': 'Draft' })))));

it('preserves the native dialog and its draft during inert exit, then releases scroll lock', async () => {
  await render(true); const dialog = document.querySelector('dialog')!;
  await render(false);
  expect(dialog.open).toBe(true); expect(dialog.hasAttribute('inert')).toBe(true);
  expect(dialog.getAttribute('data-state')).toBe('closing');
  expect(document.body.style.overflow).toBe('hidden');
  expect(dialog.querySelector('input')?.value).toBe('Retained draft');
  await act(async () => vi.advanceTimersByTimeAsync(179)); expect(document.querySelector('dialog')).toBe(dialog);
  await act(async () => vi.advanceTimersByTimeAsync(1)); expect(document.querySelector('dialog')).toBeNull(); expect(document.body.style.overflow).toBe('');
});
it('cancels a dismissed dialog removal on reopening and honors reduced motion', async () => {
  await render(true); const dialog = document.querySelector('dialog');
  await render(false); await act(async () => vi.advanceTimersByTimeAsync(80)); await render(true);
  await act(async () => vi.advanceTimersByTimeAsync(200)); expect(document.querySelector('dialog')).toBe(dialog);
  expect(dialog?.getAttribute('data-state')).toBe('open'); expect(dialog?.hasAttribute('inert')).toBe(false);
  vi.stubGlobal('matchMedia', () => ({ matches: true })); await render(false);
  expect(document.querySelector('dialog')).toBeNull();
});
