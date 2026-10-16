import { Bot } from 'grammy';
import { MyContext } from './types';
import { logger } from '../utils/logger';
import crypto from 'node:crypto';
import { prisma } from '../config/database';
import { env } from '../config/env';
import type { Prisma } from '@prisma/client';
import type { ReminderCategory, ReminderContext } from '../contracts/notifications';
import { notificationDeliveryDecision } from '../services/notificationPolicy';

type SendMessageOptions = Parameters<Bot<MyContext>['api']['sendMessage']>[2];
type SendMessageSignal = Parameters<Bot<MyContext>['api']['sendMessage']>[3];

const notificationNamespace = crypto.createHash('sha256').update(env.BOT_TOKEN).digest('hex').slice(0, 24);

/** Must run inside the business transaction when delivery depends on a committed award. */
export async function persistNotification(
  tx: Prisma.TransactionClient, telegramId: string, text: string,
  options?: SendMessageOptions, urgent = false, dedupeKey?: string, expiresAt?: Date,
  reminder?:{category:ReminderCategory;context:ReminderContext}
): Promise<boolean> {
  const optionsJson = options ? JSON.stringify(options) : null;
  const contextJson=reminder?JSON.stringify(reminder.context):null;
  if (text.length > 8192 || (optionsJson?.length ?? 0) > 16384 || (dedupeKey?.length ?? 0) > 256 || (contextJson?.length??0)>4096) {
    throw new Error('Notification exceeds supported size.');
  }
  // PostgreSQL returns void; Prisma cannot deserialize it without an explicit supported cast.
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${notificationNamespace},0))::text`;
  // Deduplicate all outcomes, including uncertain delivery: replay must never resend those jobs.
  if (dedupeKey && await tx.notificationJob.findFirst({ where: { namespace: notificationNamespace, dedupeKey } })) return false;
  // Optional/bulk backlog must never prevent an atomic paid purchase receipt
  // or a mandatory account notice from being committed.
  if (!urgent && await tx.notificationJob.count({ where: { namespace: notificationNamespace, status: { in: ['QUEUED', 'CHECKING', 'SENDING'] } } }) >= 1000) {
    throw new Error('Notification queue is full.');
  }
  await tx.notificationJob.create({ data: { namespace: notificationNamespace, telegramId, text, optionsJson, urgent, dedupeKey, expiresAt: expiresAt ?? null,category:reminder?.category??'TRANSACTIONAL',contextJson } });
  return true;
}

interface QueueItem {
  telegramId: string;
  text: string;
  options?: SendMessageOptions;
  retries?: number;
  isUrgent?: boolean;
}

export class NotificationQueue {
  private urgentQueue: QueueItem[] = [];
  private bulkQueue: QueueItem[] = [];
  private isProcessing = false;
  private stopped = false;
  private controller: AbortController | null = null;
  private active: Promise<void> | null = null;
  private readonly namespace = notificationNamespace;

  /** Persistent jobs survive restarts; uncertain sends require review instead of blind replay. */
  async recover(bot: Bot<MyContext>): Promise<void> {
    if (env.NODE_ENV === 'test' || this.stopped) return;
    if (this.active) return this.active;
    this.active = this.drainPersistent(bot);
    try { await this.active; } finally { this.active = null; }
  }

  private async drainPersistent(bot: Bot<MyContext>) {
    await prisma.notificationJob.updateMany({where:{namespace:this.namespace,status:'CHECKING',leasedAt:{lt:new Date(Date.now()-120000)}},data:{status:'QUEUED',owner:null,leasedAt:null,nextAttemptAt:new Date(),failure:'Eligibility check interrupted before sending; safe to retry.'}});
    await prisma.notificationJob.updateMany({where:{namespace:this.namespace,status:'SENDING',leasedAt:{lt:new Date(Date.now()-120000)}},data:{status:'UNCONFIRMED',owner:null,failure:'Delivery outcome uncertain after worker interruption; review before sending again.'}});
    while (!this.stopped) {
      await prisma.notificationJob.updateMany({where:{namespace:this.namespace,status:'QUEUED',expiresAt:{lte:new Date()}},data:{status:'EXPIRED',failure:'Offer expired before notification delivery.'}});
      const job = await prisma.notificationJob.findFirst({where:{namespace:this.namespace,status:'QUEUED',nextAttemptAt:{lte:new Date()}},orderBy:[{urgent:'desc'},{createdAt:'asc'}]});
      if (!job) return;
      if(job.dedupeKey?.startsWith('discount-offer:')){
        await prisma.notificationJob.updateMany({where:{id:job.id,status:'QUEUED'},data:{status:'EXPIRED',failure:'Personal offer promotions retired; offers are posted in the channel.'}});
        continue;
      }
      const owner=crypto.randomUUID();
      const claim = await prisma.notificationJob.updateMany({where:{id:job.id,status:'QUEUED',OR:[{expiresAt:null},{expiresAt:{gt:new Date()}}]},data:{status:'CHECKING',owner,leasedAt:new Date()}});
      if (claim.count !== 1) continue;
      this.controller = new AbortController();
      let attempted=false;
      try {
        const decision=await notificationDeliveryDecision(job);
        if(decision.action!=='SEND'){
          await prisma.notificationJob.updateMany({where:{id:job.id,owner,status:'CHECKING'},data:decision.action==='SKIP'?{status:'EXPIRED',owner:null,failure:decision.reason}:{status:'QUEUED',owner:null,leasedAt:null,nextAttemptAt:decision.until,failure:decision.reason}});
          continue;
        }
        const ready=await prisma.notificationJob.updateMany({where:{id:job.id,owner,status:'CHECKING'},data:{status:'SENDING',leasedAt:new Date()}});
        if(ready.count!==1)continue;
        // grammY types the legacy AbortSignal shim; Node's signal implements the same cancellation contract.
        attempted=true;
        await bot.api.sendMessage(job.telegramId,job.text,job.optionsJson?JSON.parse(job.optionsJson):undefined,this.controller.signal as unknown as SendMessageSignal);
        await prisma.notificationJob.updateMany({where:{id:job.id,owner,status:'SENDING'},data:{status:'SENT',owner:null,failure:null}});
      } catch(error: any) {
        if(!attempted){await prisma.notificationJob.updateMany({where:{id:job.id,owner},data:{status:'QUEUED',owner:null,leasedAt:null,nextAttemptAt:new Date(Date.now()+30000),failure:'Eligibility check unavailable. No Telegram request was sent.'}});continue;}
        const seconds=error?.parameters?.retry_after;
        const retry=error?.error_code===429 && Number.isInteger(seconds) && seconds>0 && seconds<=30 && job.retries<1 && !this.stopped;
        const permanent=[400,401,403].includes(error?.error_code);
        await prisma.notificationJob.updateMany({where:{id:job.id,owner,status:'SENDING'},data:{status:retry?'QUEUED':permanent?'FAILED':'UNCONFIRMED',owner:null,retries:retry?job.retries+1:job.retries,nextAttemptAt:new Date(Date.now()+(retry?seconds*1000:0)),failure:retry?'Telegram rate limit; bounded retry scheduled.':permanent?'Telegram rejected delivery.':'Delivery outcome uncertain; no automatic resend.'}});
        logger.warn('Notification delivery deferred or rejected',{service:'bot',event:'notification_delivery',jobId:job.id,retry,permanent});
      } finally { this.controller = null; }
    }
  }

  startWorker(supplier: () => Bot<MyContext> | null): () => Promise<void> {
    this.stopped=false; let timer:NodeJS.Timeout | undefined;
    const tick=async()=>{if(this.stopped)return;const bot=supplier();try{if(bot)await this.recover(bot);}catch(error){logger.warn('Notification recovery unavailable',{service:'bot'},error);}if(!this.stopped)timer=setTimeout(tick,5000);};
    timer=setTimeout(tick,5000);
    return async()=>{this.stopped=true;clearTimeout(timer);this.controller?.abort();await this.active;};
  }

  async enqueue(
    bot: Bot<MyContext>,
    telegramId: string,
    text: string,
    options?: SendMessageOptions,
    isUrgent = false,
    dedupeKey?: string
  ) {
    if (env.NODE_ENV !== 'test' || dedupeKey) {
      await prisma.$transaction(tx => persistNotification(tx, telegramId, text, options, isUrgent, dedupeKey));
      void this.recover(bot).catch(error=>logger.warn('Notification worker unavailable',{service:'bot'},error));
      return;
    }
    if (this.urgentQueue.length + this.bulkQueue.length >= 1000) throw new Error('Notification queue is full.');
    const item: QueueItem = { telegramId, text, options, retries: 0, isUrgent };
    if (isUrgent) {
      this.urgentQueue.push(item);
    } else {
      this.bulkQueue.push(item);
    }
    this.process(bot);
  }

  async enqueueUrgent(
    bot: Bot<MyContext>,
    telegramId: string,
    text: string,
    options?: SendMessageOptions
  ) {
    return this.enqueue(bot, telegramId, text, options, true);
  }

  private async process(bot: Bot<MyContext>) {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.urgentQueue.length > 0 || this.bulkQueue.length > 0) {
      // Prioritize urgent post-call review cards ahead of bulk marketing broadcasts
      const item = this.urgentQueue.shift() || this.bulkQueue.shift();
      if (!item) break;

      try {
        await bot.api.sendMessage(item.telegramId, item.text, item.options);
        // Rate-pacing delay to respect Telegram's 30 msg/s broadcast limit
        await new Promise((resolve) => setTimeout(resolve, 35));
      } catch (err: unknown) {
        const errorObj = err as { error_code?: number; parameters?: { retry_after?: number }; message?: string };
        if (errorObj?.error_code === 429) {
          // Rate limited by Telegram API
          const retryAfter = (errorObj.parameters?.retry_after || 3) * 1000;
          const currentRetries = item.retries || 0;

          if (currentRetries < 1 && retryAfter <= 30000) {
            logger.warn(`Telegram notification 429 rate limited. Retrying (${currentRetries + 1}/5) after ${retryAfter}ms`, {
              service: 'bot',
              event: 'notification_rate_limited',
              telegramId: item.telegramId,
              attempt: currentRetries + 1,
              retryAfter,
              isUrgent: item.isUrgent,
            });
            const targetQueue = item.isUrgent ? this.urgentQueue : this.bulkQueue;
            targetQueue.unshift({ ...item, retries: currentRetries + 1 });
            await new Promise((resolve) => setTimeout(resolve, retryAfter));
          } else {
            logger.error(`Max retries reached for message to ${item.telegramId}. Message dropped.`, {
              service: 'bot',
              event: 'notification_max_retries_dropped',
              telegramId: item.telegramId,
            });
          }
        } else {
          logger.warn(`Failed to send message to ${item.telegramId}`, {
            service: 'bot',
            event: 'notification_send_failed',
            telegramId: item.telegramId,
          }, err);
        }
      }

      // Small delay between outgoing messages to respect rate limits (30 msgs/sec max)
      await new Promise((resolve) => setTimeout(resolve, 35));
    }

    this.isProcessing = false;
  }
}

export const notificationQueue = new NotificationQueue();
