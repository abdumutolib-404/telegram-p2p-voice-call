import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Dashboard } from '../src/components/Dashboard';
import type { UserMatchData } from '../src/types';

const profile: UserMatchData = { userId: 'fixture-only', alias: 'P2P-FIXTURE', band: 7, weakSkill: 'FC', strongSkill: 'LR', callsRemaining: 8 };
const conversation = { id: '11111111-1111-4111-8111-111111111111', partnerAlias: 'P2P-PARTNER', partnerBand: 7, status: 'COMPLETED', duration: 122, createdAt: '2026-10-01', rating: null, reported: false, recordingAvailable: true, recordingExpiresAt: '2026-10-31' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
let root: Root;
let container: HTMLDivElement;
let mounted: boolean;
const onProfileUpdated = vi.fn(), onAccessLost = vi.fn(), onOpenActiveCall = vi.fn();
const render = async () => act(async () => root.render(createElement(Dashboard, { initData: 'synthetic-signed-data', userData: profile, onProfileUpdated, onAccessLost, onOpenActiveCall, renderPractice: navigation => createElement('div', null, navigation, 'Practice fixture') })));
const button = (text: string) => Array.from(container.querySelectorAll('button')).find(item => item.textContent?.includes(text))!;

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  window.history.replaceState(null, '', '/');
  container = document.createElement('div'); document.body.append(container);
  root = createRoot(container); mounted = true;
});
afterEach(async () => {
  if (mounted) await act(async () => root.unmount());
  container.remove(); vi.unstubAllGlobals();vi.useRealTimers();
});

it('shows a history error with retry without suggesting no conversations exist',async()=>{
  window.history.replaceState(null,'','/?view=history');
  vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new Error('Synthetic connection failure')));
  await render();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('Synthetic connection failure');
  expect(container.textContent).not.toContain('Your first conversation is ahead.');
  expect(button('Reload current view')).toBeTruthy();
});

it('uses a particular private segment when downloading earlier audio',async()=>{
  window.history.replaceState(null,'','/?view=history');
  const fetchMock=vi.fn().mockResolvedValueOnce(json({sessions:[{...conversation,recordings:[{id:'segment-one',createdAt:'2026-10-01',expiresAt:'2026-10-31'}]}],nextCursor:null})).mockResolvedValueOnce(json({url:'javascript:denied'}));
  vi.stubGlobal('fetch',fetchMock);await render();
  await act(async()=>button('Audio').click());
  expect(fetchMock.mock.calls[1][0]).toContain('segment=segment-one');
  expect(container.querySelector('[role="alert"]')).toBeTruthy();
});

it('keeps practice usable without making unrelated dashboard requests', async () => {
  const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
  await render();
  expect(container.textContent).toContain('Practice fixture');
  expect(fetchMock).not.toHaveBeenCalled();
});

it('submits one signed rating and refreshes the persisted result', async () => {
  window.history.replaceState(null, '', '/?view=history');
  const fetchMock = vi.fn().mockResolvedValueOnce(json({ sessions: [conversation], nextCursor: null }))
    .mockResolvedValueOnce(json({ success: true }))
    .mockResolvedValueOnce(json({ sessions: [{ ...conversation, rating: 5 }], nextCursor: null }));
  vi.stubGlobal('fetch', fetchMock); await render();
  await act(async () => (container.querySelector('[aria-label="5 stars"]') as HTMLButtonElement).click());
  const [url, options] = fetchMock.mock.calls[1] as [string, RequestInit];
  expect(url).toContain(`/sessions/${conversation.id}/rating`);
  expect(options.headers).toMatchObject({ 'x-telegram-init-data': 'synthetic-signed-data' });
  expect(options.method).toBe('POST'); expect(JSON.parse(String(options.body))).toEqual({ stars: 5 });
  expect(options.cache).toBe('no-store');
  expect((container.querySelector('[aria-label="5 stars"]') as HTMLButtonElement).disabled).toBe(true);
  expect(container.textContent).toContain('Rating saved. Thank you.');
});

it('does not treat an invitation-role rejection as loss of account access', async () => {
  window.history.replaceState(null, '', '/?view=partners');
  vi.stubGlobal('fetch', vi.fn((url: string, options?: RequestInit) => {
    if (options?.method === 'POST') return Promise.resolve(json({ error: 'This invitation action is unavailable.' }, 403));
    return Promise.resolve(json(url.endsWith('/favorites') ? { favorites: [] } : { invitations: [{ id: conversation.id, status: 'PENDING', incoming: true, partnerAlias: 'P2P-PARTNER' }] }));
  }));
  await render(); await act(async () => button('Accept invitation').click());
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('This invitation action is unavailable.');
  expect(onAccessLost).not.toHaveBeenCalled();
});

it('opens practice after accepting an invitation so the voice join control is visible', async () => {
  window.history.replaceState(null, '', '/?view=partners');
  vi.stubGlobal('fetch', vi.fn((url: string, options?: RequestInit) => Promise.resolve(json(options?.method === 'POST'
    ? { success: true, activeCallId: conversation.id }
    : url.endsWith('/favorites') ? { favorites: [] } : { invitations: [{ id: conversation.id, status: 'PENDING', incoming: true, partnerAlias: 'P2P-PARTNER' }] }))));
  await render(); await act(async () => button('Accept invitation').click());
  expect(onOpenActiveCall).toHaveBeenCalledOnce(); expect(container.textContent).toContain('Practice fixture');
  expect(new URLSearchParams(window.location.search).get('view')).toBe('practice');
});

it('reauthenticates on a revoked terms gate instead of displaying stale private data', async () => {
  window.history.replaceState(null, '', '/?view=history');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ code: 'terms_required', error: 'Accept the current terms.' }, 403)));
  await render(); expect(onAccessLost).toHaveBeenCalledOnce();
});

it('aborts history requests when navigating away and ignores a late response', async () => {
  window.history.replaceState(null, '', '/?view=history');
  let resolve!: (response: Response) => void;
  const fetchMock = vi.fn().mockImplementation(() => new Promise<Response>(done => { resolve = done; }));
  vi.stubGlobal('fetch', fetchMock); await render();
  const signal = (fetchMock.mock.calls[0][1] as RequestInit).signal!;
  await act(async () => button('Practice').click()); expect(signal.aborted).toBe(true);
  await act(async () => resolve(json({ sessions: [conversation], nextCursor: null })));
  expect(container.textContent).toContain('Practice fixture'); expect(container.textContent).not.toContain('P2P-PARTNER');
});

it('requests recording access with a header and rejects an unsafe download URL', async () => {
  window.history.replaceState(null, '', '/?view=history');
  const fetchMock = vi.fn().mockResolvedValueOnce(json({ sessions: [conversation], nextCursor: null })).mockResolvedValueOnce(json({ url: 'javascript:alert(1)' }));
  vi.stubGlobal('fetch', fetchMock); const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  await render(); await act(async () => button('Download audio').click());
  const [url, options] = fetchMock.mock.calls[1] as [string, RequestInit];
  expect(url).toContain(`/api/calls/${conversation.id}/recording?format=json`); expect(url).not.toContain('synthetic-signed-data');
  expect(options.headers).toMatchObject({ 'x-telegram-init-data': 'synthetic-signed-data' });
  expect(click).not.toHaveBeenCalled(); expect(container.querySelector('[role="alert"]')?.textContent).toContain('The recording link is unavailable.');
});
