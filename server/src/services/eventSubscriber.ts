import { Bot } from 'grammy';
import type { MyContext } from '../bot/types';
import { createRedisSubscriber } from '../config/redis';
import { sendPostCallReviewCard } from '../bot/handlers/postCall';
import { onCallFinishedCheckReferralReward } from './referralService';
import { cleanupDirectCallMessages } from './directCallMessages';
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

export async function handleCallFinishedEvent(
  msg: CallFinishedEventMessage,
  bot?: Bot<MyContext>
): Promise<void> {
  const {
    sessionId,
    userAId,
    userBId,
    userATelegramId,
    userBTelegramId,
    userAAlias,
    userBAlias,
    durationSeconds,
    recordingUrl,
    retentionDaysA,
    retentionDaysB,
    reason,
    requesterId,
    deniedUserId,
  } = msg;

  // 1. Referral reward processing (requires min duration handled internally by service)
  await onCallFinishedCheckReferralReward(
    {
      id: sessionId,
      userAId,
      userBId,
      duration: durationSeconds,
    },
    bot ?? undefined
  ).catch((err: unknown) => {
    logger.warn('Failed checking referral reward on call finished event', {
      service: 'eventSubscriber',
      event: 'referral_reward_check_failed',
      sessionId,
    }, err);
  });

  if (!bot) return;

  // 2. Microphone access denied notification
  if (reason === 'microphone_permission_denied') {
    const isUserBDenied = deniedUserId === userBId || requesterId === userBId;
    const deniedTgId = isUserBDenied ? userBTelegramId : userATelegramId;
    const partnerTgId = isUserBDenied ? userATelegramId : userBTelegramId;

    await Promise.allSettled([
      bot.api.sendMessage(
        deniedTgId,
        `🎙️ <b>Call Ended: Microphone Access Denied</b>\n\n` +
          `Microphone access was not granted after 3 attempts. Speaking practice requires a working microphone so your partner can hear you.\n\n` +
          `💡 <i>Please allow microphone permissions in your browser / Telegram settings before starting your next session.</i>`,
        { parse_mode: 'HTML' }
      ),
      bot.api.sendMessage(
        partnerTgId,
        `⚠️ <b>Call Disconnected</b>\n\n` +
          `Your practice partner was unable to grant microphone permissions. No call limits were consumed for this session.`,
        { parse_mode: 'HTML' }
      ),
    ]);
    return;
  }

  // 3. Purge any ephemeral direct-call Telegram join messages
  if (bot && sessionId) {
    await cleanupDirectCallMessages(bot, sessionId).catch(() => undefined);
  }

  // 4. Post-call review cards if call lasted at least 5 seconds
  if (durationSeconds >= 5) {
    const isUserARecorder = Boolean(recordingUrl && retentionDaysA && retentionDaysA > 0);
    const isUserBRecorder = Boolean(recordingUrl && retentionDaysB && retentionDaysB > 0);

    await Promise.allSettled([
      sendPostCallReviewCard(
        bot,
        userATelegramId,
        sessionId,
        userBAlias,
        durationSeconds,
        isUserARecorder ? (recordingUrl ?? undefined) : undefined,
        isUserARecorder ? (retentionDaysA ?? undefined) : undefined
      ),
      sendPostCallReviewCard(
        bot,
        userBTelegramId,
        sessionId,
        userAAlias,
        durationSeconds,
        isUserBRecorder ? (recordingUrl ?? undefined) : undefined,
        isUserBRecorder ? (retentionDaysB ?? undefined) : undefined
      ),
    ]);
  }
}

export interface EventSubscriberHandle {
  stop: () => Promise<void>;
}

export function startEventSubscriber(
  botSupplier?: Bot<MyContext> | null | (() => Bot<MyContext> | null | undefined)
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

  subscriber.subscribe('pairtalk:events', (err) => {
    if (err) {
      logger.error('Failed to subscribe to pairtalk:events', {
        service: 'eventSubscriber',
        event: 'subscriber_subscribe_error',
      }, err);
    } else {
      logger.info('Subscribed to pairtalk:events Redis channel', {
        service: 'eventSubscriber',
        event: 'subscriber_subscribed',
      });
    }
  });

  subscriber.on('message', async (channel: string, message: string) => {
    if (channel !== 'pairtalk:events') return;

    try {
      const data = JSON.parse(message);
      if (data && data.type === 'CALL_FINISHED') {
        const bot = typeof botSupplier === 'function' ? botSupplier() : botSupplier;
        await handleCallFinishedEvent(data as CallFinishedEventMessage, bot ?? undefined);
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
