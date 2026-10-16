import crypto from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../config/database';
import { env } from '../config/env';
import { lockRow } from '../utils/transactionLock';
import { logger } from '../utils/logger';
import type { NotificationPreferences, ReminderContext } from '../contracts/notifications';
import { optedIn, reminderContext, reminderRelevant, userNotificationPreferences } from './notificationPolicy';
import { readNotificationConfiguration, categoryEnabled } from './notificationConfiguration';
import { currentTerms } from './terms';

const preferenceInput=z.object({inactivity:z.boolean(),checkout:z.boolean(),peak:z.boolean(),channel:z.boolean(),quietHours:z.boolean(),quietStart:z.number().int().min(0).max(23),quietEnd:z.number().int().min(0).max(23)}).strict().refine(p=>!p.quietHours||p.quietStart!==p.quietEnd);
export async function saveNotificationPreferences(userId:string,input:unknown) {
  const p=preferenceInput.parse(input);
  return prisma.$transaction(async tx=>{
    await lockRow(tx,'User',userId);
    const before=await tx.user.findUniqueOrThrow({where:{id:userId}});
    const user=await tx.user.update({where:{id:userId},data:{notifyInactivity:p.inactivity,notifyCheckout:p.checkout,notifyPeak:p.peak,notifyChannel:p.channel,quietHours:p.quietHours,quietStart:p.quietStart,quietEnd:p.quietEnd,lastActiveAt:new Date()}});
    await tx.notificationJob.updateMany({where:{telegramId:user.telegramId.toString(),category:{in:['INACTIVITY','CHECKOUT','PEAK','CHANNEL']},status:'QUEUED'},data:{nextAttemptAt:new Date(),failure:null}});
    await tx.auditLog.create({data:{action:'NOTIFICATION_PREFERENCES',targetId:userId,adminId:user.telegramId.toString(),beforeState:JSON.stringify(userNotificationPreferences(before)),afterState:JSON.stringify(p),reason:'User saved optional notification preferences'}});
    return userNotificationPreferences(user);
  });
}
export async function stopOptionalNotifications(telegramId:bigint) {
  const user=await prisma.user.findUnique({where:{telegramId}});
  if(!user)return;
  const p=userNotificationPreferences(user);
  if(!p.inactivity&&!p.checkout&&!p.peak&&!p.channel)return p;
  return saveNotificationPreferences(user.id,{...p,inactivity:false,checkout:false,peak:false,channel:false});
}

export async function queueOptionalNotification(userId:string,context:ReminderContext,text:string,dedupeKey:string,expiresAt:Date,now=new Date()) {
  if(!reminderContext(JSON.stringify(context),context.kind)||text.length>4096||expiresAt<=now)throw new Error('Invalid optional notification.');
  if(!categoryEnabled(await readNotificationConfiguration(),context.kind))return false;
  const {persistNotification}=await import('../bot/notifications');
  const app=new URL(env.MINI_APP_URL),settings=new URL(env.MINI_APP_URL);
  settings.searchParams.set('view','account');
  if(context.kind==='CHECKOUT'){app.searchParams.set('view','upgrade');app.searchParams.set('resumeOrder',context.orderId);}
  const target=context.kind==='CHANNEL'&&context.messageId?{text:'Read channel update',url:`https://t.me/pairtalk/${context.messageId}`}:{text:context.kind==='CHECKOUT'?'Review checkout':'Open PairTalk',web_app:{url:app.toString()}};
  return prisma.$transaction(async tx=>{
    await lockRow(tx,'User',userId);
    const user=await tx.user.findUnique({where:{id:userId}});
    if(!user||!optedIn(user,context.kind)||user.nextReminderAt>now||!await reminderRelevant(user,context,now))return false;
    const created=await persistNotification(tx,user.telegramId.toString(),text,{reply_markup:{inline_keyboard:[[target],[{text:'Notification settings',web_app:{url:settings.toString()}},{text:'Stop reminders',callback_data:'notifications_stop'}]]}},false,dedupeKey,expiresAt,{category:context.kind,context});
    // Advance even for an already-deduped inactive episode so it cannot starve
    // later users in the scheduler's bounded page.
    await tx.user.update({where:{id:userId},data:{nextReminderAt:new Date(now.getTime()+86400000)}});
    return created;
  });
}

export async function createNotificationBroadcast(input:unknown,adminId:string) {
  const data=z.object({requestId:z.string().uuid(),messageId:z.number().int().positive().max(2147483647)}).strict().parse(input);
  if(await prisma.packCampaign.findFirst({where:{telegramMessageId:data.messageId},select:{id:true}}))throw new Error('Offer posts stay in the channel. Choose a community announcement.');
  const previous=await prisma.notificationBroadcast.findUnique({where:{requestId:data.requestId}});
  if(previous){if(previous.adminId!==adminId||previous.messageId!==data.messageId)throw new Error('This request already belongs to another announcement.');return previous;}
  return prisma.$transaction(async tx=>{
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(736251015)::text`;
    const existing=await tx.notificationBroadcast.findUnique({where:{requestId:data.requestId}});
    if(existing){if(existing.adminId!==adminId||existing.messageId!==data.messageId)throw new Error('This request already belongs to another announcement.');return existing;}
    const broadcast=await tx.notificationBroadcast.create({data:{...data,adminId,expiresAt:new Date(Date.now()+86400000)}});
    await tx.auditLog.create({data:{action:'CHANNEL_ANNOUNCEMENT_QUEUED',targetId:broadcast.id,adminId,afterState:JSON.stringify({messageId:data.messageId}),reason:'Notify people who opted into channel updates'}});
    return broadcast;
  });
}

export async function queueQuestionUpdate(count:number,topicNames:string[],now=new Date()) {
  if(!Number.isSafeInteger(count)||count<0||!Array.isArray(topicNames)||!topicNames.every(name=>typeof name==='string'))throw new Error('Invalid question update.');
  const period=Math.floor(now.getTime()/(48*3600000));
  const revision=crypto.createHash('sha256').update(JSON.stringify({count,topics:topicNames.slice(0,20),period})).digest('hex');
  return prisma.$transaction(async tx=>{
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(736251015)::text`;
    if(await tx.notificationBroadcast.findUnique({where:{requestId:`topics:${revision}`}}))return false;
    await tx.notificationBroadcast.create({data:{requestId:`topics:${revision}`,adminId:'SYSTEM',kind:'TOPICS',topicRevision:revision,text:count>0?`${count.toLocaleString('en-US')} speaking prompts were added to PairTalk. Open Questions during your next call to practise.`:'The speaking-question library has been updated. Open Questions during your next call to practise.',expiresAt:new Date(now.getTime()+86400000)}});
    return true;
  });
}

async function advanceChannelBroadcasts(now:Date,stopped:()=>boolean) {
  const pending=await prisma.notificationBroadcast.findMany({where:{completed:false,nextAttemptAt:{lte:now},expiresAt:{gt:now},OR:[{leaseUntil:null},{leaseUntil:{lte:now}}]},orderBy:{createdAt:'asc'},take:3});
  for(const candidate of pending){
    if(stopped())return;
    const owner=crypto.randomUUID();
    const claimed=await prisma.notificationBroadcast.updateMany({where:{id:candidate.id,completed:false,OR:[{leaseUntil:null},{leaseUntil:{lte:new Date()}}]},data:{owner,leaseUntil:new Date(Date.now()+180000)}});
    if(!claimed.count)continue;
    const broadcast=await prisma.notificationBroadcast.findUniqueOrThrow({where:{id:candidate.id}});
    try{
      const users=await prisma.user.findMany({where:{...reminderCandidates(),notifyChannel:true,nextReminderAt:{lte:now},...(broadcast.cursor?{id:{gt:broadcast.cursor}}:{})},orderBy:{id:'asc'},take:100,select:{id:true}});
      let cursor=broadcast.cursor;
      for(const user of users){
        if(stopped())break;
        const context:ReminderContext=broadcast.kind==='TOPICS'?{kind:'CHANNEL',broadcastId:broadcast.id,topicRevision:broadcast.topicRevision!}:{kind:'CHANNEL',broadcastId:broadcast.id,messageId:broadcast.messageId!};
        const text=broadcast.kind==='TOPICS'?broadcast.text!:'A new PairTalk announcement is available in @pairtalk. Open the channel to read it.';
        await queueOptionalNotification(user.id,context,text,`reminder:CHANNEL:${broadcast.id}:${user.id}`,broadcast.expiresAt,now);cursor=user.id;
      }
      await prisma.notificationBroadcast.updateMany({where:{id:candidate.id,owner},data:{cursor,completed:!stopped()&&users.length<100,owner:null,leaseUntil:null,nextAttemptAt:new Date(Date.now()+5000)}});
    }catch(error){await prisma.notificationBroadcast.updateMany({where:{id:candidate.id,owner},data:{owner:null,leaseUntil:null,nextAttemptAt:new Date(Date.now()+60000)}});throw error;}
  }
}
function reminderCandidates(){return {onboarded:true,isBanned:false,isPermanentlyBanned:false,dnd:false,termsAcceptedVersion:currentTerms.version,termsDocumentSha256:currentTerms.sha256,termsAcceptedAt:{not:null}};}
export async function scheduleOptionalNotifications(now=new Date(),stopped:()=>boolean=()=>false) {
  const config=await readNotificationConfiguration();
  if(config.checkout){
    const orders=await prisma.creditOrder.findMany({where:{status:'PENDING',authorizedAt:null,expiresAt:{gt:now},createdAt:{lte:new Date(now.getTime()-10*60000)},user:{...reminderCandidates(),notifyCheckout:true,nextReminderAt:{lte:now},lastActiveAt:{lte:new Date(now.getTime()-10*60000)}}},orderBy:{createdAt:'asc'},take:100,select:{id:true,userId:true,expiresAt:true}});
    for(const order of orders){if(stopped())return;await queueOptionalNotification(order.userId,{kind:'CHECKOUT',orderId:order.id},'Your practice pack is waiting. Review or cancel your existing checkout before it expires. No payment has been confirmed.',`reminder:CHECKOUT:${order.id}`,order.expiresAt,now);}
  }
  if(config.inactivity){
    const users=await prisma.user.findMany({where:{...reminderCandidates(),notifyInactivity:true,nextReminderAt:{lte:now},lastActiveAt:{lte:new Date(now.getTime()-3*86400000)}},orderBy:[{nextReminderAt:'asc'},{id:'asc'}],take:100,select:{id:true,lastActiveAt:true}});
    for(const user of users){if(stopped())return;await queueOptionalNotification(user.id,{kind:'INACTIVITY',activityAt:user.lastActiveAt.toISOString()},'Ready for another speaking session? Open PairTalk when you have time. Your purchased practice does not expire.',`reminder:INACTIVITY:${user.id}:${user.lastActiveAt.getTime()}`,new Date(now.getTime()+86400000),now);}
  }
  if(config.channel)await advanceChannelBroadcasts(now,stopped);
}
export function startOptionalNotificationScheduler():()=>Promise<void> {
  let stopped=false,timer:NodeJS.Timeout|undefined,active:Promise<void>|undefined;
  const tick=async()=>{if(stopped)return;active=scheduleOptionalNotifications(new Date(),()=>stopped).catch(()=>logger.warn('Optional notification scheduling unavailable',{service:'notifications'}));await active;active=undefined;if(!stopped)timer=setTimeout(tick,5*60000);};
  timer=setTimeout(tick,15000);
  return async()=>{stopped=true;clearTimeout(timer);await active;};
}
