import { cleanupFinishedRoom } from '../socket/signaling';
import { Bot } from 'grammy';
import type { MyContext } from '../bot/types';
import { createRedisSubscriber } from '../config/redis';
import { recoverPostCallJobs, wakePostCallWorker } from './postCallOutbox';
import { logger } from '../utils/logger';

export interface CallFinishedEventMessage {
  type: 'CALL_FINISHED';
  sessionId: string;
  roomName: string;
  userAId: string;
  userBId: string;
  userATelegramId: string;
  userBTelegramId: string;
  userAAlias: string;
  userBAlias: string;
  durationSeconds: number;
  recordingUrl?: string | null;
  retentionDaysA?: number | null;
  retentionDaysB?: number | null;
  reason?: string | null;
  requesterId?: string | null;
  deniedUserId?: string | null;
}

export async function handleCallFinishedEvent(msg: CallFinishedEventMessage, bot?: Bot<MyContext>): Promise<void> {
  if (typeof msg.sessionId !== 'string' || !msg.sessionId || msg.sessionId.length > 128) return;
  if (bot) await recoverPostCallJobs(bot, msg.sessionId);
  else wakePostCallWorker();
}

export interface EventSubscriberHandle {
  stop: () => Promise<void>;
}

export function startEventSubscriber(
  _botSupplier?: Bot<MyContext> | null | (() => Bot<MyContext> | null | undefined)
): EventSubscriberHandle | null {
  const subscriber = createRedisSubscriber();
  if (!subscriber) {
    logger.info('Redis event subscriber skipped (test mode or Redis not configured)', {
      service: 'eventSubscriber',
      event: 'event_subscriber_skipped',
    });
    return null;
  }

  if (subscriber.status === 'wait') {
    void subscriber.connect().catch((err: unknown) => {
      logger.error('Failed to connect Redis event subscriber', {
        service: 'eventSubscriber',
        event: 'subscriber_connect_error',
      }, err);
    });
  }

  // Subscription must wait for the lazy connection; no offline command queue is enabled.
  subscriber.once('ready', () => {
    subscriber.subscribe('pairtalk:events', err => {
      if (err) {
        logger.error('Failed to subscribe to pairtalk:events', { service: 'eventSubscriber', event: 'subscriber_subscribe_error' }, err);
      } else {
        logger.info('Subscribed to pairtalk:events Redis channel', { service: 'eventSubscriber', event: 'subscriber_subscribed' });
      }
    });
  });

  subscriber.on('message', (channel: string, message: string) => {
    if (channel !== 'pairtalk:events') return;

    try {
      const data = JSON.parse(message);
      if (data && data.type === 'CALL_FINISHED') {
        if (typeof data.roomName === 'string' && data.roomName.length <= 128 && typeof data.sessionId === 'string' && data.sessionId.length <= 128) {
          void cleanupFinishedRoom(data.roomName, data.sessionId).catch(error => logger.warn('Terminal room cleanup deferred', {service:'eventSubscriber'}, error));
        }
        // Coalesce hints; PostgreSQL polling recovers even if this message was missed.
        wakePostCallWorker();
      }
    } catch (err: unknown) {
      logger.error('Failed to parse or process pairtalk:events message', {
        service: 'eventSubscriber',
        event: 'message_processing_failed',
      }, err);
    }
  });

  return {
    stop: async () => {
      try {
        await subscriber.unsubscribe('pairtalk:events');
        await subscriber.quit();
      } catch {
        subscriber.disconnect();
      }
    },
  };
}
