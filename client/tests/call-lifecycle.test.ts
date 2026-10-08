import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { App } from '../src/App';

const fixture = vi.hoisted(() => ({
  events: new Map<string, Set<(...args: unknown[]) => unknown>>(),
  socket: { connected: true, on: vi.fn(), off: vi.fn(), io: { on: vi.fn(), off: vi.fn() } },
  finish: vi.fn(), peerReady: vi.fn(), join: vi.fn(), cancel: vi.fn(),
  voice: { error: null as string | null, isConnected: true, isMicMuted: false, canPlaybackAudio: true,
    micError: null, micDeniedCount: 0, isPartnerConnected: true, analyserNode: null,
    connect: vi.fn(async () => {}), disconnect: vi.fn(), toggleMic: vi.fn(),
    retryMicrophone: vi.fn(async () => true), startAudio: vi.fn(async () => {}), getRoom: vi.fn(),
  },
}));
vi.mock('../src/services/socket', () => ({ socketService: {
  connect: () => fixture.socket, getSocket: () => fixture.socket, disconnect: vi.fn(),
  finishCall: fixture.finish, peerReady: fixture.peerReady, joinQueue: fixture.join, cancelQueue: fixture.cancel,
  getRecordingStatus: vi.fn(),
} }));
vi.mock('../src/hooks/useLiveKit', () => ({ useLiveKit: () => fixture.voice }));
vi.mock('../src/services/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.clearAllMocks(); fixture.events.clear(); fixture.voice.error = null;
  fixture.voice.connect.mockResolvedValue();
  // No audio device/canvas is needed to verify app transitions; jsdom cannot render canvas.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  fixture.socket.on.mockImplementation((name: string, listener: (...args: unknown[]) => unknown) => {
    const listeners = fixture.events.get(name) ?? new Set(); listeners.add(listener); fixture.events.set(name, listeners);
    return fixture.socket;
  });
  fixture.socket.off.mockImplementation((name: string, listener: (...args: unknown[]) => unknown) => fixture.events.get(name)?.delete(listener));
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  Object.defineProperty(window, 'Telegram', { configurable: true, value: { WebApp: {
    initData: 'synthetic-telegram-credential', ready: vi.fn(), expand: vi.fn(),
  } } });
  window.history.replaceState(null, '', '/');
  vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(JSON.stringify(url.includes('/auth')
    ? { success: true, user: { id: 'synthetic-user', alias: 'Fixture alias', band: 7, plan: 'FREE', callsRemaining: 3 } }
    : { hasActiveCall: false }), { status: 200 })));
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); vi.restoreAllMocks(); vi.unstubAllGlobals(); delete window.Telegram; container.remove(); });

async function emit(name: string, payload: unknown) {
  await act(async () => { for (const listener of Array.from(fixture.events.get(name) ?? [])) await listener(payload); });
}
async function search() {
  await act(async () => root.render(createElement(App)));
  const button = container.querySelector<HTMLButtonElement>('button[aria-label="Start speaking practice"]');
  expect(button, container.textContent ?? '').toBeTruthy();
  await act(async () => button!.click());
}
async function startCall() {
  await search();
  await emit('match_found', { roomName: 'synthetic-room', livekitToken: 'synthetic-token', partnerAlias: 'Fixture partner', partnerBand: 7, callDurationLimit: 900 });
  expect(fixture.peerReady).toHaveBeenCalledWith('synthetic-room');
}

it('sends one finish request when the user ends a call', async () => {
  await startCall();
  const button = container.querySelector<HTMLButtonElement>('button[aria-label="End call"]');
  expect(button).toBeTruthy(); await act(async () => button!.click());
  expect(fixture.finish).toHaveBeenCalledTimes(1);
  expect(container.textContent).toContain('Call concluded');
});

it('returns to dashboard history after a completed call without starting another search', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(JSON.stringify(url.includes('/auth')
    ? { success: true, user: { id: 'synthetic-user', alias: 'Fixture alias', band: 7, plan: 'FREE', callsRemaining: 3 } }
    : url.includes('/dashboard/sessions') ? { sessions: [], nextCursor: null } : { hasActiveCall: false }), { status: 200 })));
  await startCall();
  await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="End call"]')!.click());
  const history = Array.from(container.querySelectorAll('button')).find(button => button.textContent?.includes('History & audio'))!;
  const searches = fixture.join.mock.calls.length;
  await act(async () => history.click());
  expect(container.textContent).toContain('Every conversation counts.');
  expect(new URLSearchParams(window.location.search).get('view')).toBe('history');
  expect(fixture.join).toHaveBeenCalledTimes(searches);
});

it('leaves the call screen and informs the server when the voice room disconnects', async () => {
  await startCall(); fixture.voice.error = 'The voice room disconnected. Please reconnect.';
  await act(async () => root.render(createElement(App)));
  expect(container.textContent).toContain('The voice room disconnected. Please reconnect.');
  expect(fixture.finish).toHaveBeenCalledTimes(1);
  expect(fixture.voice.disconnect).toHaveBeenCalled();
});

it('shows an actionable error when signaling cannot connect while searching', async () => {
  await search(); await emit('connect_error', new Error('Synthetic transport unavailable'));
  expect(container.textContent).toContain('Unable to connect to matchmaking');
  expect(fixture.cancel).toHaveBeenCalledWith('synthetic-user');
});

it('refreshes the allowance before next partner and does not search when it is exhausted',async()=>{
  await startCall();await act(async()=>container.querySelector<HTMLButtonElement>('button[aria-label="End call"]')!.click());
  const searches=fixture.join.mock.calls.length;
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({user:{callsRemaining:0}}),{status:200})));
  const next=Array.from(container.querySelectorAll('button')).find(button=>button.textContent?.includes('Find Next Partner'))!;
  await act(async()=>next.click());
  expect(container.textContent).toContain('You have used your available calls');expect(fixture.join).toHaveBeenCalledTimes(searches);
});

it('lets the user cancel a stalled voice connection and ignores its late success',async()=>{
  let release!:()=>void;fixture.voice.connect.mockImplementationOnce(()=>new Promise<void>(resolve=>{release=resolve;}));
  await search();
  await act(async()=>{for(const listener of fixture.events.get('match_found')??[])void listener({roomName:'synthetic-room',livekitToken:'synthetic-token',partnerAlias:'Fixture partner',partnerBand:7,callDurationLimit:900});});
  const cancel=Array.from(container.querySelectorAll('button')).find(button=>button.textContent==='Cancel connection')!;
  expect(cancel).toBeTruthy();await act(async()=>cancel.click());
  await act(async()=>release());expect(fixture.finish).toHaveBeenCalledWith('synthetic-room','synthetic-user','connection_cancelled');
  expect(container.querySelector('[aria-label="End call"]')).toBeNull();
});
