import { afterEach, beforeEach, expect, it, vi } from 'vitest';
beforeEach(()=>vi.resetModules());
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});

it('coalesces concurrent refreshes of a cold feed and accepts a valid vendor response',async()=>{
 const {CRAWLER_FEEDS,fetchFeedPrefixes}=await import('../services/crawler/verifyCrawler');
 let release!:(response:Response)=>void;
 const fetch=vi.fn(()=>new Promise<Response>(resolve=>{release=resolve;}));vi.stubGlobal('fetch',fetch);
 const requests=Array.from({length:80},()=>fetchFeedPrefixes(CRAWLER_FEEDS[0],true));
 expect(fetch).toHaveBeenCalledOnce();
 release(new Response(JSON.stringify({prefixes:[{ipv4Prefix:'192.0.2.0/24'}]})));
 expect((await Promise.all(requests)).every(prefixes=>prefixes[0]==='192.0.2.0/24')).toBe(true);
});

it('backs off after failure even when incoming callers request a forced refresh',async()=>{
 const {CRAWLER_FEEDS,fetchFeedPrefixes}=await import('../services/crawler/verifyCrawler');
 const fetch=vi.fn().mockRejectedValue(new Error('Synthetic vendor outage'));vi.stubGlobal('fetch',fetch);
 expect(await fetchFeedPrefixes(CRAWLER_FEEDS[0],true)).toEqual([]);
 await Promise.all(Array.from({length:80},()=>fetchFeedPrefixes(CRAWLER_FEEDS[0],true)));
 expect(fetch).toHaveBeenCalledOnce();
});

it('rejects an oversized streamed vendor body and arbitrary feed URLs',async()=>{
 const {CRAWLER_FEEDS,fetchFeedPrefixes}=await import('../services/crawler/verifyCrawler');
 const cancel=vi.fn();
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(new ReadableStream({start(controller){controller.enqueue(new Uint8Array(1024*1024+1));},cancel}))));
 expect(await fetchFeedPrefixes(CRAWLER_FEEDS[0],true)).toEqual([]);expect(cancel).toHaveBeenCalled();
 await expect(fetchFeedPrefixes({...CRAWLER_FEEDS[0],url:'http://127.0.0.1/private'},true)).rejects.toThrow('Unknown crawler feed');
});

it('cancels a stalled body at the deadline without calling a vendor outage spoofing',async()=>{
 vi.useFakeTimers();const {CRAWLER_FEEDS,fetchFeedPrefixes,verifyCrawler}=await import('../services/crawler/verifyCrawler');
 const cancel=vi.fn();vi.stubGlobal('fetch',vi.fn(async()=>new Response(new ReadableStream({cancel}))));
 const result=fetchFeedPrefixes(CRAWLER_FEEDS[0],true);
 await vi.advanceTimersByTimeAsync(8000);expect(await result).toEqual([]);expect(cancel).toHaveBeenCalledOnce();
 expect((await verifyCrawler('192.0.2.1','GPTBot')).isSpoofed).toBe(false);
});
