import { Bot } from 'grammy';
import { MyContext } from './types';
import { logger } from '../utils/logger';
import crypto from 'node:crypto';
import { prisma } from '../config/database';
import { env } from '../config/env';
import type { Prisma } from '@prisma/client';

type SendMessageOptions = Parameters<Bot<MyContext>['api']['sendMessage']>[2];
type SendMessageSignal = Parameters<Bot<MyContext>['api']['sendMessage']>[3];

const notificationNamespace = crypto.createHash('sha256').update(env.BOT_TOKEN).digest('hex').slice(0, 24);

/** Must run inside the business transaction when delivery depends on a committed award. */
export async function persistNotification(
  tx: Prisma.TransactionClient, telegramId: string, text: string,
  options?: SendMessageOptions, urgent = false, dedupeKey?: string
): Promise<boolean> {
  const optionsJson = options ? JSON.stringify(options) : null;
  if (text.length > 8192 || (optionsJson?.length ?? 0) > 16384 || (dedupeKey?.length ?? 0) > 256) {
    throw new Error('Notification exceeds supported size.');
  }
  // PostgreSQL returns void; Prisma cannot deserialize it without an explicit supported cast.
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${notificationNamespace},0))::text`;
  // Deduplicate all outcomes, including uncertain delivery: replay must never resend those jobs.
  if (dedupeKey && await tx.notificationJob.findFirst({ where: { namespace: notificationNamespace, dedupeKey } })) return false;
  if (await tx.notificationJob.count({ where: { namespace: notificationNamespace, status: { in: ['QUEUED', 'SENDING'] } } }) >= 1000) {
    throw new Error('Notification queue is full.');
  }
  await tx.notificationJob.create({ data: { namespace: notificationNamespace, telegramId, text, optionsJson, urgent, dedupeKey } });
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
    await prisma.notificationJob.updateMany({where:{namespace:this.namespace,status:'SENDING',leasedAt:{lt:new Date(Date.now()-120000)}},data:{status:'UNCONFIRMED',failure:'Delivery outcome uncertain after worker interruption; review before sending again.'}});
    while (!this.stopped) {
      const job = await prisma.notificationJob.findFirst({where:{namespace:this.namespace,status:'QUEUED',nextAttemptAt:{lte:new Date()}},orderBy:[{urgent:'desc'},{createdAt:'asc'}]});
      if (!job) return;
      const claim = await prisma.notificationJob.updateMany({where:{id:job.id,status:'QUEUED'},data:{status:'SENDING',leasedAt:new Date()}});
      if (claim.count !== 1) continue;
      this.controller = new AbortController();
      try {
        // grammY types the legacy AbortSignal shim; Node's signal implements the same cancellation contract.
        await bot.api.sendMessage(job.telegramId,job.text,job.optionsJson?JSON.parse(job.optionsJson):undefined,this.controller.signal as unknown as SendMessageSignal);
        await prisma.notificationJob.update({where:{id:job.id},data:{status:'SENT',failure:null}});
      } catch(error: any) {
        const seconds=error?.parameters?.retry_after;
        const retry=error?.error_code===429 && Number.isInteger(seconds) && seconds>0 && seconds<=30 && job.retries<1 && !this.stopped;
        const permanent=[400,401,403].includes(error?.error_code);
        await prisma.notificationJob.update({where:{id:job.id},data:{status:retry?'QUEUED':permanent?'FAILED':'UNCONFIRMED',retries:retry?job.retries+1:job.retries,nextAttemptAt:new Date(Date.now()+(retry?seconds*1000:0)),failure:retry?'Telegram rate limit; bounded retry scheduled.':permanent?'Telegram rejected delivery.':'Delivery outcome uncertain; no automatic resend.'}});
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
