import { act,createElement } from 'react';
import { createRoot,type Root } from 'react-dom/client';
import { beforeEach,afterEach,it,expect,vi } from 'vitest';
import { DiscountOffers } from '../src/components/DiscountOffers';

let root:Root,container:HTMLDivElement;
const lost=vi.fn(),json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
const clock='2026-10-14T16:00:00Z';
const offer={id:'11111111-1111-4111-8111-111111111111',planName:'Plus',validityDays:30,percent:20,originalStars:100,originalUzs:10000,starsPrice:80,uzsPrice:8000,expiresAt:'2026-10-14T16:01:00Z'};
const render=()=>act(async()=>root.render(createElement(DiscountOffers,{initData:'synthetic',onAccessLost:lost})));
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date(clock));vi.clearAllMocks();Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});container=document.createElement('div');document.body.append(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.useRealTimers();vi.unstubAllGlobals();});
it('shows both reduced prices and a recipient offer link with its countdown',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(json({offers:[offer],serverNow:clock})));await render();
  expect(container.textContent).toContain('Exclusive 20% offer for Plus');expect(container.textContent).toContain('80 Stars');expect(container.textContent).toContain('8,000 UZS');expect(container.querySelector('[role="timer"]')?.textContent).toBe('00:01:00');
  expect(container.querySelector('a')?.href).toContain(`start=discount_${offer.id}`);
  await act(async()=>vi.advanceTimersByTimeAsync(1000));expect(container.querySelector('[role="timer"]')?.textContent).toBe('00:00:59');
});
it('uses server time despite local clock skew and removes expired offers automatically',async()=>{
  vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(json({offers:[{...offer,expiresAt:'2026-10-14T16:00:05Z'}],serverNow:clock})));await render();
  expect(container.querySelector('[role="timer"]')?.textContent).toBe('00:00:05');await act(async()=>vi.advanceTimersByTimeAsync(5000));expect(container.querySelector('a')).toBeNull();expect(container.querySelector('article')).toBeNull();
});
it('refreshes claimed offers away and does not reappear from an expired response',async()=>{
  const fetch=vi.fn().mockResolvedValueOnce(json({offers:[offer],serverNow:clock})).mockResolvedValue(json({offers:[],serverNow:'2026-10-14T16:00:30Z'}));vi.stubGlobal('fetch',fetch);await render();
  await act(async()=>vi.advanceTimersByTimeAsync(30000));expect(container.querySelector('article')).toBeNull();expect(fetch).toHaveBeenCalledTimes(2);
});
it('has no invented offers when unavailable and retries on request',async()=>{
  const fetch=vi.fn().mockRejectedValueOnce(new Error('Synthetic outage')).mockResolvedValue(json({offers:[offer],serverNow:clock}));vi.stubGlobal('fetch',fetch);await render();
  expect(container.querySelector('article')).toBeNull();expect(container.textContent).toContain('temporarily unavailable');await act(async()=>container.querySelector('button')!.click());expect(container.querySelector('article')).not.toBeNull();
});
it('returns to access recovery when signed authorization is rejected',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(json({error:'Expired',code:'auth_rejected'},403)));await render();expect(lost).toHaveBeenCalledOnce();expect(container.querySelector('a')).toBeNull();
});
