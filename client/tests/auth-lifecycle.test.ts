import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, createElement, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { App } from '../src/App';

const transport = vi.hoisted(() => ({
  socket: { connected: true, on: vi.fn(), off: vi.fn(), io: { on: vi.fn(), off: vi.fn() } },
  connect: vi.fn(), disconnect: vi.fn(),
}));
vi.mock('../src/services/socket', () => ({ socketService: {
  connect: (...args: unknown[]) => { transport.connect(...args); return transport.socket; },
  disconnect: transport.disconnect, getSocket: () => transport.socket,
  joinQueue: vi.fn(), cancelQueue: vi.fn(), finishCall: vi.fn(), peerReady: vi.fn(),
} }));
vi.mock('../src/services/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

let root: Root;
let container: HTMLDivElement;
let mounted: boolean;
const profile = {
  success: true,
  user: { id: 'synthetic-user', alias: 'Practice fixture alias', band: 6.5, plan: 'FREE', callsRemaining: 3 },
};
const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200, headers: { 'Content-Type': 'application/json' } });

it.each([
  ['banned', 'PERMANENT MODERATION LOCK', 'Account is permanently banned.'],
  ['suspended', 'ACCOUNT SUSPENDED', 'Account is suspended pending review.'],
])('shows the backend %s reason without misclassifying it as an expired signature', async (code, heading, error) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ code, status: code, error, bannedUntil: null }), { status: 403, headers: { 'Content-Type': 'application/json' } })));
  await act(async () => root.render(createElement(App)));
  expect(container.querySelector('h1')?.textContent).toContain(heading);
  expect(container.textContent).toContain(error);
  expect(container.textContent).not.toContain('Calculating cooldown');
  expect(container.textContent).not.toContain('AUTHENTICATION SIGNATURE EXPIRED');
  expect(transport.connect).not.toHaveBeenCalled();
});

it('provides reauthentication when a dated suspension expires', async () => {
  vi.useFakeTimers();
  const response = new Response(JSON.stringify({ code: 'suspended', bannedUntil: new Date(Date.now() + 60000).toISOString(), error: 'Account is temporarily suspended.' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response).mockResolvedValueOnce(json(profile)).mockResolvedValueOnce(json({ hasActiveCall: false })));
  await act(async () => root.render(createElement(App)));
  expect(Array.from(container.querySelectorAll('button')).some(button => button.textContent?.includes('Retry Connection'))).toBe(false);
  await act(async () => vi.advanceTimersByTimeAsync(61000));
  expect(Array.from(container.querySelectorAll('button')).some(button => button.textContent?.includes('Retry Connection'))).toBe(true);
  expect(container.textContent).toContain('Expired. Re-authenticate to resume.');
  expect(transport.connect).not.toHaveBeenCalled();
  const retry = Array.from(container.querySelectorAll('button')).find(button => button.textContent?.includes('Retry Connection'))!;
  await act(async () => retry.click());
  expect(container.textContent).toContain('Practice fixture alias');
  expect(transport.connect).toHaveBeenCalled();
});

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  Object.defineProperty(window, 'Telegram', { configurable: true, value: { WebApp: {
    initData: 'synthetic-telegram-credential', ready: vi.fn(), expand: vi.fn(),
  } } });
  window.history.replaceState(null, '', '/');
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  mounted = true;
});

afterEach(async () => {
  if (mounted) await act(async () => root.unmount());
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete window.Telegram;
  container.remove();
});

it('aborts the first Strict Mode authentication and ignores a late stale response', async () => {
  let resolveFirst!: (response: Response) => void;
  const first = new Promise<Response>(resolve => { resolveFirst = resolve; });
  const fetchMock = vi.fn()
    .mockReturnValueOnce(first)
    .mockResolvedValueOnce(json(profile))
    .mockResolvedValueOnce(json({ hasActiveCall: false }));
  vi.stubGlobal('fetch', fetchMock);
  await act(async () => root.render(createElement(StrictMode, null, createElement(App))));
  await vi.waitFor(() => expect(container.textContent).toContain('Practice fixture alias'));
  const options = fetchMock.mock.calls[0][1] as RequestInit;
  expect(options.signal?.aborted).toBe(true);
  await act(async () => { resolveFirst(json({ success: false, error: 'Stale rejection' })); });
  expect(container.textContent).toContain('Practice fixture alias');
  expect(container.textContent).not.toContain('Stale rejection');
});

it('bounds a stalled authentication request and displays a retryable timeout', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', vi.fn((_input: RequestInfo, options: RequestInit) => new Promise<Response>((_resolve, reject) => {
    options.signal?.addEventListener('abort', () => reject(new DOMException('Request aborted', 'AbortError')), { once: true });
  })));
  await act(async () => root.render(createElement(App)));
  await act(async () => { await vi.advanceTimersByTimeAsync(20000); });
  expect(container.textContent).toContain('The server took too long to respond. Please try again.');
  expect(transport.connect).not.toHaveBeenCalled();
});

it('aborts authentication when the Mini App unmounts', async () => {
  let signal: AbortSignal | null | undefined;
  vi.stubGlobal('fetch', vi.fn((_input: RequestInfo, options: RequestInit) => new Promise<Response>((_resolve, reject) => {
    signal = options.signal;
    signal?.addEventListener('abort', () => reject(new DOMException('Request aborted', 'AbortError')), { once: true });
  })));
  await act(async () => root.render(createElement(App)));
  await act(async () => root.unmount());
  mounted = false;
  expect(signal?.aborted).toBe(true);
  expect(transport.connect).not.toHaveBeenCalled();
});

it('forwards the selected call ID without copying launch credentials into API URLs', async () => {
  window.history.replaceState(null, '', '/?active_call=selected-call&tgWebAppData=synthetic-query-secret&initData=synthetic-second-secret');
  const fetchMock = vi.fn().mockResolvedValueOnce(json(profile)).mockResolvedValueOnce(json({ hasActiveCall: false }));
  vi.stubGlobal('fetch', fetchMock);
  await act(async () => root.render(createElement(App)));
  await vi.waitFor(() => expect(container.textContent).toContain('Practice fixture alias'));
  const url = String(fetchMock.mock.calls[1][0]);
  expect(url).toContain('active_call=selected-call');
  expect(url).not.toContain('synthetic-query-secret');
  expect(url).not.toContain('synthetic-second-secret');
  expect(url).not.toContain('tgWebAppData');
});

it('waits for a delayed Telegram launch without abandoning authentication', async () => {
  vi.useFakeTimers(); window.Telegram!.WebApp.initData = '';
  const fetchMock = vi.fn().mockResolvedValueOnce(json(profile)).mockResolvedValueOnce(json({ hasActiveCall: false }));
  vi.stubGlobal('fetch', fetchMock);
  await act(async () => root.render(createElement(App)));
  await act(async () => vi.advanceTimersByTimeAsync(200));
  window.Telegram!.WebApp.initData = 'synthetic-delayed-launch';
  await act(async () => vi.advanceTimersByTimeAsync(100));
  expect(container.textContent).toContain('Practice fixture alias');
  expect(transport.connect).toHaveBeenCalledWith('synthetic-delayed-launch');
});

it('leaves initialization with an actionable launch message when Telegram data never arrives', async () => {
  vi.useFakeTimers(); window.Telegram!.WebApp.initData = '';
  const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
  await act(async () => root.render(createElement(App)));
  await act(async () => vi.advanceTimersByTimeAsync(1000));
  expect(container.textContent).not.toContain('INITIALIZING GATEWAY');
  expect(container.textContent).toContain('Please launch using the Bot Menu Button.');
  expect(fetchMock).not.toHaveBeenCalled();
  expect(transport.connect).not.toHaveBeenCalled();
});

it('shows a clear launch screen when the Telegram SDK is present in an ordinary browser', async () => {
  vi.useFakeTimers(); window.Telegram!.WebApp.initData = '';
  Object.assign(window.Telegram!.WebApp, { platform: 'unknown' });
  const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
  await act(async () => root.render(createElement(App)));
  await act(async () => vi.advanceTimersByTimeAsync(1000));
  expect(container.textContent).toContain('Your next conversation starts in Telegram.');
  expect(container.querySelector('a[href="https://t.me/PairTalkBot?startapp=1"]')).toBeTruthy();
  expect(container.textContent).not.toContain('inside Telegram');
  expect(container.textContent).not.toContain('<3 seconds');
  expect(fetchMock).not.toHaveBeenCalled();
});
