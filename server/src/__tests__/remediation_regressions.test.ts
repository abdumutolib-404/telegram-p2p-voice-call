import { describe, it, expect, vi, afterEach } from 'vitest';
import crypto from 'node:crypto';
import { prisma } from '../config/database';
import { getRedis } from '../config/redis';
import { processStarsRefund } from '../services/starsRefund';
import { getEffectiveEntitlement, getPlansConfig } from '../services/plan';
import { admitCall, activatePendingCall } from '../services/callAdmission';
import { decodePaymentProof } from '../utils/paymentProof';
import { request } from '../../../admin/src/api/request';
import { telegramTransport } from '../bot/telegramTransport';
import { DistributedLeaderLock } from '../services/leaderLock';
import { currentTerms } from '../services/terms';

async function purchase(overrides: Record<string, unknown> = {}) {
  const user = await prisma.user.create({data:{telegramId:BigInt(Math.floor(Math.random()*1e10)+1e10), alias:'synthetic-'+crypto.randomUUID(),plan:'PLUS',subscriptionStatus:'ACTIVE',dailyLimit:10,maxDuration:30,onboarded:true,termsAcceptedVersion:currentTerms.version,termsAcceptedAt:new Date(),termsDocumentSha256:currentTerms.sha256}});
  const tx = await prisma.starsTransaction.create({data:{userId:user.id,telegramPaymentId:crypto.randomUUID(),starsAmount:1,planTier:'PLUS',status:'PAID',...overrides}});
  return {user,tx};
}
afterEach(()=>vi.unstubAllGlobals());
describe('Financial transition regressions',()=>{
 it('checks refund ownership before any provider call',async()=>{
  const {tx}=await purchase(), provider={refundStarPayment:vi.fn().mockResolvedValue(true)};
  await expect(processStarsRefund({transactionId:tx.id,adminId:'synthetic',ownerTelegramId:2},provider)).rejects.toThrow('not found');
  expect(provider.refundStarPayment).not.toHaveBeenCalled();
  expect((await prisma.starsTransaction.findUnique({where:{id:tx.id}}))?.status).toBe('PAID');
 });
 it('preserves a paid subscription when the provider rejects a refund',async()=>{
  const {tx,user}=await purchase();
  await expect(processStarsRefund({transactionId:tx.id,adminId:'synthetic'},{refundStarPayment:vi.fn().mockRejectedValue({error_code:400,description:'INVALID_CHARGE'})})).rejects.toThrow('preserved');
  expect((await prisma.user.findUnique({where:{id:user.id}}))?.plan).toBe('PLUS');
  expect((await prisma.starsTransaction.findUnique({where:{id:tx.id}}))?.status).toBe('REFUND_FAILED');
 });
 it('leaves uncertain provider outcomes durably pending without a second mutation',async()=>{
  const {tx,user}=await purchase(),provider={refundStarPayment:vi.fn().mockRejectedValue(new Error('network timeout'))};
  await expect(processStarsRefund({transactionId:tx.id,adminId:'synthetic'},provider)).rejects.toThrow('pending');
  await expect(processStarsRefund({transactionId:tx.id,adminId:'synthetic'},provider)).rejects.toThrow('already processing');
  expect(provider.refundStarPayment).toHaveBeenCalledTimes(1);
  expect((await prisma.user.findUnique({where:{id:user.id}}))?.plan).toBe('PLUS');
 });
 it('allows one provider refund across concurrent administrators and completed retries',async()=>{
  const {tx}=await purchase(),provider={refundStarPayment:vi.fn().mockResolvedValue(true)};
  const results=await Promise.allSettled([1,2].map(i=>processStarsRefund({transactionId:tx.id,adminId:String(i)},provider)));
  expect(results.some(result=>result.status==='fulfilled')).toBe(true);
  expect(provider.refundStarPayment).toHaveBeenCalledTimes(1);
  const retry=await processStarsRefund({transactionId:tx.id,adminId:'3'},provider);
  expect(retry.alreadyProcessed).toBe(true);expect(provider.refundStarPayment).toHaveBeenCalledTimes(1);
 });
 it('does not revoke a newer purchase when refunding an older charge',async()=>{
  const {tx,user}=await purchase({createdAt:new Date(Date.now()-10000)});
  await prisma.starsTransaction.create({data:{userId:user.id,telegramPaymentId:crypto.randomUUID(),starsAmount:1,planTier:'PLUS',status:'PAID'}});
  await processStarsRefund({transactionId:tx.id,adminId:'synthetic'},{refundStarPayment:vi.fn().mockResolvedValue(true)});
  expect((await prisma.user.findUnique({where:{id:user.id}}))?.plan).toBe('PLUS');
 });
 it('rejects an ineligible refund before contacting Telegram',async()=>{
  const {tx,user}=await purchase({createdAt:new Date(Date.now()-72*3600000)});
  await prisma.user.update({where:{id:user.id},data:{lastCallDate:new Date().toISOString().slice(0,7),dailyCallsUsed:10}});
  const provider={refundStarPayment:vi.fn().mockResolvedValue(true)};
  await expect(processStarsRefund({transactionId:tx.id,adminId:'synthetic'},provider)).rejects.toThrow('eligibility');expect(provider.refundStarPayment).not.toHaveBeenCalled();
 });
 it('rejects mismatched, active content and oversized proof',()=>{
  for(const value of ['data:image/png;base64,'+Buffer.from('<script>x</script>').toString('base64'), 'https://example.org/proof', 'data:application/pdf;base64,'+Buffer.alloc(6*1024*1024).toString('base64')]) expect(()=>decodePaymentProof(value)).toThrow();
  expect(decodePaymentProof('data:application/pdf;base64,'+Buffer.from('%PDF-1.4\nsynthetic').toString('base64')).mime).toBe('application/pdf');
 });
});
describe('Admission and expiry regressions',()=>{
 it('expires allowances immediately even before the expiry worker runs',()=>{
  const result=getEffectiveEntitlement({plan:'BOSS',subscriptionExpiresAt:new Date(Date.now()-1000),dailyLimit:999,maxDuration:90,recordingLimitOverride:15,retentionOverride:90,customPlanName:'old award'});
  expect(result.plan).toBe('FREE');expect(result.dailyLimit).toBe(getPlansConfig().FREE.dailyLimit);expect(result.recordingLimit).toBe(getPlansConfig().FREE.recordingLimit);expect(result.source).toBe('PLAN_DEFAULT');
 });
 it('preserves a legitimate zero recording override',()=>expect(getEffectiveEntitlement({plan:'PLUS',recordingLimitOverride:0}).recordingLimit).toBe(0));
 it('admits only one call when direct invitations race with matchmaking',async()=>{
  const users=await Promise.all([1,2,3].map(()=>purchase()));
  const results=await Promise.allSettled([admitCall(users[0].user.id,users[1].user.id,crypto.randomUUID(),'PENDING'),admitCall(users[2].user.id,users[0].user.id,crypto.randomUUID(),'ACTIVE')]);
  expect(results.filter(result=>result.status==='fulfilled')).toHaveLength(1);
 });
 it('rejects a zero call allowance',async()=>{
  const [a,b]=await Promise.all([purchase(),purchase()]);await prisma.user.update({where:{id:a.user.id},data:{dailyLimit:0}});
  await expect(admitCall(a.user.id,b.user.id,crypto.randomUUID(),'ACTIVE')).rejects.toThrow('allowance');
 });
 it('rechecks a changed allowance when accepting a pending invitation',async()=>{
  const [a,b]=await Promise.all([purchase(),purchase()]);const call=await admitCall(a.user.id,b.user.id,crypto.randomUUID(),'PENDING');
  await prisma.user.update({where:{id:a.user.id},data:{dailyLimit:0}});
  await expect(activatePendingCall(call.id)).rejects.toThrow('allowance');
  expect((await prisma.callSession.findUnique({where:{id:call.id}}))?.status).toBe('PENDING');
 });
});
describe('Admin request regressions',()=>{
 it('preserves caller headers and cancellation and does not log out on 403',async()=>{
  const logout=vi.fn(),controller=new AbortController();
  const fetcher=vi.fn(async (_url:any,options:any)=>{expect(options.headers.get('X-Custom')).toBe('kept');expect(options.headers.get('Authorization')).toBe('Bearer explicit');expect(options.signal.aborted).toBe(true);return new Response(JSON.stringify({error:'Forbidden'}),{status:403});});vi.stubGlobal('fetch',fetcher);controller.abort();
  await expect(request('/api/admin/users',{headers:[['X-Custom','kept'],['Authorization','Bearer explicit']],signal:controller.signal},{baseUrl:'http://synthetic',token:'other',unauthorized:logout})).rejects.toThrow('Forbidden');expect(logout).not.toHaveBeenCalled();expect(fetcher).toHaveBeenCalledTimes(1);
 });
 it('logs out on protected 401 but preserves both login contracts',async()=>{
  const logout=vi.fn();vi.stubGlobal('fetch',vi.fn(async()=>new Response('{}',{status:401})));
  for(const endpoint of ['/api/admin/login','/api/admin/auth/password','/api/admin/users']) await request(endpoint,{},{baseUrl:'http://synthetic',token:null,unauthorized:logout}).catch(()=>{});
  expect(logout).toHaveBeenCalledTimes(1);
 });
 it('bounds waiting requests without retrying a mutation',async()=>{
  const fetcher=vi.fn((_url:any,options:any)=>new Promise((_resolve,reject)=>options.signal.addEventListener('abort',()=>reject(options.signal.reason))));vi.stubGlobal('fetch',fetcher);
  await expect(request('/api/admin/action',{method:'POST',body:'{}'},{baseUrl:'http://synthetic',token:null,unauthorized:vi.fn(),timeoutMs:10})).rejects.toThrow('timed out');expect(fetcher).toHaveBeenCalledTimes(1);
 });
});
describe('Bot limits and election regressions',()=>{
 it('atomically grants only one NX claimant',async()=>{const key=crypto.randomUUID();const results=await Promise.all([1,2,3].map(()=>getRedis().set(key,'owner','PX',1000,'NX')));expect(results.filter(x=>x==='OK')).toHaveLength(1);});
 it('does not retry an ambiguous network mutation',async()=>{
  const previous=vi.fn().mockRejectedValue(new Error('network')),transport=telegramTransport(crypto.randomUUID());
  await expect((transport as any)(previous,'refundStarPayment',{user_id:1,telegram_payment_charge_id:'synthetic'})).rejects.toThrow('network');expect(previous).toHaveBeenCalledTimes(1);
 });
 it('reacquires leadership and ignores failure of an obsolete polling tenure',async()=>{
  const key=crypto.randomUUID(),lock=new DistributedLeaderLock({lockKey:key,ttlMs:1000,heartbeatIntervalMs:10,standbyCheckIntervalMs:10});
  let rejectOld:(e:Error)=>void=()=>{};const elected=vi.fn(()=>elected.mock.calls.length===1?new Promise<void>((_,reject)=>{rejectOld=reject;}):Promise.resolve());const lost=vi.fn();
  try {lock.startElection({onElected:elected,onLost:lost});await vi.waitFor(()=>expect(elected).toHaveBeenCalledTimes(1));await getRedis().del(key);await vi.waitFor(()=>expect(elected).toHaveBeenCalledTimes(2));rejectOld(new Error('old task failed'));await new Promise(r=>setTimeout(r,30));expect(lock.isCurrentLeader()).toBe(true);expect(lost).toHaveBeenCalledTimes(1);}finally{lock.stopTimers();await lock.release();}
 });
});
