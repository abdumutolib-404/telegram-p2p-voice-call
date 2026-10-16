// Owned PostgreSQL + loopback Redis-compatible Lua server. Telegram is synthetic.
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
function verify(value){const u=new URL(value);if(u.protocol!=='postgresql:'||u.hostname!=='127.0.0.1'||u.port!=='55432'||u.pathname!=='/pairtalk_check')throw new Error('Use the dedicated loopback verification database.');}
if(process.argv[2]!=='--child'){
  const bindings=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));verify(bindings.DATABASE_URL);
  const env=require('./safe-environment.cjs')({DATABASE_URL:bindings.DATABASE_URL,REDIS_URL:'redis://127.0.0.1:56379',NODE_ENV:'development'});
  const result=spawnSync(process.execPath,[__filename,'--child'],{env,encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024});
  let output=(result.stdout||'')+(result.stderr||'');for(const key of ['DATABASE_URL','BOT_TOKEN','JWT_SECRET','MASTER_PASSWORD','LIVEKIT_API_SECRET'])if(env[key])output=output.split(env[key]).join('[REDACTED]');
  process.stdout.write(output);process.exitCode=result.status??1;
}else{
  verify(process.env.DATABASE_URL);assert.equal(process.env.REDIS_URL,'redis://127.0.0.1:56379');
  const {prisma,connectDB,disconnectDB}=require('../server/dist/config/database'),{connectRedis,getRedis,isRedisReady,disconnectRedis}=require('../server/dist/config/redis');
  const {currentTerms}=require('../server/dist/services/terms'),{NotificationQueue,persistNotification}=require('../server/dist/bot/notifications');
  const optional=require('../server/dist/services/optionalNotifications'),policy=require('../server/dist/services/notificationPolicy'),configuration=require('../server/dist/services/notificationConfiguration');
  const {quietUntil}=require('../server/dist/contracts/notifications'),{readCreditConfiguration}=require('../server/dist/services/creditConfiguration');
  const {createPracticeOrder,cancelPendingPracticeCheckout,resumePracticeCheckout}=require('../server/dist/services/practiceCheckout');
  const {practiceActivity,hasCompatiblePracticeQueue}=require('../server/dist/services/practiceActivity');
  const ids=Array.from({length:16},()=>crypto.randomUUID()),admin='notification-check-'+crypto.randomUUID();
  const telegrams=ids.map((_,i)=>(BigInt(Date.now())+BigInt(i)).toString()),keys=[],broadcasts=[];
  const user=id=>prisma.user.findUniqueOrThrow({where:{id}}),job=key=>prisma.notificationJob.findFirstOrThrow({where:{dedupeKey:key}});
  const preferences={inactivity:true,checkout:true,peak:true,channel:true,quietHours:false,quietStart:22,quietEnd:8};
  const sent=[],bot={api:{sendMessage:async(id,text,options)=>{sent.push({id,text,options});return {message_id:sent.length};}}};
  const drain=()=>new NotificationQueue().recover(bot);
  const reset=async(id)=>prisma.user.update({where:{id},data:{nextReminderAt:new Date(0),lastReminderAttemptAt:null,lastReminderJobId:null,lastActiveAt:new Date(Date.now()-4*86400000)}});
  const queueInactive=async(id,suffix='')=>{
    const u=await user(id),key=`reminder:INACTIVITY:${id}:${u.lastActiveAt.getTime()}${suffix}`;
    await optional.queueOptionalNotification(id,{kind:'INACTIVITY',activityAt:u.lastActiveAt.toISOString()},'Synthetic practice reminder',key,new Date(Date.now()+86400000));return key;
  };
  (async()=>{try{
    await connectDB();assert.equal(await connectRedis(),true);
    for(const [i,id]of ids.entries())await prisma.user.create({data:{id,telegramId:BigInt(telegrams[i]),alias:'notify-check-'+id,onboarded:true,callCredits:10,band:7,termsAcceptedVersion:currentTerms.version,termsDocumentSha256:currentTerms.sha256,termsAcceptedAt:new Date(),lastActiveAt:new Date(Date.now()-4*86400000)}});
    assert.deepEqual(policy.userNotificationPreferences(await user(ids[0])),{...preferences,inactivity:false,checkout:false,peak:false,channel:false,quietHours:true});
    assert.equal(await queueInactive(ids[0]),`reminder:INACTIVITY:${ids[0]}:${(await user(ids[0])).lastActiveAt.getTime()}`);
    assert.equal(await prisma.notificationJob.count({where:{telegramId:telegrams[0]}}),0);
    for(const id of ids.slice(0,6)){await optional.saveNotificationPreferences(id,preferences);await reset(id);}
    await Promise.all([optional.scheduleOptionalNotifications(),optional.scheduleOptionalNotifications()]);
    assert.equal(await prisma.notificationJob.count({where:{telegramId:telegrams[0],category:'INACTIVITY'}}),1);
    await Promise.all([drain(),drain()]);assert.equal(sent.filter(m=>m.id===telegrams[0]).length,1);
    await prisma.user.update({where:{id:ids[0]},data:{nextReminderAt:new Date(0)}});await queueInactive(ids[0]);await drain();assert.equal(sent.filter(m=>m.id===telegrams[0]).length,1);
    console.log('PASS optional messages default off; simultaneous scheduling and workers send an inactivity episode once.');

    await reset(ids[1]);const activityKey=await queueInactive(ids[1],':activity');await prisma.user.update({where:{id:ids[1]},data:{lastActiveAt:new Date()}});await drain();assert.equal((await job(activityKey)).status,'EXPIRED');
    await reset(ids[2]);const stoppedKey=await queueInactive(ids[2],':stop');await optional.stopOptionalNotifications(BigInt(telegrams[2]));await drain();assert.equal((await job(stoppedKey)).status,'EXPIRED');
    assert.equal(quietUntil({quietHours:true,quietStart:22,quietEnd:8},new Date('2026-10-16T18:30:00Z')).toISOString(),'2026-10-17T03:00:00.000Z');
    assert.equal(quietUntil({quietHours:true,quietStart:22,quietEnd:8},new Date('2026-10-16T03:00:00Z')),null);
    assert.equal(quietUntil({quietHours:true,quietStart:9,quietEnd:17},new Date('2026-10-16T05:00:00Z')).toISOString(),'2026-10-16T12:00:00.000Z');
    console.log('PASS activity and opt-out suppress stale reminders; overnight and daytime quiet-hour boundaries use UTC+5.');

    const broadcast=await optional.createNotificationBroadcast({requestId:crypto.randomUUID(),messageId:12345},admin);broadcasts.push(broadcast.id);
    const channelContext={kind:'CHANNEL',broadcastId:broadcast.id,messageId:12345};
    await reset(ids[3]);const localHour=(new Date().getUTCHours()+5)%24;
    await optional.saveNotificationPreferences(ids[3],{...preferences,quietHours:true,quietStart:localHour,quietEnd:(localHour+1)%24});await reset(ids[3]);
    const quietKey=`reminder:CHANNEL:${broadcast.id}:${ids[3]}`;await optional.queueOptionalNotification(ids[3],channelContext,'Synthetic channel update',quietKey,new Date(Date.now()+86400000));await drain();
    assert.equal((await job(quietKey)).status,'QUEUED');assert.match((await job(quietKey)).failure,/Quiet hours/);
    await optional.saveNotificationPreferences(ids[3],preferences);await drain();assert.equal((await job(quietKey)).status,'SENT');
    await reset(ids[3]);await prisma.user.update({where:{id:ids[3]},data:{lastReminderAttemptAt:new Date(),lastReminderJobId:'different-job'}});
    const cooldownKey=`reminder:CHANNEL:cooldown:${ids[3]}`;await optional.queueOptionalNotification(ids[3],channelContext,'Synthetic cooldown',cooldownKey,new Date(Date.now()+86400000));await drain();assert.match((await job(cooldownKey)).failure,/cooldown/);
    console.log('PASS quiet reminders defer until wake time; preference changes wake jobs for recheck; cross-category daily cooldown is enforced.');

    const catalog=(await readCreditConfiguration()).packs,order=await createPracticeOrder(ids[4],crypto.randomUUID(),{calls:1,recordings:0,retention:false,minutes:15},catalog.revision,'XTR');
    const resumed=await resumePracticeCheckout(ids[4],order.id);assert.equal(resumed.requestId,order.requestId);assert.equal(resumed.currency,'XTR');await assert.rejects(resumePracticeCheckout(ids[5],order.id));
    await reset(ids[4]);const checkoutKey=`reminder:CHECKOUT:${order.id}`;await optional.queueOptionalNotification(ids[4],{kind:'CHECKOUT',orderId:order.id},'Synthetic unfinished checkout',checkoutKey,order.expiresAt);await cancelPendingPracticeCheckout(ids[4],order.id);await drain();assert.equal((await job(checkoutKey)).status,'EXPIRED');
    await assert.rejects(resumePracticeCheckout(ids[4],order.id));
    console.log('PASS checkout recovery keeps its immutable owner, request and currency; cancelled checkout reminders are discarded.');

    await reset(ids[5]);const uncertainKey=`reminder:CHANNEL:uncertain:${ids[5]}`;await optional.queueOptionalNotification(ids[5],channelContext,'Synthetic uncertain send',uncertainKey,new Date(Date.now()+86400000));
    let attempts=0;const uncertainBot={api:{sendMessage:async()=>{attempts++;throw new Error('Synthetic lost acknowledgement');}}};
    await new NotificationQueue().recover(uncertainBot);await new NotificationQueue().recover(uncertainBot);assert.equal(attempts,1);assert.equal((await job(uncertainKey)).status,'UNCONFIRMED');
    await reset(ids[5]);const retryKey=`reminder:CHANNEL:rate-limit:${ids[5]}`;await optional.queueOptionalNotification(ids[5],channelContext,'Synthetic bounded retry',retryKey,new Date(Date.now()+86400000));
    let retryAttempts=0;const limitedBot={api:{sendMessage:async()=>{retryAttempts++;if(retryAttempts===1)throw {error_code:429,parameters:{retry_after:1}};return {message_id:99};}}};
    await new NotificationQueue().recover(limitedBot);assert.equal((await job(retryKey)).status,'QUEUED');await prisma.notificationJob.update({where:{id:(await job(retryKey)).id},data:{nextAttemptAt:new Date(0)}});await new NotificationQueue().recover(limitedBot);assert.equal(retryAttempts,2);assert.equal((await job(retryKey)).status,'SENT');
    console.log('PASS uncertain provider acknowledgements are never replayed; explicit rate limits permit one bounded retry.');

    await reset(ids[5]);const interruptedKey=`reminder:CHANNEL:interrupted:${ids[5]}`;await optional.queueOptionalNotification(ids[5],channelContext,'Synthetic interrupted check',interruptedKey,new Date(Date.now()+86400000));
    const interrupted=await job(interruptedKey);await prisma.notificationJob.update({where:{id:interrupted.id},data:{status:'CHECKING',owner:'old-worker',leasedAt:new Date(Date.now()-180000)}});await drain();assert.equal((await job(interruptedKey)).status,'SENT');
    await reset(ids[5]);const sendingKey=`reminder:CHANNEL:sending:${ids[5]}`;await optional.queueOptionalNotification(ids[5],channelContext,'Synthetic interrupted send',sendingKey,new Date(Date.now()+86400000));const sending=await job(sendingKey);await prisma.notificationJob.update({where:{id:sending.id},data:{status:'SENDING',owner:'old-worker',leasedAt:new Date(Date.now()-180000)}});await drain();assert.equal((await job(sendingKey)).status,'UNCONFIRMED');
    console.log('PASS interrupted eligibility checks safely recover, while interrupted sends require review.');

    const redis=getRedis();for(const id of ids.slice(0,12)){keys.push(`user_queue:${id}`,`match_duration:${id}`);await redis.set(`user_queue:${id}`,'match_queue:band:7.0','EX',600);await redis.set(`match_duration:${id}`,'15','EX',600);await redis.sadd('match_queue:band:7.0',id);}
    assert((await practiceActivity()).totalCount>=12);assert.equal(await hasCompatiblePracticeQueue({id:ids[13],band:7,preferredCallMinutes:15}),true);assert.equal(await hasCompatiblePracticeQueue({id:ids[13],band:7,preferredCallMinutes:30}),false);
    const duplicate=await optional.createNotificationBroadcast({requestId:broadcast.requestId,messageId:12345},admin);assert.equal(duplicate.id,broadcast.id);
    await configuration.saveNotificationConfiguration({inactivity:false,checkout:false,peak:false,channel:false},admin);await reset(ids[5]);assert.equal(await optional.queueOptionalNotification(ids[5],channelContext,'Paused category',`reminder:CHANNEL:paused:${ids[5]}`,new Date(Date.now()+86400000)),false);
    await prisma.$transaction(tx=>persistNotification(tx,telegrams[5],'Synthetic mandatory receipt',undefined,true,`notification-test:${ids[5]}`));await drain();assert.equal((await job(`notification-test:${ids[5]}`)).status,'SENT');
    console.log('PASS peak eligibility runs real queue Lua and respects duration; broadcasts are idempotent; category pauses do not block transactional notices.');
  }finally{
    if(isRedisReady()){const redis=getRedis();for(const id of ids)await redis.srem('match_queue:band:7.0',id);if(keys.length)await redis.del(...keys);}
    await prisma.notificationJob.deleteMany({where:{telegramId:{in:telegrams}}});await prisma.notificationBroadcast.deleteMany({where:{id:{in:broadcasts}}});
    await prisma.auditLog.deleteMany({where:{OR:[{adminId:admin},{targetId:{in:ids}},{targetId:{in:broadcasts}}]}});
    await prisma.creditOrder.deleteMany({where:{userId:{in:ids}}});await prisma.user.deleteMany({where:{id:{in:ids}}});await disconnectRedis();await disconnectDB();
  }})().catch(error=>{console.error(error);process.exitCode=1;});
}
