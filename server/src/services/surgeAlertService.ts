import type { Bot } from 'grammy';
import type { MyContext } from '../bot/types';
import { prisma } from '../config/database';
import { getRedis, isRedisReady } from '../config/redis';
import { DistributedLeaderLock } from './leaderLock';
import { logger } from '../utils/logger';
import { currentTerms } from './terms';
import { practiceActivity } from './practiceActivity';
import { queueOptionalNotification } from './optionalNotifications';

export const SURGE_CONFIG={GLOBAL_COOLDOWN_SECONDS:4*3600,USER_COOLDOWN_SECONDS:48*3600,MIN_ABSOLUTE_QUORUM:12,DAU_PERCENTAGE_THRESHOLD:.1,MAX_RECIPIENTS_PER_CYCLE:75};
export class SurgeAlertService {
  private readonly globalCooldownKey='pairtalk:surge_alert:global_last_sent';
  private readonly userCooldownPrefix='pairtalk:surge_alert:user:';
  private leaderLock:DistributedLeaderLock|null=null;
  private intervalTimer:NodeJS.Timeout|null=null;
  private initialTimer:NodeJS.Timeout|null=null;
  private active:Promise<void>|null=null;
  private stopped=false;
  async getActiveConcurrentCount() {
    try{const activity=await practiceActivity();return activity?{callersCount:activity.callersCount,queuedCount:activity.queuedCount,totalCount:activity.totalCount}:{callersCount:0,queuedCount:0,totalCount:0};}
    catch{return {callersCount:0,queuedCount:0,totalCount:0};}
  }
  async checkAndTriggerSurgeAlert(botInstance?:Bot<MyContext>|null,now=new Date()):Promise<{triggered:boolean;reason?:string;recipientsCount?:number}> {
    if(!botInstance)return {triggered:false,reason:'Bot instance unavailable'};
    if(!isRedisReady())return {triggered:false,reason:'Redis not ready'};
    const redis=getRedis();
    if(await redis.get(this.globalCooldownKey))return {triggered:false,reason:'Global surge cooldown active'};
    const activity=await practiceActivity(now);
    if(!activity||activity.totalCount<activity.threshold)return {triggered:false,reason:`Activity (${activity?.totalCount??0}) below surge threshold (${activity?.threshold??12})`};
    const candidates=await prisma.user.findMany({where:{notifyPeak:true,onboarded:true,isBanned:false,isPermanentlyBanned:false,dnd:false,termsAcceptedVersion:currentTerms.version,termsDocumentSha256:currentTerms.sha256,nextReminderAt:{lte:now}},orderBy:[{nextReminderAt:'asc'},{id:'asc'}],take:250,select:{id:true}});
    let queued=0;
    const period=Math.floor(now.getTime()/(SURGE_CONFIG.GLOBAL_COOLDOWN_SECONDS*1000));
    for(const user of candidates){
      if(await redis.get(this.userCooldownPrefix+user.id))continue;
      const created=await queueOptionalNotification(user.id,{kind:'PEAK',sampledAt:now.toISOString(),threshold:activity.threshold},'More learners are practising now. Open PairTalk to search near your level. Matching depends on compatible partners being available.',`reminder:PEAK:${period}:${user.id}`,new Date(now.getTime()+15*60000),now);
      if(created){queued++;await redis.set(this.userCooldownPrefix+user.id,now.toISOString(),'EX',SURGE_CONFIG.USER_COOLDOWN_SECONDS);}
      if(queued>=SURGE_CONFIG.MAX_RECIPIENTS_PER_CYCLE)break;
    }
    if(!queued)return {triggered:false,reason:'No opted-in, available recipients with compatible queue activity'};
    await redis.set(this.globalCooldownKey,now.toISOString(),'EX',SURGE_CONFIG.GLOBAL_COOLDOWN_SECONDS);
    logger.info('Optional peak activity reminders queued',{service:'surgeAlert',recipientsCount:queued,totalActive:activity.totalCount});
    return {triggered:true,recipientsCount:queued};
  }
  startScheduler(supplier:()=>Bot<MyContext>|null,intervalMs=10*60000) {
    if(this.intervalTimer)return;
    this.stopped=false;
    this.leaderLock=new DistributedLeaderLock({lockKey:'pairtalk:surge:scheduler:lock',ttlMs:25000,heartbeatIntervalMs:8000});
    const trigger=()=>{
      if(this.stopped||this.active)return;
      this.active=(async()=>{
        const lock=this.leaderLock;
        if(!lock||!await lock.acquire())return;
        try{await this.checkAndTriggerSurgeAlert(supplier());}
        catch{logger.warn('Peak activity scheduling unavailable',{service:'surgeAlert'});}
        finally{await lock.release();}
      })().finally(()=>{this.active=null;});
      void this.active.catch(()=>logger.warn('Peak scheduler lease unavailable',{service:'surgeAlert'}));
    };
    this.initialTimer=setTimeout(trigger,120000);this.intervalTimer=setInterval(trigger,intervalMs);
  }
  async stopScheduler() {
    this.stopped=true;if(this.intervalTimer)clearInterval(this.intervalTimer);if(this.initialTimer)clearTimeout(this.initialTimer);
    this.intervalTimer=null;this.initialTimer=null;await this.active;await this.leaderLock?.release();this.leaderLock=null;
  }
}
export const surgeAlertService=new SurgeAlertService();
