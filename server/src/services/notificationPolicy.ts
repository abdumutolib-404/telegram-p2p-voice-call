import type { NotificationJob, User } from '@prisma/client';
import { prisma } from '../config/database';
import { quietUntil, type NotificationPreferences, type ReminderCategory, type ReminderContext } from '../contracts/notifications';
import { lockRow } from '../utils/transactionLock';
import { hasAcceptedCurrentTerms } from './terms';
import { isAccountRestricted } from './accountRestriction';
import { practiceActivity, hasCompatiblePracticeQueue } from './practiceActivity';
import { getEffectiveEntitlement, getUserCallsUsedThisPeriod } from './plan';
import { readNotificationConfiguration, categoryEnabled } from './notificationConfiguration';
import { getRedis, isRedisReady } from '../config/redis';

export function userNotificationPreferences(user:User):NotificationPreferences {
  return {inactivity:user.notifyInactivity===true,checkout:user.notifyCheckout===true,peak:user.notifyPeak===true,channel:user.notifyChannel===true,quietHours:user.quietHours??true,quietStart:user.quietStart??22,quietEnd:user.quietEnd??8};
}
export function optedIn(user:User,category:ReminderCategory) {
  return {INACTIVITY:user.notifyInactivity,CHECKOUT:user.notifyCheckout,PEAK:user.notifyPeak,CHANNEL:user.notifyChannel}[category]===true;
}
export function reminderContext(value:string|null,category:string):ReminderContext|null {
  try{
    const c=JSON.parse(value||'null');
    if(!c||c.kind!==category)return null;
    if(c.kind==='INACTIVITY'&&typeof c.activityAt==='string'&&Number.isFinite(Date.parse(c.activityAt)))return c;
    if(c.kind==='CHECKOUT'&&typeof c.orderId==='string'&&/^[a-f0-9-]{36}$/.test(c.orderId))return c;
    if(c.kind==='PEAK'&&typeof c.sampledAt==='string'&&Number.isFinite(Date.parse(c.sampledAt))&&Number.isSafeInteger(c.threshold)&&c.threshold>=12)return c;
    if(c.kind==='CHANNEL'&&typeof c.broadcastId==='string'&&/^[a-f0-9-]{36}$/.test(c.broadcastId)&&((Number.isSafeInteger(c.messageId)&&c.messageId>0)||(typeof c.topicRevision==='string'&&/^[a-f0-9]{64}$/.test(c.topicRevision))))return c;
  }catch{/* Corrupt/stale context must not trigger a send. */}
  return null;
}
export async function reminderRelevant(user:User,context:ReminderContext,now=new Date()):Promise<boolean> {
  if(!user.onboarded||isAccountRestricted(user)||!hasAcceptedCurrentTerms(user)||user.dnd)return false;
  if(await prisma.callSession.findFirst({where:{status:{in:['ACTIVE','PENDING']},OR:[{userAId:user.id},{userBId:user.id}]},select:{id:true}}))return false;
  if(isRedisReady()&&await getRedis().get(`user_queue:${user.id}`))return false;
  if(context.kind==='INACTIVITY')return user.lastActiveAt.getTime()<=now.getTime()-3*86400000&&user.lastActiveAt.toISOString()===context.activityAt;
  if(context.kind==='CHECKOUT'){
    const order=await prisma.creditOrder.findUnique({where:{id:context.orderId}});
    return Boolean(order&&order.userId===user.id&&order.status==='PENDING'&&!order.authorizedAt&&order.expiresAt>now&&user.lastActiveAt.getTime()<=now.getTime()-10*60000);
  }
  if(context.kind==='PEAK'){
    if(now.getTime()-Date.parse(context.sampledAt)>15*60000)return false;
    const ent=getEffectiveEntitlement(user),used=await getUserCallsUsedThisPeriod(user.id,user);
    const wantsThirty=user.preferredCallMinutes===30,needsWallet=!ent.isAdmin&&(used>=ent.baseCallLimit||(wantsThirty&&ent.maxDurationMinutes<30));
    if(needsWallet&&user.callCredits<(wantsThirty?2:1)&&(wantsThirty||await (await import('./referralService')).getActiveBonusCallsCount(user.id)<=0))return false;
    const activity=await practiceActivity(now);
    return Boolean(activity&&activity.totalCount>=activity.threshold&&await hasCompatiblePracticeQueue(user));
  }
  if(context.broadcastId){
    const broadcast=await prisma.notificationBroadcast.findUnique({where:{id:context.broadcastId}});
    if(!broadcast||broadcast.expiresAt<=now)return false;
    if(broadcast.kind==='TOPICS')return broadcast.topicRevision===context.topicRevision;
    if(broadcast.messageId!==context.messageId)return false;
    if(await prisma.packCampaign.findFirst({where:{telegramMessageId:context.messageId},select:{id:true}}))return false;
  }
  return true;
}

type DeliveryDecision={action:'SEND'}|{action:'SKIP';reason:string}|{action:'DEFER';until:Date;reason:string};
export async function notificationDeliveryDecision(job:Pick<NotificationJob,'id'|'telegramId'|'category'|'contextJson'|'dedupeKey'>,now=new Date()):Promise<DeliveryDecision> {
  if(job.dedupeKey?.startsWith('pack-checkout:')){
    const order=await prisma.creditOrder.findUnique({where:{id:job.dedupeKey.slice('pack-checkout:'.length)}});
    if(!order||order.status!=='PENDING'||order.authorizedAt||order.expiresAt<=now)return {action:'SKIP',reason:'Checkout no longer needs payment instructions.'};
  }
  if(job.dedupeKey?.startsWith('pack-receipt:')){
    const order=await prisma.creditOrder.findUnique({where:{id:job.dedupeKey.slice('pack-receipt:'.length)}});
    if(!order||order.status!=='PAID')return {action:'SKIP',reason:'Purchase state changed before receipt delivery.'};
  }
  if(!job.category||job.category==='TRANSACTIONAL')return {action:'SEND'};
  const context=reminderContext(job.contextJson,job.category);
  if(!context||!/^\d+$/.test(job.telegramId))return {action:'SKIP',reason:'Invalid reminder context.'};
  if(!categoryEnabled(await readNotificationConfiguration(),context.kind))return {action:'SKIP',reason:'This reminder category is paused.'};
  const initial=await prisma.user.findUnique({where:{telegramId:BigInt(job.telegramId)}});
  if(!initial)return {action:'SKIP',reason:'Account not found.'};
  return prisma.$transaction(async (tx):Promise<DeliveryDecision>=>{
    await lockRow(tx,'User',initial.id);
    const user=await tx.user.findUnique({where:{id:initial.id}});
    if(!user||!optedIn(user,context.kind)||!await reminderRelevant(user,context,now))return {action:'SKIP',reason:'Reminder is no longer relevant or enabled.'};
    const wake=quietUntil(userNotificationPreferences(user),now);
    if(wake)return {action:'DEFER',until:wake,reason:'Quiet hours in Asia/Tashkent.'};
    if(user.lastReminderAttemptAt&&user.lastReminderJobId!==job.id&&now.getTime()-user.lastReminderAttemptAt.getTime()<86400000)return {action:'DEFER',until:new Date(user.lastReminderAttemptAt.getTime()+86400000),reason:'Daily optional-reminder cooldown.'};
    await tx.user.update({where:{id:user.id},data:{lastReminderAttemptAt:now,lastReminderJobId:job.id}});
    return {action:'SEND'};
  });
}
