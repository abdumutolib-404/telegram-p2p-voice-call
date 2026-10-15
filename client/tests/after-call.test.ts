import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Dashboard } from '../src/components/Dashboard';
import { HistoryMark } from '../src/components/HistoryMark';
import type { UserMatchData } from '../src/types';

let root: Root, container: HTMLDivElement;
const profile: UserMatchData = { userId:'fixture',alias:'Fixture',band:7,weakSkill:'FC',strongSkill:'LR',callsRemaining:8 };
const conversation = { id:'11111111-1111-4111-8111-111111111111',partnerAlias:'This partner',partnerBand:7,status:'COMPLETED',duration:60,createdAt:'2026-10-15',rating:null,reported:false,recordingAvailable:true,recordingExpiresAt:'2026-11-15' };
const json = (value: unknown) => new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
const button = (label: string) => Array.from(container.querySelectorAll('button')).find(item=>item.textContent?.includes(label)||item.getAttribute('aria-label')?.includes(label))!;
beforeEach(()=>{
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});vi.useFakeTimers();
  window.history.replaceState(null,'','/?view=account&call=unrelated');
  container=document.createElement('div');document.body.append(container);root=createRoot(container);
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.unstubAllGlobals();vi.restoreAllMocks();vi.useRealTimers();});
const render = ()=>act(async()=>root.render(createElement(Dashboard,{completedRoomName:'this-room',initData:'synthetic',userData:profile,onProfileUpdated:vi.fn(),onAccessLost:vi.fn(),onOpenActiveCall:vi.fn(),renderPractice:()=>null})));

it('loads the completed room and provides the same feedback and audio actions as History',async()=>{
  const fetchMock=vi.fn().mockResolvedValue(json({sessions:[conversation],nextCursor:null}));vi.stubGlobal('fetch',fetchMock);
  await render();
  expect(fetchMock.mock.calls[0][0]).toContain('/sessions?roomName=this-room');
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(container.querySelector('main')).toBeNull();
  expect(container.querySelector('h2')?.textContent).toBe('Your conversation');
  expect(button('5 stars')).toBeTruthy();expect(button('Send audio')).toBeTruthy();expect(button('Save partner')).toBeTruthy();
  await act(async()=>button('Report').click());
  expect(container.querySelector('[role="dialog"]')).toBeTruthy();
  expect(container.querySelectorAll('.report-reason')).toHaveLength(5);
  expect(button('Submit report').disabled).toBe(true);
  expect(container.querySelector('#report-details-help')?.textContent).toContain('kept private');
});
it('refreshes a closing call without pulling in a different conversation',async()=>{
  const fetchMock=vi.fn().mockResolvedValueOnce(json({sessions:[],nextCursor:null})).mockResolvedValue(json({sessions:[conversation],nextCursor:null}));vi.stubGlobal('fetch',fetchMock);
  await render();expect(container.textContent).toContain('Finishing your conversation');
  await act(async()=>vi.advanceTimersByTimeAsync(2000));
  expect(container.textContent).toContain('This partner');
  expect(fetchMock.mock.calls.every(([url])=>String(url).includes('roomName=this-room'))).toBe(true);
});
it.each(['saved','reported'] as const)('closes the %s notice after three seconds and allows reopening',async kind=>{
  await act(async()=>root.render(createElement(HistoryMark,{kind,acknowledged:false})));
  const details=container.querySelector('details')!;
  await act(async()=>{details.querySelector('summary')!.click();});
  await act(async()=>vi.advanceTimersByTimeAsync(2999));expect(details.open).toBe(true);
  await act(async()=>vi.advanceTimersByTimeAsync(1));expect(details.open).toBe(false);
  await act(async()=>{details.querySelector('summary')!.click();});
  await act(async()=>vi.advanceTimersByTimeAsync(3000));expect(details.open).toBe(false);
});
