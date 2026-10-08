import { afterEach, expect, it, vi } from 'vitest';
import { dashboardRequest } from '../src/services/dashboard';

afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});

it.each(['GET','POST'])('bounds a stalled %s response body and gives safe retry guidance',async method=>{
  vi.useFakeTimers();
  let signal!:AbortSignal;
  vi.stubGlobal('fetch',vi.fn(async(_url,options)=>{
    signal=options.signal;
    return {ok:true,json:()=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}))};
  }));
  const result=dashboardRequest('synthetic','/account',{method}).catch(error=>error);
  await vi.advanceTimersByTimeAsync(15000);
  const error=await result;
  expect(signal.aborted).toBe(true);expect(error.code).toBe('request_timeout');
  expect(error.message).toContain(method==='POST' ? 'before submitting again' : 'Please retry');
});

it('preserves explicit cancellation and cleans its deadline',async()=>{
  vi.useFakeTimers();const controller=new AbortController();
  vi.stubGlobal('fetch',vi.fn((_url,options)=>new Promise((_resolve,reject)=>options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true}))));
  const result=dashboardRequest('synthetic','/sessions',{signal:controller.signal}).catch(error=>error);
  controller.abort(new DOMException('Navigated away','AbortError'));
  expect((await result).name).toBe('AbortError');expect(vi.getTimerCount()).toBe(0);
});
