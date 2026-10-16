import type { Bot } from 'grammy';
import type { MyContext } from '../bot/types';
import { getRedis } from '../config/redis';
import { queueQuestionUpdate } from './optionalNotifications';
import { logger } from '../utils/logger';

export class TopicNotificationService {
  private readonly lastBroadcastKey='pairtalk:topic_broadcast:last_sent';
  private readonly cooldownSeconds=48*3600;
  async broadcastNewTopics(newQuestionsCount:number,topicNames:string[],botInstance?:Bot<MyContext>|null):Promise<{queued:boolean;reason?:string}> {
    if(!botInstance)return {queued:false,reason:'Bot instance not available'};
    if(newQuestionsCount<3&&!topicNames.length)return {queued:false,reason:'Below threshold for notification'};
    try{
      const redis=getRedis();
      if(await redis.get(this.lastBroadcastKey))return {queued:false,reason:'Cooldown active'};
      const queued=await queueQuestionUpdate(newQuestionsCount,topicNames);
      if(queued)await redis.set(this.lastBroadcastKey,new Date().toISOString(),'EX',this.cooldownSeconds);
      return {queued};
    }catch{logger.warn('Question update notification scheduling unavailable',{service:'topicNotification'});return {queued:false,reason:'Scheduling unavailable'};}
  }
}
export const topicNotificationService=new TopicNotificationService();
