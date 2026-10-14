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
const render = async () => act(async () => root.render(createElement(Dashboard, { initData: 'synthetic-signed-data', userData: profile, onProfileUpdated, onAccessLost, onOpenActiveCall, renderPractice: (navigation, shortcuts) => createElement('div', null, navigation, shortcuts, 'Practice fixture') })));
const button = (text: string) => Array.from(document.querySelectorAll('button')).find(item => item.textContent?.includes(text) || item.getAttribute('aria-label')?.includes(text))!;

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

it.each([['History & audio', 'history', 'Call history'], ['Account & limits', 'account', 'Account']])('opens %s from the practice shortcut and returns to practice', async (label, view, heading) => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => json(url.includes('/sessions') ? { sessions: [], nextCursor: null } : { user: profile })));
  await render();
  await act(async () => button(label).click());
  expect(new URLSearchParams(window.location.search).get('view')).toBe(view);
  expect(container.querySelector('h1')?.textContent).toBe(heading);
  await act(async () => button('Back to practice').click());
  expect(container.textContent).toContain('Practice fixture');
  expect(new URLSearchParams(window.location.search).get('view')).toBe('practice');
});

it('waits for deletion acknowledgement, closes its sheet and then collapses the partner row', async () => {
  vi.useFakeTimers();
  window.history.replaceState(null, '', '/?view=partners');
  let resolveDelete!: (response: Response) => void;
  let deleted = false;
  vi.stubGlobal('fetch', vi.fn((url: string, options?: RequestInit) => {
    if (options?.method === 'DELETE') return new Promise<Response>(resolve => { resolveDelete = response => { deleted = true; resolve(response); }; });
    return Promise.resolve(json(url.endsWith('/favorites') ? { favorites: deleted ? [] : [{ id: 'partner-one', alias: 'P2P-ONE12', band: 7, available: true }] } : { invitations: [] }));
  }));
  await render();
  await act(async () => button('Remove').click());
  await act(async () => button('Yes, delete').click());
  expect(container.querySelector('.partner-row.is-removing')).toBeNull();
  expect(container.querySelector('[role="dialog"]')?.getAttribute('aria-busy')).toBe('true');
  await act(async () => resolveDelete(json({ success: true })));
  expect(container.querySelector('[data-motion-state="closing"]')?.getAttribute('aria-hidden')).toBe('true');
  await act(async () => vi.advanceTimersByTimeAsync(259));
  expect(container.querySelector('.partner-row.is-removing')).toBeNull();
  await act(async () => vi.advanceTimersByTimeAsync(1));
  expect(container.querySelector('.partner-row.is-removing')).toBeTruthy();
  await act(async () => vi.advanceTimersByTimeAsync(320));
  expect(container.querySelector('.partner-row')).toBeNull();
  expect(container.textContent).toContain('No saved partners yet');
});

it('retains the partner and confirmation when deletion fails', async () => {
  window.history.replaceState(null, '', '/?view=partners');
  vi.stubGlobal('fetch', vi.fn((url: string, options?: RequestInit) => Promise.resolve(
    options?.method === 'DELETE' ? json({ error: 'Deletion failed. Please retry.' }, 503) :
      json(url.endsWith('/favorites') ? { favorites: [{ id: 'partner-one', alias: 'P2P-ONE12', band: 7, available: true }] } : { invitations: [] }),
  )));
  await render(); await act(async () => button('Remove').click());
  await act(async () => button('Yes, delete').click());
  expect(container.querySelector('.partner-row.is-removing')).toBeNull();
  expect(container.querySelector('.partner-row')?.textContent).toContain('P2P-ONE12');
  expect(container.querySelector('[role="dialog"] [role="alert"]')?.textContent).toContain('Deletion failed. Please retry.');
});

it('submits one signed rating and refreshes the persisted result', async () => {
  vi.useFakeTimers();
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
  await act(async () => vi.advanceTimersByTimeAsync(900));
  expect(container.querySelector('[aria-label="5 stars"]')).toBeNull();
  expect(container.querySelector('[aria-label="Rated 5 out of 5"]')).toBeTruthy();
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
  vi.useFakeTimers();
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
  expect(container.querySelector('[data-motion-state="closing"]')?.getAttribute('aria-hidden')).toBe('true');
  await act(async () => vi.advanceTimersByTimeAsync(500));
  expect(container.querySelector('[role="dialog"]')).toBeNull();
  expect(container.querySelector('summary[aria-label="Saved partner"]')).toBeTruthy();
  expect(container.querySelector('button[aria-label="Save partner"]')).toBeNull();
  expect(container.querySelector('article .sr-only[role="status"]')?.textContent).toContain('Partner saved.');
  await act(async () => button('Report').click());
  expect(button('Submit report').disabled).toBe(true);
  await act(async () => container.querySelector<HTMLInputElement>('input[value="Harassment"]')!.click());
  await act(async () => button('Submit report').click());
  expect(container.querySelector('[role="dialog"] [role="alert"]')?.textContent).toContain('Please retry this report.');
});

it('only shows a sent confirmation after Telegram delivery has succeeded', async () => {
  window.history.replaceState(null, '', '/?view=history');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json({ sessions: [conversation], nextCursor: null })).mockResolvedValueOnce(json({ status: 'SENT' })));
  await render(); await act(async () => button('Send audio').click());
  expect(button('Sent to Telegram').disabled).toBe(true);
  expect(container.querySelector('article .sr-only[role="status"]')?.textContent).toContain('Sent to your PairTalk conversation');
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
  vi.useFakeTimers();
  window.history.replaceState(null, '', '/?view=account');
  const fetchMock = vi.fn().mockResolvedValue(json({ user: profile }));
  vi.stubGlobal('fetch', fetchMock); await render(); await act(async () => button('Edit scores').click());
  await act(async () => button('Decrease fluency and coherence').click());
  expect(container.querySelector('output[aria-label="Fluency and coherence"]')?.textContent).toBe('6.5');
  await act(async () => button('Cancel').click());
  expect(container.querySelector('[data-motion-state="closing"]')?.getAttribute('aria-hidden')).toBe('true');
  await act(async () => vi.advanceTimersByTimeAsync(500));
  expect(container.querySelector('[role="dialog"]')).toBeNull();
  expect(container.querySelector('.score-summary')?.textContent).not.toContain('0.0');
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('shows rating progress at the stars, rejects duplicate presses and waits for acknowledgement', async () => {
  vi.useFakeTimers();
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
  await act(async () => vi.advanceTimersByTimeAsync(900));
  expect(container.querySelector('[aria-label="Rated 4 out of 5"]')).toBeTruthy();
  expect(container.querySelector('.dashboard-rating')).toBeNull();
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
  vi.useFakeTimers();
  window.history.replaceState(null, '', '/?view=history');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json({ sessions: [conversation], nextCursor: null }))
    .mockResolvedValueOnce(json({ success: true })).mockRejectedValueOnce(new Error('Refresh unavailable')));
  await render(); await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="3 stars"]')!.click());
  await act(async () => vi.advanceTimersByTimeAsync(900));
  expect(container.querySelector('[aria-label="Rated 3 out of 5"]')).toBeTruthy();
  expect(container.querySelector('[aria-label="3 stars"]')).toBeNull();
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

it('bounds score steppers and saves the actual values with a calculated overall', async () => {
  window.history.replaceState(null, '', '/?view=account');
  const fetchMock = vi.fn().mockResolvedValue(json({ user: { ...profile, subFC: 0, subLR: 9, subGRA: 7, subP: 6.5 } }));
  vi.stubGlobal('fetch', fetchMock); await render();
  await act(async () => button('Edit scores').click());
  // The parent fixture retains band 7; edits start from its displayed assessment.
  await act(async () => { for (let i = 0; i < 14; i++) button('Decrease fluency and coherence').click(); });
  expect(button('Decrease fluency and coherence').disabled).toBe(true);
  expect(container.querySelector('output[aria-label="Fluency and coherence"]')?.textContent).toBe('0.0');
  await act(async () => { for (let i = 0; i < 4; i++) button('Increase lexical resource').click(); });
  expect(button('Increase lexical resource').disabled).toBe(true);
  expect(container.querySelector('output[aria-label="Lexical resource"]')?.textContent).toBe('9.0');
  expect(container.querySelector('.stepper--overall output')?.textContent).toBe('6.0');
  await act(async () => button('Save speaking scores').click());
  const patch = fetchMock.mock.calls.find(([, options]) => options?.method === 'PATCH');
  expect(JSON.parse(patch![1].body)).toEqual({ subFC: 0, subLR: 9, subGRA: 7, subP: 7 });
  expect(patch![1].headers).toMatchObject({ 'x-telegram-init-data': 'synthetic-signed-data' });
});
