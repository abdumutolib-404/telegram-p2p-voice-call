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
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  window.history.replaceState(null, '', '/');
  container = document.createElement('div'); document.body.append(container);
  root = createRoot(container); mounted = true;
});
afterEach(async () => {
  if (mounted) await act(async () => root.unmount());
  container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals();vi.useRealTimers();
});

it('shows a history error with retry without suggesting no conversations exist',async()=>{
  window.history.replaceState(null,'','/?view=history');
  vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new Error('Synthetic connection failure')));
  await render();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('Synthetic connection failure');
  expect(container.textContent).not.toContain('Your first conversation is ahead.');
  expect(button('Reload current view')).toBeTruthy();
});

it('requests Telegram delivery for a particular private segment',async()=>{
  window.history.replaceState(null,'','/?view=history');
  const fetchMock=vi.fn().mockResolvedValueOnce(json({sessions:[{...conversation,recordings:[{id:'segment-one',createdAt:'2026-10-01',expiresAt:'2026-10-31'}]}],nextCursor:null})).mockResolvedValueOnce(json({status:'QUEUED'},202));
  vi.stubGlobal('fetch',fetchMock);await render();
  await act(async()=>button('Send audio').click());
  expect(fetchMock.mock.calls[1][0]).toContain('/recording-delivery');
  expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({segmentId:'segment-one'});
  expect(container.textContent).toContain('Queued for Telegram');
  expect(container.textContent).not.toContain('Sent to Telegram');
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
  await act(async () => button('Menu').click());
  await act(async () => button('Practice').click()); expect(signal.aborted).toBe(true);
  expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
  await act(async () => resolve(json({ sessions: [conversation], nextCursor: null })));
  expect(container.textContent).toContain('Practice fixture'); expect(container.textContent).not.toContain('P2P-PARTNER');
});

it('requests Telegram audio with signed headers and displays delivery failure beside the conversation', async () => {
  window.history.replaceState(null, '', '/?view=history');
  const fetchMock = vi.fn().mockResolvedValueOnce(json({ sessions: [conversation], nextCursor: null })).mockResolvedValueOnce(json({ error: 'Audio could not be sent to Telegram.' },503));
  vi.stubGlobal('fetch', fetchMock); const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  await render(); await act(async () => button('Send audio').click());
  const [url, options] = fetchMock.mock.calls[1] as [string, RequestInit];
  expect(url).toContain(`/api/dashboard/sessions/${conversation.id}/recording-delivery`); expect(url).not.toContain('synthetic-signed-data');
  expect(options.headers).toMatchObject({ 'x-telegram-init-data': 'synthetic-signed-data' });
  expect(options.method).toBe('POST');
  expect(click).not.toHaveBeenCalled(); expect(container.querySelector('article [role="alert"]')?.textContent).toContain('Audio could not be sent to Telegram.');
});

it('confirms saving a partner and keeps failed reports open for correction', async () => {
  window.history.replaceState(null, '', '/?view=history');
  const fetchMock = vi.fn().mockResolvedValueOnce(json({ sessions: [conversation], nextCursor: null }))
    .mockResolvedValueOnce(json({ success: true }))
    .mockResolvedValueOnce(json({ sessions: [{ ...conversation, saved: true }], nextCursor: null }))
    .mockResolvedValueOnce(json({ error: 'Please retry this report.' }, 503));
  vi.stubGlobal('fetch', fetchMock); await render();
  await act(async () => button('Save partner').click());
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const saveDialog = container.querySelector('[role="dialog"]')!;
  await act(async () => (saveDialog.querySelector('.primary-button') as HTMLButtonElement).click());
  expect(container.querySelector('[role="dialog"]')).toBeNull();
  expect(button('Partner saved').disabled).toBe(true);
  expect(container.querySelector('article [role="status"]')?.textContent).toContain('Partner saved.');
  await act(async () => button('Report').click());
  await act(async () => button('Submit report').click());
  expect(container.querySelector('[role="dialog"] [role="alert"]')?.textContent).toContain('Please retry this report.');
});

it('only shows a sent confirmation after Telegram delivery has succeeded', async () => {
  window.history.replaceState(null, '', '/?view=history');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json({ sessions: [conversation], nextCursor: null })).mockResolvedValueOnce(json({ status: 'SENT' })));
  await render(); await act(async () => button('Send audio').click());
  expect(button('Sent to Telegram').disabled).toBe(true);
  expect(container.querySelector('article [role="status"]')?.textContent).toContain('Sent to your PairTalk conversation');
});

it('updates queued audio to sent after delivery completes without another user click', async () => {
  vi.useFakeTimers();
  window.history.replaceState(null, '', '/?view=history');
  const fetchMock = vi.fn().mockResolvedValueOnce(json({ sessions: [conversation], nextCursor: null }))
    .mockResolvedValueOnce(json({ status: 'QUEUED' },202)).mockResolvedValueOnce(json({ status: 'SENT' }));
  vi.stubGlobal('fetch',fetchMock); await render(); await act(async () => button('Send audio').click());
  expect(button('Queued for Telegram')).toBeTruthy();
  await act(async () => vi.advanceTimersByTimeAsync(5000));
  expect(button('Sent to Telegram')).toBeTruthy();
  expect(fetchMock).toHaveBeenCalledTimes(3);
});

it('cancels profile edits without changing the displayed or persisted scores', async () => {
  window.history.replaceState(null, '', '/?view=account');
  const fetchMock = vi.fn().mockResolvedValue(json({ user: profile }));
  vi.stubGlobal('fetch', fetchMock); await render(); await act(async () => button('Edit scores').click());
  const select = container.querySelector('select')!;
  await act(async () => { select.value = '0'; select.dispatchEvent(new Event('change', { bubbles:true })); });
  await act(async () => button('Cancel').click());
  expect(container.querySelector('[role="dialog"]')).toBeNull();
  expect(container.querySelector('.score-summary')?.textContent).not.toContain('0.0');
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('shows rating progress at the stars, rejects duplicate presses and waits for acknowledgement', async () => {
  window.history.replaceState(null, '', '/?view=history');
  let finish!: (response: Response) => void;
  const fetchMock = vi.fn().mockResolvedValueOnce(json({ sessions: [conversation], nextCursor: null }))
    .mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve; }))
    .mockResolvedValueOnce(json({ sessions: [{ ...conversation, rating: 4 }], nextCursor: null }));
  vi.stubGlobal('fetch', fetchMock); await render();
  const stars = container.querySelector<HTMLButtonElement>('[aria-label="4 stars"]')!;
  await act(async () => { stars.click(); stars.click(); });
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(container.querySelector('.dashboard-rating')?.getAttribute('aria-busy')).toBe('true');
  expect(container.querySelectorAll('.rated')).toHaveLength(0);
  await act(async () => finish(json({ success: true })));
  expect(container.querySelectorAll('.rated')).toHaveLength(4);
  expect(container.querySelector('.dashboard-rating')?.getAttribute('aria-busy')).toBe('false');
  expect(container.querySelector('article [role="status"]')?.className).toBe('sr-only');
  expect(container.querySelector('.action-feedback')).toBeNull();
});

it('keeps a failed rating unfilled and retryable, with its error beside the call', async () => {
  window.history.replaceState(null, '', '/?view=history');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json({ sessions: [conversation], nextCursor: null }))
    .mockResolvedValueOnce(json({ error: 'Rating could not be saved.' }, 503)));
  await render(); await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="5 stars"]')!.click());
  expect(container.querySelectorAll('.rated')).toHaveLength(0);
  expect(container.querySelector<HTMLButtonElement>('[aria-label="5 stars"]')!.disabled).toBe(false);
  expect(container.querySelector('article [role="alert"]')?.textContent).toContain('Rating could not be saved.');
});

it('preserves an acknowledged rating if refreshing history fails', async () => {
  window.history.replaceState(null, '', '/?view=history');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json({ sessions: [conversation], nextCursor: null }))
    .mockResolvedValueOnce(json({ success: true })).mockRejectedValueOnce(new Error('Refresh unavailable')));
  await render(); await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="3 stars"]')!.click());
  expect(container.querySelectorAll('.rated')).toHaveLength(3);
  expect(container.querySelector<HTMLButtonElement>('[aria-label="3 stars"]')!.disabled).toBe(true);
});

it('lets the user check an unconfirmed delivery again after bounded polling', async () => {
  vi.useFakeTimers(); window.history.replaceState(null, '', '/?view=history');
  const fetchMock = vi.fn().mockResolvedValue(json({ status: 'QUEUED' }, 202))
    .mockResolvedValueOnce(json({ sessions: [conversation], nextCursor: null }));
  vi.stubGlobal('fetch', fetchMock); await render(); await act(async () => button('Send audio').click());
  await act(async () => vi.advanceTimersByTimeAsync(60000));
  expect(button('Send audio').disabled).toBe(false);
  expect(container.querySelector('article [role="alert"]')?.textContent).toContain('Still awaiting Telegram confirmation');
  expect(container.textContent).not.toContain('Sent to Telegram');
  expect(fetchMock).toHaveBeenCalledTimes(14);
});
