import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {prisma,connectDB,disconnectDB} from '../server/src/config/database';
import {connectRedis,disconnectRedis,getRedis} from '../server/src/config/redis';
import {admitCall} from '../server/src/services/callAdmission';
import {processStarsRefund} from '../server/src/services/starsRefund';
import {approveManualPaymentRequest} from '../server/src/services/plan';
import {TELEGRAM_SLOT_SCRIPT} from '../server/src/bot/telegramTransport';
import {DistributedLeaderLock} from '../server/src/services/leaderLock';
import {NotificationQueue} from '../server/src/bot/notifications';
import {createManualPaymentRequest} from '../server/src/services/plan';
let passed=0;
async function check(name:string,fn:()=>Promise<void>) {await fn();passed++;console.log('PASS '+name);}
const suffix=crypto.randomUUID();let counter=0;
async function user(data:any={}) {return prisma.user.create({data:{telegramId:BigInt(Date.now()+counter++),alias:`integration-${suffix}-${counter}`,plan:'PLUS',dailyLimit:10,maxDuration:30,...data}});}
async function purchase(owner:any) {return prisma.starsTransaction.create({data:{userId:owner.id,telegramPaymentId:crypto.randomUUID(),starsAmount:1,planTier:'PLUS',status:'PAID'}});}
async function main(){
 await connectDB();assert(await connectRedis());
 await check('PostgreSQL representative read and Redis PING',async()=>{await prisma.user.findFirst();assert.equal(await getRedis().ping(),'PONG');});
 await check('Concurrent direct and matched calls share participant locks across roles',async()=>{
  const [a,b,c]=await Promise.all([user(),user(),user()]);const results=await Promise.allSettled([admitCall(a.id,b.id,crypto.randomUUID(),'PENDING'),admitCall(c.id,a.id,crypto.randomUUID(),'ACTIVE')]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(await prisma.callSession.count({where:{OR:[{userAId:a.id},{userBId:a.id}],status:{in:['ACTIVE','PENDING']}}}),1);
 });
 await check('Zero quota is enforced inside call admission',async()=>{const[a,b]=await Promise.all([user({dailyLimit:0}),user()]);await assert.rejects(admitCall(a.id,b.id,crypto.randomUUID(),'ACTIVE'),/allowance/);});
 await check('Expired paid allowance cannot bypass admission before cleanup',async()=>{const[a,b]=await Promise.all([user({plan:'BOSS',dailyLimit:999,dailyCallsUsed:3,lastCallDate:new Date().toISOString().slice(0,7),subscriptionExpiresAt:new Date(Date.now()-1000)}),user()]);await assert.rejects(admitCall(a.id,b.id,crypto.randomUUID(),'ACTIVE'),/allowance/);});
 await check('Real PostgreSQL refund row locks allow one provider mutation',async()=>{
  const owner=await user(),tx=await purchase(owner);let calls=0;const provider={refundStarPayment:async()=>{calls++;await new Promise(r=>setTimeout(r,50));return true;}};
  const results=await Promise.allSettled([1,2].map(i=>processStarsRefund({transactionId:tx.id,adminId:'synthetic-'+i},provider)));assert(results.some(x=>x.status==='fulfilled'));assert.equal(calls,1);assert.equal((await prisma.starsTransaction.findUnique({where:{id:tx.id}}))?.status,'REFUNDED');
  await processStarsRefund({transactionId:tx.id,adminId:'synthetic'},provider);assert.equal(calls,1);
 });
 await check('Provider rejection preserves real paid subscription and audit',async()=>{
  const owner=await user(),tx=await purchase(owner);await assert.rejects(processStarsRefund({transactionId:tx.id,adminId:'synthetic'},{refundStarPayment:async()=>{throw {error_code:400,description:'INVALID_CHARGE'};}}));assert.equal((await prisma.user.findUnique({where:{id:owner.id}}))?.plan,'PLUS');assert.equal(await prisma.auditLog.count({where:{targetId:tx.id,action:'STARS_REFUND_FAILED'}}),1);
 });
 await check('Concurrent manual approval does not grant twice',async()=>{
  const owner=await user({plan:'FREE'});const payment=await prisma.manualPaymentRequest.create({data:{userId:owner.id,telegramId:owner.telegramId,alias:owner.alias,plan:'PLUS',uzsAmount:1,status:'PENDING',orderNumber:'TEST-'+crypto.randomUUID()}});
  const results=await Promise.allSettled([1,2].map(i=>approveManualPaymentRequest({requestId:payment.id,adminId:'synthetic-'+i})));assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal((await prisma.manualPaymentRequest.findUnique({where:{id:payment.id}}))?.status,'APPROVED');
 });
 await check('Redis Lua gates atomically coordinate separate clients',async()=>{
  const redis=getRedis(),second=redis.duplicate();try{await second.connect();const key='integration:{'+suffix+'}:';const args=[TELEGRAM_SLOT_SCRIPT,3,key+'global',key+'chat',key+'pause','1000'] as const;const results=await Promise.all([redis.eval(...args),second.eval(...args)]);assert.equal(results.filter(x=>Number(x)===0).length,1);assert(results.some(x=>Number(x)>0));}finally{second.disconnect();}
 });
 await check('Only one token polling leader owns real Redis lease',async()=>{const key='integration:leader:'+suffix,a=new DistributedLeaderLock({lockKey:key}),b=new DistributedLeaderLock({lockKey:key});try{const results=await Promise.all([a.acquire(),b.acquire()]);assert.equal(results.filter(Boolean).length,1);}finally{await a.release();await b.release();}});
 await check('Concurrent pending purchases preserve one request per user',async()=>{const owner=await user({plan:'FREE'});const results=await Promise.all([1,2].map(()=>createManualPaymentRequest({userId:owner.id,telegramId:owner.telegramId,alias:owner.alias,plan:'PLUS',uzsAmount:1})));assert.equal(results.filter(x=>x.success).length,1);assert.equal(await prisma.manualPaymentRequest.count({where:{userId:owner.id,status:'PENDING'}}),1);});
 const namespace=crypto.createHash('sha256').update(process.env.BOT_TOKEN!).digest('hex').slice(0,24);
 await check('Notification queued before a restart is recoverable',async()=>{const job=await prisma.notificationJob.create({data:{namespace,telegramId:'synthetic-recipient',text:'Synthetic recovery test'}});let sent=0;const queue=new NotificationQueue();await queue.recover({api:{sendMessage:async()=>{sent++;return {message_id:1};}}} as any);assert.equal(sent,1);assert.equal((await prisma.notificationJob.findUnique({where:{id:job.id}}))?.status,'SENT');});
 await check('Notification workers claim one durable job across replicas',async()=>{await prisma.notificationJob.create({data:{namespace,telegramId:'synthetic-recipient',text:'Synthetic competing workers'}});let sent=0;const provider={api:{sendMessage:async()=>{sent++;await new Promise(r=>setTimeout(r,30));return {message_id:1};}}} as any;await Promise.all([new NotificationQueue().recover(provider),new NotificationQueue().recover(provider)]);assert.equal(sent,1);});
 await check('An interrupted ambiguous send is not automatically repeated',async()=>{const job=await prisma.notificationJob.create({data:{namespace,telegramId:'synthetic-recipient',text:'Synthetic uncertain outcome',status:'SENDING',leasedAt:new Date(Date.now()-130000)}});let sent=0;await new NotificationQueue().recover({api:{sendMessage:async()=>{sent++;return {message_id:1};}}} as any);assert.equal(sent,0);assert.equal((await prisma.notificationJob.findUnique({where:{id:job.id}}))?.status,'UNCONFIRMED');});
 console.log(`Integration result: ${passed} passed, 0 failed.`);
}
main().catch(error=>{console.error('Integration failed:',error instanceof Error?error.message:'Unknown failure');process.exitCode=1;}).finally(async()=>{await disconnectDB();await disconnectRedis();});
