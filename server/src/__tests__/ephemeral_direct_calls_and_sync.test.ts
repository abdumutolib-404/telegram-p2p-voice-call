import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  trackDirectCallMessage,
  getDirectCallMessages,
  deleteDirectCallMessage,
  cleanupDirectCallMessages,
} from '../services/directCallMessages';
import {
  scheduleConnectionHandshakeTimer,
  clearConnectionHandshakeTimer,
  setRoomDurationLimit,
} from '../socket/signaling';
import { getRedis } from '../config/redis';

describe('Ephemeral Direct Call Lifecycles & Synchronization Test Suite', () => {
  const sessionId = 'test-session-uuid-1234';
  const roomName = 'room-sync-test-9999';

  beforeEach(async () => {
    const redis = getRedis();
    await redis.del(`direct_call:messages:${sessionId}`);
    clearConnectionHandshakeTimer(roomName);
  });

  afterEach(async () => {
    const redis = getRedis();
    await redis.del(`direct_call:messages:${sessionId}`);
    clearConnectionHandshakeTimer(roomName);
  });

  describe('1. Ephemeral Direct Call Messages Lifecycle', () => {
    it('1.1 Tracks direct call messages and persists them in Redis with TTL', async () => {
      await trackDirectCallMessage(sessionId, {
        chatId: '111111',
        messageId: 101,
        role: 'caller_request',
      });

      await trackDirectCallMessage(sessionId, {
        chatId: '222222',
        messageId: 102,
        role: 'callee_invite',
      });

      const messages = await getDirectCallMessages(sessionId);
      expect(messages).toHaveLength(2);
      expect(messages).toEqual(
        expect.arrayContaining([
          { chatId: '111111', messageId: 101, role: 'caller_request' },
          { chatId: '222222', messageId: 102, role: 'callee_invite' },
        ])
      );
    });

    it('1.2 Deletes individual role message from tracked set', async () => {
      await trackDirectCallMessage(sessionId, {
        chatId: '111111',
        messageId: 101,
        role: 'caller_request',
      });
      await trackDirectCallMessage(sessionId, {
        chatId: '222222',
        messageId: 102,
        role: 'callee_invite',
      });

      await deleteDirectCallMessage(sessionId, 'callee_invite');
      const messages = await getDirectCallMessages(sessionId);
      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe('caller_request');
    });

    it('1.3 Purges all tracked Telegram messages and cleans up Redis key on call end', async () => {
      await trackDirectCallMessage(sessionId, {
        chatId: '111111',
        messageId: 101,
        role: 'caller_join',
      });
      await trackDirectCallMessage(sessionId, {
        chatId: '222222',
        messageId: 102,
        role: 'callee_join',
      });

      const deleteMessageMock = vi.fn().mockResolvedValue(true);
      const mockBot = {
        api: {
          deleteMessage: deleteMessageMock,
          editMessageReplyMarkup: vi.fn().mockResolvedValue(true),
        },
      };

      await cleanupDirectCallMessages(sessionId, mockBot as any);

      expect(deleteMessageMock).toHaveBeenCalledTimes(2);
      expect(deleteMessageMock).toHaveBeenCalledWith('111111', 101);
      expect(deleteMessageMock).toHaveBeenCalledWith('222222', 102);

      const remaining = await getDirectCallMessages(sessionId);
      expect(remaining).toHaveLength(0);
    });

    it('1.4 Falls back to stripping reply markup if Telegram message cannot be deleted', async () => {
      await trackDirectCallMessage(sessionId, {
        chatId: '111111',
        messageId: 101,
        role: 'caller_join',
      });

      const deleteMessageMock = vi.fn().mockRejectedValue(new Error('message can\'t be deleted'));
      const editMarkupMock = vi.fn().mockResolvedValue(true);
      const mockBot = {
        api: {
          deleteMessage: deleteMessageMock,
          editMessageReplyMarkup: editMarkupMock,
        },
      };

      await cleanupDirectCallMessages(sessionId, mockBot as any);

      expect(deleteMessageMock).toHaveBeenCalledWith('111111', 101);
      expect(editMarkupMock).toHaveBeenCalledWith('111111', 101, {
        reply_markup: { inline_keyboard: [] },
      });
    });
  });

  describe('2. Connection Handshake & Synchronized Call Timer', () => {
    it('2.1 Schedules and clears connection handshake timer without error', () => {
      const timer = scheduleConnectionHandshakeTimer(roomName, 90);
      expect(timer).toBeDefined();

      clearConnectionHandshakeTimer(roomName);
      // Calling clear again should be benign
      clearConnectionHandshakeTimer(roomName);
    });

    it('2.2 Sets room duration limit cleanly', () => {
      expect(() => setRoomDurationLimit(roomName, 900)).not.toThrow();
    });
  });
});
