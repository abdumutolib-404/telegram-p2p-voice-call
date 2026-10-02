import {describe,it,expect,vi,afterEach} from 'vitest';
import dns from 'node:dns/promises';
import https from 'node:https';
import {EventEmitter} from 'node:events';
import {safeFetch,isPublicAddress} from '../utils/safeFetch';
afterEach(()=>vi.restoreAllMocks());
describe('Outbound SSRF boundaries',()=>{
 it('rejects loopback, mapped IPv4, private, link-local and reserved addresses',()=>{for(const address of ['127.0.0.1','::1','::ffff:127.0.0.1','10.0.0.1','169.254.169.254','192.168.1.1','fc00::1','fe80::1','0.0.0.0'])expect(isPublicAddress(address)).toBe(false);expect(isPublicAddress('1.1.1.1')).toBe(true);});
 it('rejects mixed public/private DNS answers before connecting',async()=>{vi.spyOn(dns,'lookup').mockResolvedValue([{address:'1.1.1.1',family:4},{address:'10.0.0.1',family:4}] as any);const network=vi.spyOn(https,'get');await expect(safeFetch('https://synthetic.example')).rejects.toThrow('private');expect(network).not.toHaveBeenCalled();});
 it('pins validated DNS and rejects a redirect whose new DNS answer is private',async()=>{
  vi.spyOn(dns,'lookup').mockResolvedValueOnce([{address:'1.1.1.1',family:4}] as any).mockResolvedValueOnce([{address:'127.0.0.1',family:4}] as any);
  const network=vi.spyOn(https,'get').mockImplementation(((url:any,options:any,callback:any)=>{options.lookup(url.hostname,{},(error:any,address:string,family:number)=>{expect(error).toBe(null);expect(address).toBe('1.1.1.1');expect(family).toBe(4);});const request=new EventEmitter();queueMicrotask(()=>{const response=Object.assign(new EventEmitter(),{statusCode:302,headers:{location:'https://redirect.synthetic.example'}});callback(response);response.emit('end');});return request;}) as any);
  await expect(safeFetch('https://synthetic.example')).rejects.toThrow('private');expect(network).toHaveBeenCalledTimes(1);
 });
 it('enforces allowlists again on redirects',async()=>{
  vi.spyOn(dns,'lookup').mockResolvedValue([{address:'1.1.1.1',family:4}] as any);vi.spyOn(https,'get').mockImplementation(((_url:any,_options:any,callback:any)=>{const request=new EventEmitter();queueMicrotask(()=>{const response=Object.assign(new EventEmitter(),{statusCode:302,headers:{location:'https://untrusted.example'}});callback(response);response.emit('end');});return request;}) as any);
  await expect(safeFetch('https://allowed.example',{allowed:url=>new URL(url).hostname==='allowed.example'})).rejects.toThrow('permitted');
 });
 it('bounds DNS resolution and accepts caller cancellation',async()=>{vi.spyOn(dns,'lookup').mockImplementation(()=>new Promise(()=>{}) as any);await expect(safeFetch('https://synthetic.example',{timeoutMs:10})).rejects.toThrow('timed out');const controller=new AbortController();controller.abort(new Error('caller cancelled'));await expect(safeFetch('https://synthetic.example',{signal:controller.signal})).rejects.toThrow('caller cancelled');});
});
