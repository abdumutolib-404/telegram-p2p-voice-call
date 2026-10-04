import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {prisma,connectDB,disconnectDB} from '../server/src/config/database';
import {connectRedis,disconnectRedis,getRedis} from '../server/src/config/redis';
import {admitCall,activatePendingCall} from '../server/src/services/callAdmission';
import {completeCallSession} from '../server/src/services/callCompletion';
import {processStarsRefund} from '../server/src/services/starsRefund';
import {approveManualPaymentRequest} from '../server/src/services/plan';
import {getUserRecordingsUsedThisPeriod} from '../server/src/services/plan';
import {onCallFinishedCheckReferralReward} from '../server/src/services/referralService';
import {TELEGRAM_SLOT_SCRIPT} from '../server/src/bot/telegramTransport';
import {DistributedLeaderLock} from '../server/src/services/leaderLock';
import {CrawlerLease} from '../server/src/services/crawler/lease';
import {purgeEmptyNonCanonicalTopic} from '../server/src/services/crawler/orphanPurge';
import {WebCrawlerService} from '../server/src/services/crawler/webCrawlerService';
import {NotificationQueue,notificationQueue} from '../server/src/bot/notifications';
import {recoverPostCallJobs} from '../server/src/services/postCallOutbox';
import {moderationService} from '../server/src/services/moderation';
import {setupPostCallCallbackHandlers} from '../server/src/bot/handlers/postCall';
import {createManualPaymentRequest} from '../server/src/services/plan';
import {checkAndProcessSubscriptionExpirations} from '../server/src/services/subscriptionExpiry';
let passed=0;
async function check(name:string,fn:()=>Promise<void>) {await fn();passed++;console.log('PASS '+name);}
const suffix=crypto.randomUUID();let counter=0;
const fixtureUserIds:string[]=[];
async function user(data:any={}) {
 const created=await prisma.user.create({data:{telegramId:BigInt(Date.now()+counter++),alias:`integration-${suffix}-${counter}`,plan:'PLUS',dailyLimit:10,maxDuration:30,...data}});
 fixtureUserIds.push(created.id);
 return created;
}
async function purchase(owner:any) {return prisma.starsTransaction.create({data:{userId:owner.id,telegramPaymentId:crypto.randomUUID(),starsAmount:1,planTier:'PLUS',status:'PAID'}});}
async function main(){
 const database=new URL(process.env.DATABASE_URL||'');
 const poolOptions:Record<string,string>={connection_limit:'20',pool_timeout:'10'};
 if(database.protocol!=='postgresql:'||database.hostname!=='127.0.0.1'||database.port!=='55432'||database.pathname!=='/pairtalk_check'||Array.from(database.searchParams).some(([key,value])=>poolOptions[key]!==value)||process.env.REDIS_URL!=='redis://127.0.0.1:56379'||process.env.NODE_ENV==='test')throw new Error('Integration checks require the dedicated loopback verification services and actual database mode.');
 await connectDB();assert(await connectRedis());
 await check('PostgreSQL representative read and Redis PING',async()=>{await prisma.user.findFirst();assert.equal(await getRedis().ping(),'PONG');});
 await check('Concurrent direct and matched calls share participant locks across roles',async()=>{
  const [a,b,c]=await Promise.all([user(),user(),user()]);const results=await Promise.allSettled([admitCall(a.id,b.id,crypto.randomUUID(),'PENDING'),admitCall(c.id,a.id,crypto.randomUUID(),'ACTIVE')]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(await prisma.callSession.count({where:{OR:[{userAId:a.id},{userBId:a.id}],status:{in:['ACTIVE','PENDING']}}}),1);
 });
 await check('Zero quota is enforced inside call admission',async()=>{const[a,b]=await Promise.all([user({dailyLimit:0}),user()]);await assert.rejects(admitCall(a.id,b.id,crypto.randomUUID(),'ACTIVE'),/allowance/);});
 await check('An indefinite suspension blocks admission and activation of an older invitation',async()=>{
  const[a,b]=await Promise.all([user(),user()]);const invitation=await admitCall(a.id,b.id,crypto.randomUUID(),'PENDING');
  await prisma.user.update({where:{id:a.id},data:{isBanned:true,bannedUntil:null}});
  await assert.rejects(activatePendingCall(invitation.id),/unavailable/);
  assert.equal((await prisma.callSession.findUniqueOrThrow({where:{id:invitation.id}})).status,'PENDING');
  await prisma.callSession.update({where:{id:invitation.id},data:{status:'CANCELLED'}});
  await assert.rejects(admitCall(a.id,b.id,crypto.randomUUID(),'ACTIVE'),/unavailable/);
 });
 await check('Expired paid allowance cannot bypass admission before cleanup',async()=>{const[a,b]=await Promise.all([user({plan:'BOSS',dailyLimit:999,dailyCallsUsed:3,lastCallDate:new Date().toISOString().slice(0,7),subscriptionExpiresAt:new Date(Date.now()-1000)}),user()]);await assert.rejects(admitCall(a.id,b.id,crypto.randomUUID(),'ACTIVE'),/allowance/);});
 await check('Concurrent terminal claims charge both participants exactly once',async()=>{
  const[a,b]=await Promise.all([user(),user()]);const call=await admitCall(a.id,b.id,crypto.randomUUID(),'ACTIVE');
  const results=await Promise.all(Array.from({length:12},()=>completeCallSession(call.id,{endedAt:new Date(),duration:10})));
  assert.equal(results.filter(result=>result.count===1).length,1);
  assert.equal(await prisma.postCallJob.count({where:{callId:call.id}}),1);
  for(const participant of [a,b])assert.equal((await prisma.user.findUniqueOrThrow({where:{id:participant.id}})).dailyCallsUsed,1);
 });
 await check('The last included call preserves a bonus; the next call consumes it',async()=>{
  const[a,b]=await Promise.all([user({plan:'FREE',dailyLimit:3,dailyCallsUsed:2,lastCallDate:new Date().toISOString().slice(0,7)}),user()]);
  const reward=await prisma.referralReward.create({data:{userId:a.id,referredUserId:b.id,status:'AVAILABLE'}});
  const third=await admitCall(a.id,b.id,crypto.randomUUID(),'ACTIVE');await completeCallSession(third.id,{endedAt:new Date(),duration:10});
  assert.equal((await prisma.referralReward.findUniqueOrThrow({where:{id:reward.id}})).status,'AVAILABLE');
  assert.equal((await prisma.user.findUniqueOrThrow({where:{id:a.id}})).dailyCallsUsed,3);
  const fourth=await admitCall(a.id,b.id,crypto.randomUUID(),'ACTIVE');await completeCallSession(fourth.id,{endedAt:new Date(),duration:10});
  assert.equal((await prisma.referralReward.findUniqueOrThrow({where:{id:reward.id}})).status,'USED');
  assert.equal((await prisma.user.findUniqueOrThrow({where:{id:a.id}})).dailyCallsUsed,3);
 });
 await check('A failed allowance write rolls back completion and the other participant charge',async()=>{
  const[a,b]=await Promise.all([user({dailyLimit:999,dailyCallsUsed:2147483647,lastCallDate:new Date().toISOString().slice(0,7)}),user()]);
  const call=await admitCall(a.id,b.id,crypto.randomUUID(),'ACTIVE');await assert.rejects(completeCallSession(call.id,{endedAt:new Date(),duration:10}));
  assert.equal((await prisma.callSession.findUniqueOrThrow({where:{id:call.id}})).status,'ACTIVE');
  assert.equal(await prisma.postCallJob.count({where:{callId:call.id}}),0);
  assert.equal((await prisma.user.findUniqueOrThrow({where:{id:b.id}})).dailyCallsUsed,0);
 });
 await check('Short, cancelled, and permission-denied calls preserve allowance',async()=>{
  const[a,b]=await Promise.all([user(),user()]);
  for(const completion of [{duration:4},{duration:10,status:'CANCELLED' as const},{duration:10,charge:false}]){
   const call=await admitCall(a.id,b.id,crypto.randomUUID(),'ACTIVE');assert.equal((await completeCallSession(call.id,{endedAt:new Date(),...completion})).count,1);
  }
  for(const participant of [a,b])assert.equal((await prisma.user.findUniqueOrThrow({where:{id:participant.id}})).dailyCallsUsed,0);
 });
 await check('Recording usage requires participation and exact recorder ownership',async()=>{
  const[a,b,c]=await Promise.all([user(),user(),user()]);
  for(const recordedByUserId of ['BOTH','ALL',`${b.id},${c.id}`])await prisma.callSession.create({data:{roomName:crypto.randomUUID(),userAId:b.id,userBId:c.id,status:'COMPLETED',recordingUrl:'recordings/synthetic.mp3',recordedByUserId}});
  // A participated, but neither entry in the recorder list is A's complete identity.
  await prisma.callSession.create({data:{roomName:crypto.randomUUID(),userAId:a.id,userBId:b.id,status:'COMPLETED',recordingUrl:'recordings/synthetic.mp3',recordedByUserId:`${b.id},prefix-${a.id}`}});
  assert.equal(await getUserRecordingsUsedThisPeriod(a.id,a),0);
  for(const recordedByUserId of ['BOTH','ALL',a.id,`${b.id},${a.id}`,`${a.id},${b.id}`,`${b.id},${a.id},${c.id}`,null])await prisma.callSession.create({data:{roomName:crypto.randomUUID(),userAId:a.id,userBId:b.id,status:'COMPLETED',recordingUrl:'recordings/synthetic.mp3',recordedByUserId}});
  assert.equal(await getUserRecordingsUsedThisPeriod(a.id,a),7);
 });
 await check('Concurrent completion events award one referral bonus and one notice',async()=>{
  const inviter=await user(),friend=await user({referredByUserId:inviter.id}),partner=await user();
  const call=await prisma.callSession.create({data:{roomName:crypto.randomUUID(),userAId:friend.id,userBId:partner.id,status:'COMPLETED',duration:35,endedAt:new Date()}});
  let notices=0;const bot={api:{sendMessage:async()=>{notices++;return {message_id:1};}}} as any;
  const event={id:call.id,userAId:friend.id,userBId:partner.id,duration:35};
  await Promise.all(Array.from({length:12},()=>onCallFinishedCheckReferralReward(event,bot)));
  assert.equal(await prisma.referralReward.count({where:{referredUserId:friend.id}}),1);
  assert.equal(await prisma.notificationJob.count({where:{dedupeKey:'referral:'+friend.id}}),1);
  await notificationQueue.recover(bot);
  assert.equal(notices,1);
  await onCallFinishedCheckReferralReward(event,bot);
  assert.equal(notices,1);
 });
 const outboxNamespace=crypto.createHash('sha256').update(process.env.BOT_TOKEN!).digest('hex').slice(0,24);
 await check('Post-call work survives a missed Pub/Sub event and competing recovery workers',async()=>{
  const inviter=await user(),friend=await user({referredByUserId:inviter.id}),partner=await user();
  const call=await admitCall(friend.id,partner.id,crypto.randomUUID(),'ACTIVE');
  await completeCallSession(call.id,{endedAt:new Date(),duration:35});
  await prisma.postCallJob.update({where:{callId:call.id},data:{nextAttemptAt:new Date(0)}});
  const provider={api:{sendMessage:async()=>({message_id:1}),deleteMessage:async()=>true}} as any;
  await Promise.all(Array.from({length:12},()=>recoverPostCallJobs(provider,call.id)));
  assert.equal((await prisma.postCallJob.findUniqueOrThrow({where:{callId:call.id}})).status,'DONE');
  assert.equal(await prisma.referralReward.count({where:{referredUserId:friend.id}}),1);
  const keys=['referral:'+friend.id,'postcall:'+call.id+':'+friend.telegramId,'postcall:'+call.id+':'+partner.telegramId];
  assert.equal(await prisma.notificationJob.count({where:{namespace:outboxNamespace,dedupeKey:{in:keys}}}),3);
  // Simulate a worker crashing after persisting messages but before acknowledging the job.
  await prisma.postCallJob.update({where:{callId:call.id},data:{status:'PROCESSING',owner:'interrupted',leaseUntil:new Date(0)}});
  assert.equal(await recoverPostCallJobs(provider,call.id),1);
  assert.equal(await prisma.notificationJob.count({where:{namespace:outboxNamespace,dedupeKey:{in:keys}}}),3);
  await notificationQueue.recover(provider);
 });
 await check('Queue failure rolls back referral award and retries the durable completion',async()=>{
  const inviter=await user(),friend=await user({referredByUserId:inviter.id}),partner=await user();
  const call=await admitCall(friend.id,partner.id,crypto.randomUUID(),'ACTIVE');await completeCallSession(call.id,{endedAt:new Date(),duration:35});
  await prisma.postCallJob.update({where:{callId:call.id},data:{nextAttemptAt:new Date(0)}});
  const text='Synthetic capacity '+suffix;
  await prisma.notificationJob.createMany({data:Array.from({length:1000},()=>({namespace:outboxNamespace,telegramId:'synthetic',text}))});
  const provider={api:{sendMessage:async()=>({message_id:1}),deleteMessage:async()=>true}} as any;
  try {
   assert.equal(await recoverPostCallJobs(provider,call.id),0);
   assert.equal(await prisma.referralReward.count({where:{referredUserId:friend.id}}),0);
   const pending=await prisma.postCallJob.findUniqueOrThrow({where:{callId:call.id}});
   assert.equal(pending.status,'QUEUED');assert(pending.failure);assert(pending.nextAttemptAt>new Date());
  } finally {await prisma.notificationJob.deleteMany({where:{namespace:outboxNamespace,text}});}
  await prisma.postCallJob.update({where:{callId:call.id},data:{nextAttemptAt:new Date(0)}});
  assert.equal(await recoverPostCallJobs(provider,call.id),1);
  assert.equal(await prisma.referralReward.count({where:{referredUserId:friend.id}}),1);
  assert.equal(await prisma.notificationJob.count({where:{namespace:outboxNamespace,dedupeKey:'referral:'+friend.id}}),1);
  await notificationQueue.recover(provider);
 });
 await check('Subscription expiry and advance notices survive bot absence and competing schedulers',async()=>{
  const expired=await user({subscriptionExpiresAt:new Date(Date.now()-1000)}),soon=await user({subscriptionExpiresAt:new Date(Date.now()+3600000)});
  await Promise.all(Array.from({length:12},()=>checkAndProcessSubscriptionExpirations(null)));
  assert.equal((await prisma.user.findUniqueOrThrow({where:{id:expired.id}})).plan,'FREE');
  assert.equal(await prisma.auditLog.count({where:{targetId:expired.id,action:'SUBSCRIPTION_EXPIRED'}}),1);
  for(const target of [expired,soon]) assert.equal(await prisma.notificationJob.count({where:{namespace:outboxNamespace,telegramId:target.telegramId.toString(),status:'QUEUED'}}),1);
  let delivered=0;
  await notificationQueue.recover({api:{sendMessage:async(id:string)=>{if([expired.telegramId.toString(),soon.telegramId.toString()].includes(id))delivered++;return {message_id:1};}}} as any);
  assert.equal(delivered,2);
 });
 await check('Full notification queue rolls back subscription expiry until a durable notice can be saved',async()=>{
  const expired=await user({subscriptionExpiresAt:new Date(Date.now()-1000)}),text='Synthetic expiry capacity '+suffix;
  await prisma.notificationJob.createMany({data:Array.from({length:1000},()=>({namespace:outboxNamespace,telegramId:'synthetic',text}))});
  try {
   await checkAndProcessSubscriptionExpirations(null);
   assert.equal((await prisma.user.findUniqueOrThrow({where:{id:expired.id}})).plan,'PLUS');
   assert.equal(await prisma.auditLog.count({where:{targetId:expired.id,action:'SUBSCRIPTION_EXPIRED'}}),0);
  } finally {await prisma.notificationJob.deleteMany({where:{namespace:outboxNamespace,text}});}
  await checkAndProcessSubscriptionExpirations(null);
  assert.equal((await prisma.user.findUniqueOrThrow({where:{id:expired.id}})).plan,'FREE');
  assert.equal(await prisma.notificationJob.count({where:{namespace:outboxNamespace,telegramId:expired.telegramId.toString()}}),1);
  await notificationQueue.recover({api:{sendMessage:async()=>({message_id:1})}} as any);
 });
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
 await check('Crawler leases share ownership and preserve a replacement in real Redis',async()=>{
  const key='pairtalk:crawler:lock',redis=getRedis(),a=new CrawlerLease(),b=new CrawlerLease();
  assert.equal(await redis.get(key),null,'Dedicated fixture must have no active crawler');
  const replacement='integration-replacement-'+suffix;
  try {
   assert.equal(await a.acquire(),true);await a.assertOwned();assert.equal(await b.acquire(),false);
   await redis.set(key,replacement,'PX',60000);
   await assert.rejects(a.assertOwned(),/lease lost/);await a.release();
   assert.equal(await redis.get(key),replacement);
  } finally {
   await a.release();await b.release();
   await redis.eval("if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end",1,key,replacement);
  }
 });
 await check('Successful crawl memory has a bounded real Redis lifetime and expires across workers',async()=>{
  const page='https://synthetic.example.test/speaking/'+suffix,crawler=new WebCrawlerService();
  const key='pairtalk:crawler:visited:v2:'+crypto.createHash('sha256').update(crawler.normalizeUrl(page)).digest('hex');
  try {
   await crawler.markUrlVisited(page);
   assert.equal(await new WebCrawlerService().isUrlVisited(page),true);
   const ttl=await getRedis().pttl(key);assert(ttl>86300000&&ttl<=86400000);
   await getRedis().pexpire(key,1);await new Promise(resolve=>setTimeout(resolve,25));
   assert.equal(await new WebCrawlerService().isUrlVisited(page),false);
  } finally {await getRedis().del(key);}
 });
 await check('Orphan purge waits for a question insert and preserves the populated parent',async()=>{
  const topic=await prisma.ieltsTopic.create({data:{name:'Synthetic topic '+suffix,slug:'synthetic-orphan-'+suffix}});
  let signalInserted!:()=>void,release!:()=>void;
  const inserted=new Promise<void>(resolve=>{signalInserted=resolve;});
  const barrier=new Promise<void>(resolve=>{release=resolve;});
  const insertion=prisma.$transaction(async tx=>{
   await tx.ieltsQuestion.create({data:{topicId:topic.id,part:'PART_1',questionText:'Synthetic concurrent question',sourceHash:'synthetic-orphan-question-'+suffix}});
   signalInserted();await barrier;
  },{timeout:15000});
  try {
   await inserted;
   const purge=purgeEmptyNonCanonicalTopic(topic.id,new Set());
   await new Promise(resolve=>setTimeout(resolve,100));release();await insertion;
   assert.equal(await purge,false);
   assert.equal(await prisma.ieltsQuestion.count({where:{topicId:topic.id}}),1);
   await prisma.ieltsQuestion.deleteMany({where:{topicId:topic.id}});
   assert.equal(await purgeEmptyNonCanonicalTopic(topic.id,new Set([topic.slug])),false);
   assert.equal(await purgeEmptyNonCanonicalTopic(topic.id,new Set()),true);
   assert.equal(await purgeEmptyNonCanonicalTopic(topic.id,new Set()),false);
  } finally {
   release();await insertion;
   await prisma.ieltsTopic.deleteMany({where:{id:topic.id}});
  }
 });
 await check('Concurrent pending purchases preserve one request per user',async()=>{const owner=await user({plan:'FREE'});const results=await Promise.all([1,2].map(()=>createManualPaymentRequest({userId:owner.id,telegramId:owner.telegramId,alias:owner.alias,plan:'PLUS',uzsAmount:1})));assert.equal(results.filter(x=>x.success).length,1);assert.equal(await prisma.manualPaymentRequest.count({where:{userId:owner.id,status:'PENDING'}}),1);});
 await check('Concurrent administrator warnings preserve every escalation',async()=>{
  const target=await user();
  await Promise.all(Array.from({length:12},()=>moderationService.escalateUserWarning(target.id,'Synthetic warning')));
  const updated=await prisma.user.findUniqueOrThrow({where:{id:target.id}});
  assert.equal(updated.warningCount,12);assert.equal(updated.isPermanentlyBanned,true);
 });
 await check('Concurrent rating callbacks save one feedback record',async()=>{
  const[a,b]=await Promise.all([user(),user()]);const call=await prisma.callSession.create({data:{roomName:crypto.randomUUID(),userAId:a.id,userBId:b.id,status:'COMPLETED',duration:35}});
  let callback:((context:any)=>Promise<void>)|undefined;
  setupPostCallCallbackHandlers({callbackQuery:(pattern:RegExp,handler:any)=>{if(pattern.source.startsWith('^rate_call:'))callback=handler;}} as any);
  assert(callback);
  await Promise.all(Array.from({length:12},()=>callback!({match:['rate_call:'+call.id+':5',call.id,'5'],from:{id:Number(a.telegramId)},answerCallbackQuery:async()=>{},editMessageText:async()=>{}})));
  assert.equal(await prisma.callRating.count({where:{callId:call.id,raterId:a.id}}),1);
 });
 await check('Reciprocal reports use the same participant lock order and escalate once',async()=>{
  const[a,b]=await Promise.all([user(),user()]);const call=await prisma.callSession.create({data:{roomName:crypto.randomUUID(),userAId:a.id,userBId:b.id,status:'COMPLETED',duration:35}});
  await Promise.all([moderationService.processReport(b.id,a.id,call.id,'Synthetic report'),moderationService.processReport(a.id,b.id,call.id,'Synthetic report')]);
  for(const target of [a,b]) assert.equal((await prisma.user.findUniqueOrThrow({where:{id:target.id}})).warningCount,1);
  await assert.rejects(moderationService.processReport(b.id,a.id,call.id,'Synthetic duplicate'),/already reported/);
  assert.equal((await prisma.user.findUniqueOrThrow({where:{id:b.id}})).warningCount,1);
 });
 await check('Expired-ban cleanup preserves a newer suspension committed during the check',async()=>{
  const target=await user({isBanned:true,bannedUntil:new Date(Date.now()-1000)});
  let signalLocked!:()=>void, release!:()=>void;
  const locked=new Promise<void>(resolve=>{signalLocked=resolve;});
  const barrier=new Promise<void>(resolve=>{release=resolve;});
  const until=new Date(Date.now()+3600000);
  const renewal=prisma.$transaction(async tx=>{
   await tx.$queryRawUnsafe('SELECT id FROM "User" WHERE id=$1 FOR UPDATE',target.id);
   signalLocked();await barrier;
   await tx.user.update({where:{id:target.id},data:{isBanned:true,bannedUntil:until}});
  },{timeout:15000});
  await locked;
  const checkBan=moderationService.isUserBanned(target.id);
  try {await new Promise(resolve=>setTimeout(resolve,100));} finally {release();}
  await renewal;
  assert.equal((await checkBan).banned,true);
  const updated=await prisma.user.findUniqueOrThrow({where:{id:target.id}});
  assert.equal(updated.isBanned,true);assert.equal(updated.bannedUntil?.getTime(),until.getTime());
  await prisma.user.update({where:{id:target.id},data:{bannedUntil:null,isBanned:true,isPermanentlyBanned:false}});
  assert.equal((await moderationService.isUserBanned(target.id)).banned,true);
 });
 const namespace=crypto.createHash('sha256').update(process.env.BOT_TOKEN!).digest('hex').slice(0,24);
 await check('Notification queued before a restart is recoverable',async()=>{const job=await prisma.notificationJob.create({data:{namespace,telegramId:'synthetic-recipient',text:'Synthetic recovery test'}});let sent=0;const queue=new NotificationQueue();await queue.recover({api:{sendMessage:async()=>{sent++;return {message_id:1};}}} as any);assert.equal(sent,1);assert.equal((await prisma.notificationJob.findUnique({where:{id:job.id}}))?.status,'SENT');});
 await check('Notification workers claim one durable job across replicas',async()=>{await prisma.notificationJob.create({data:{namespace,telegramId:'synthetic-recipient',text:'Synthetic competing workers'}});let sent=0;const provider={api:{sendMessage:async()=>{sent++;await new Promise(r=>setTimeout(r,30));return {message_id:1};}}} as any;await Promise.all([new NotificationQueue().recover(provider),new NotificationQueue().recover(provider)]);assert.equal(sent,1);});
 await check('An interrupted ambiguous send is not automatically repeated',async()=>{const job=await prisma.notificationJob.create({data:{namespace,telegramId:'synthetic-recipient',text:'Synthetic uncertain outcome',status:'SENDING',leasedAt:new Date(Date.now()-130000)}});let sent=0;await new NotificationQueue().recover({api:{sendMessage:async()=>{sent++;return {message_id:1};}}} as any);assert.equal(sent,0);assert.equal((await prisma.notificationJob.findUnique({where:{id:job.id}}))?.status,'UNCONFIRMED');});
 console.log(`Integration result: ${passed} passed, 0 failed.`);
}
main().catch(error=>{console.error('Integration failed:',error instanceof Error?error.message:'Unknown failure');process.exitCode=1;}).finally(async()=>{
 try {
  // Deliberately overflowing allowance fixtures must never reach preview startup recovery.
  if(fixtureUserIds.length) {
   const result=await prisma.callSession.updateMany({where:{status:{in:['ACTIVE','PENDING']},userAId:{in:fixtureUserIds},userBId:{in:fixtureUserIds}},data:{status:'CANCELLED',endedAt:new Date()}});
   console.log(`Synthetic active call cleanup: ${result.count} fixtures retired.`);
  }
 } catch(error) {console.error('Integration fixture cleanup failed:',error instanceof Error?error.message:'Unknown failure');process.exitCode=1;}
 finally {await disconnectDB();await disconnectRedis();}
});
