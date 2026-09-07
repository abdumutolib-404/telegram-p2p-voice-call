import { Bot } from 'grammy';
import { getRedis } from '../config/redis';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';

export interface DirectCallMessageRef {
  chatId: string;
  messageId: number;
  role: string;
}

const directCallMessagesFallback = new Map<string, DirectCallMessageRef[]>();

/**
 * Register an ephemeral direct-call message to be cleaned up when the call terminates.
 */
export async function trackDirectCallMessage(
  sessionId: string,
  ref: DirectCallMessageRef
): Promise<void> {
  const redis = getRedis();
  try {
    const key = `direct_call:messages:${sessionId}`;
    const existingRaw = await redis.get(key);
    const list: DirectCallMessageRef[] = existingRaw ? JSON.parse(existingRaw) : [];
    list.push(ref);
    await redis.set(key, JSON.stringify(list), 'EX', 7200); // 2 hours TTL
  } catch {
    const list = directCallMessagesFallback.get(sessionId) || [];
    list.push(ref);
    directCallMessagesFallback.set(sessionId, list);
  }
}

/**
 * Retrieve all tracked direct call messages for a session.
 */
export async function getDirectCallMessages(sessionId: string): Promise<DirectCallMessageRef[]> {
  const redis = getRedis();
  try {
    const key = `direct_call:messages:${sessionId}`;
    const raw = await redis.get(key);
    if (raw) return JSON.parse(raw);
  } catch {
    return directCallMessagesFallback.get(sessionId) || [];
  }
  return directCallMessagesFallback.get(sessionId) || [];
}

/**
 * Delete a specific Telegram message or remove a tracked message role.
 */
export async function deleteDirectCallMessage(
  arg1: any,
  arg2: any,
  arg3?: any
): Promise<void> {
  if (typeof arg1 === 'string' && typeof arg2 === 'string') {
    // (sessionId, role) signature
    const sessionId = arg1;
    const role = arg2;
    const key = `direct_call:messages:${sessionId}`;
    const redis = getRedis();
    let list = await getDirectCallMessages(sessionId);
    list = list.filter((m) => m.role !== role);
    try {
      await redis.set(key, JSON.stringify(list), 'EX', 7200);
    } catch {
      directCallMessagesFallback.set(sessionId, list);
    }
    return;
  }

  // (bot, chatId, messageId) signature
  const bot = arg1 as Bot<any> | null | undefined;
  const chatId = String(arg2);
  const messageId = Number(arg3);

  if (!bot || !bot.api) return;
  try {
    await bot.api.deleteMessage(chatId, messageId);
  } catch {
    try {
      await bot.api.editMessageReplyMarkup(chatId, messageId, {
        reply_markup: { inline_keyboard: [] },
      });
    } catch {
      // Benign ignore if message is already removed
    }
  }
}

/**
 * Clean up all direct-call messages associated with a call session or room name.
 * Accepts both (bot, identifier) and (identifier, bot) argument orders.
 */
export async function cleanupDirectCallMessages(
  arg1: Bot<any> | string | null | undefined,
  arg2?: string | Bot<any> | null | undefined
): Promise<void> {
  let bot: Bot<any> | null | undefined;
  let identifier: string | undefined;

  if (typeof arg1 === 'string') {
    identifier = arg1;
    bot = arg2 as Bot<any> | null | undefined;
  } else {
    bot = arg1 as Bot<any> | null | undefined;
    identifier = typeof arg2 === 'string' ? arg2 : undefined;
  }

  if (!identifier) return;

  const redis = getRedis();
  const keysToTry = [`direct_call:messages:${identifier}`];

  // If identifier is a room name, resolve its database session ID
  try {
    const session = await prisma.callSession.findFirst({
      where: { OR: [{ id: identifier }, { roomName: identifier }] },
      select: { id: true, roomName: true },
    });
    if (session) {
      if (session.id && !keysToTry.includes(`direct_call:messages:${session.id}`)) {
        keysToTry.push(`direct_call:messages:${session.id}`);
      }
      if (session.roomName && !keysToTry.includes(`direct_call:messages:${session.roomName}`)) {
        keysToTry.push(`direct_call:messages:${session.roomName}`);
      }
    }
  } catch {
    // Database lookup failure falls back to direct key check
  }

  const allMessages: DirectCallMessageRef[] = [];

  for (const key of keysToTry) {
    try {
      const raw = await redis.get(key);
      if (raw) {
        const parsed: DirectCallMessageRef[] = JSON.parse(raw);
        allMessages.push(...parsed);
      }
      await redis.del(key);
    } catch {
      const fallbackKey = key.replace('direct_call:messages:', '');
      const memList = directCallMessagesFallback.get(fallbackKey);
      if (memList) {
        allMessages.push(...memList);
        directCallMessagesFallback.delete(fallbackKey);
      }
    }

    const fallbackKey = key.replace('direct_call:messages:', '');
    const memList = directCallMessagesFallback.get(fallbackKey);
    if (memList) {
      allMessages.push(...memList);
      directCallMessagesFallback.delete(fallbackKey);
    }
  }

  if (!bot || allMessages.length === 0) return;

  logger.info('Cleaning up ephemeral direct call messages', {
    service: 'bot',
    event: 'direct_call_messages_cleanup',
    identifier,
    count: allMessages.length,
  });

  for (const { chatId, messageId } of allMessages) {
    await deleteDirectCallMessage(bot, chatId, messageId);
  }
}
