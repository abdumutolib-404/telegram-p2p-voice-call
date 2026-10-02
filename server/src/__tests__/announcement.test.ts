import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  executeAnnouncementBroadcast,
  isBroadcastActive,
  AnnouncementPayload,
} from '../services/announcement';
import { prisma } from '../config/database';
import { env } from '../config/env';

describe('Admin-Only Telegram Announcement System Test Suite', () => {
  let mockBotApi: any;

  beforeEach(async () => {
    mockBotApi = {
      sendMessage: vi.fn().mockResolvedValue({ message_id: 1 }),
      sendPhoto: vi.fn().mockResolvedValue({ message_id: 2 }),
      sendVideo: vi.fn().mockResolvedValue({ message_id: 3 }),
      sendAnimation: vi.fn().mockResolvedValue({ message_id: 4 }),
    };
  });

  describe('1. Recipient Eligibility & Query Filter', () => {
    it('1.1 Queries only active, non-permanently-banned, unexpired users', async () => {
      // Seed test users in DB
      const user1 = await prisma.user.create({
        data: {
          telegramId: 111111111n,
          alias: 'ActiveStudent',
          isPermanentlyBanned: false,
          isBanned: false,
        },
      });

      const bannedUser = await prisma.user.create({
        data: {
          telegramId: 222222222n,
          alias: 'BannedStudent',
          isPermanentlyBanned: true,
          isBanned: true,
        },
      });

      const payload: AnnouncementPayload = {
        type: 'text',
        text: '📢 Hello from IELTS P2P!',
      };

      const result = await executeAnnouncementBroadcast(mockBotApi, payload, env.ADMIN_TELEGRAM_IDS[0]);

      expect(result.sent).toBeGreaterThanOrEqual(1);
      expect(mockBotApi.sendMessage).toHaveBeenCalledWith(
        Number(user1.telegramId),
        '📢 Hello from IELTS P2P!',
        expect.anything()
      );
      expect(mockBotApi.sendMessage).not.toHaveBeenCalledWith(
        Number(bannedUser.telegramId),
        expect.anything(),
        expect.anything()
      );
    });

    it('1.2 Gracefully handles zero eligible recipients', async () => {
      // Mock findMany to return empty array
      const findManySpy = vi.spyOn(prisma.user, 'findMany').mockResolvedValueOnce([]);

      const result = await executeAnnouncementBroadcast(
        mockBotApi,
        { type: 'text', text: 'Empty test' },
        env.ADMIN_TELEGRAM_IDS[0]
      );

      expect(result.sent).toBe(0);
      expect(result.total).toBe(0);
      expect(mockBotApi.sendMessage).not.toHaveBeenCalled();

      findManySpy.mockRestore();
    });
  });

  describe('2. Supported Announcement Content Types', () => {
    it('2.1 Successfully broadcasts text with Unicode emojis and entities', async () => {
      const user = await prisma.user.create({
        data: {
          telegramId: 333333333n,
          alias: 'EmojiLearner',
          isPermanentlyBanned: false,
          isBanned: false,
        },
      });

      const payload: AnnouncementPayload = {
        type: 'text',
        text: '🎉 Weekly Speaking Contest is Live! 🏆 🌟',
        entities: [{ type: 'bold', offset: 0, length: 34 }],
      };

      const result = await executeAnnouncementBroadcast(mockBotApi, payload, env.ADMIN_TELEGRAM_IDS[0]);
      expect(result.sent).toBeGreaterThanOrEqual(1);
      expect(mockBotApi.sendMessage).toHaveBeenCalledWith(
        Number(user.telegramId),
        '🎉 Weekly Speaking Contest is Live! 🏆 🌟',
        expect.objectContaining({ entities: payload.entities })
      );
    });

    it('2.2 Successfully broadcasts photo announcement with caption & caption_entities', async () => {
      const user = await prisma.user.create({
        data: {
          telegramId: 444444444n,
          alias: 'PhotoLearner',
          isPermanentlyBanned: false,
          isBanned: false,
        },
      });

      const payload: AnnouncementPayload = {
        type: 'photo',
        fileId: 'photo_file_id_unique_123',
        caption: '🖼️ New speaking topics for August 2026',
        captionEntities: [{ type: 'italic', offset: 0, length: 38 }],
      };

      const result = await executeAnnouncementBroadcast(mockBotApi, payload, env.ADMIN_TELEGRAM_IDS[0]);
      expect(result.sent).toBeGreaterThanOrEqual(1);
      expect(mockBotApi.sendPhoto).toHaveBeenCalledWith(
        Number(user.telegramId),
        'photo_file_id_unique_123',
        expect.objectContaining({
          caption: '🖼️ New speaking topics for August 2026',
          caption_entities: payload.captionEntities,
        })
      );
    });

    it('2.3 Successfully broadcasts video announcement with caption', async () => {
      const user = await prisma.user.create({
        data: {
          telegramId: 555555555n,
          alias: 'VideoLearner',
          isPermanentlyBanned: false,
          isBanned: false,
        },
      });

      const payload: AnnouncementPayload = {
        type: 'video',
        fileId: 'video_file_id_sample_456',
        caption: '🎬 Pronunciation tutorial #1',
      };

      const result = await executeAnnouncementBroadcast(mockBotApi, payload, env.ADMIN_TELEGRAM_IDS[0]);
      expect(result.sent).toBeGreaterThanOrEqual(1);
      expect(mockBotApi.sendVideo).toHaveBeenCalledWith(
        Number(user.telegramId),
        'video_file_id_sample_456',
        expect.objectContaining({
          caption: '🎬 Pronunciation tutorial #1',
        })
      );
    });

    it('2.4 Successfully broadcasts GIF/Animation announcement with caption', async () => {
      const user = await prisma.user.create({
        data: {
          telegramId: 666666666n,
          alias: 'GifLearner',
          isPermanentlyBanned: false,
          isBanned: false,
        },
      });

      const payload: AnnouncementPayload = {
        type: 'animation',
        fileId: 'animation_file_id_gif_789',
        caption: '✨ Practice starts now!',
      };

      const result = await executeAnnouncementBroadcast(mockBotApi, payload, env.ADMIN_TELEGRAM_IDS[0]);
      expect(result.sent).toBeGreaterThanOrEqual(1);
      expect(mockBotApi.sendAnimation).toHaveBeenCalledWith(
        Number(user.telegramId),
        'animation_file_id_gif_789',
        expect.objectContaining({
          caption: '✨ Practice starts now!',
        })
      );
    });
  });

  describe('3. Rate Limiting, 429 Backoff & Fault Isolation', () => {
    it('3.1 Recovers from Telegram 429 rate limit using retry_after', async () => {
      const user = await prisma.user.create({
        data: {
          telegramId: 777777777n,
          alias: 'RateLimitStudent',
          isPermanentlyBanned: false,
          isBanned: false,
        },
      });

      // First call throws 429 with retry_after, second call succeeds
      mockBotApi.sendMessage
        .mockRejectedValueOnce({
          error_code: 429,
          parameters: { retry_after: 1 },
          message: '429 Too Many Requests',
        })
        .mockResolvedValue({ message_id: 99 });

      const payload: AnnouncementPayload = {
        type: 'text',
        text: 'Test message after rate limit',
      };

      const result = await executeAnnouncementBroadcast(mockBotApi, payload, env.ADMIN_TELEGRAM_IDS[0]);
      expect(result.sent).toBeGreaterThanOrEqual(1);
    });

    it('3.2 Continues broadcast when individual recipients fail permanently (blocked bot / chat not found)', async () => {
      // Mock findMany with 2 recipients
      const mockUsers = [
        { id: 'u1', telegramId: 888888881n },
        { id: 'u2', telegramId: 888888882n },
      ];
      const findManySpy = vi.spyOn(prisma.user, 'findMany').mockResolvedValueOnce(mockUsers as any);

      // u1 fails (bot blocked), u2 succeeds
      mockBotApi.sendMessage
        .mockRejectedValueOnce(new Error('403: Forbidden: bot was blocked by the user'))
        .mockResolvedValueOnce({ message_id: 100 });

      const result = await executeAnnouncementBroadcast(
        mockBotApi,
        { type: 'text', text: 'Resilience test' },
        env.ADMIN_TELEGRAM_IDS[0]
      );

      expect(result.sent).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.total).toBe(2);

      findManySpy.mockRestore();
    });
  });

  describe('4. In-Flight Single Job Lock Protection', () => {
    it('4.1 Rejects concurrent broadcasts with an informative error', async () => {
      // Mock findMany with slow resolution to simulate ongoing broadcast
      let resolveSlow: Function;
      const slowPromise = new Promise((resolve) => {
        resolveSlow = resolve;
      });

      mockBotApi.sendMessage.mockImplementation(async () => {
        await slowPromise;
        return { message_id: 1 };
      });

      // Start first broadcast (in flight)
      const firstJobPromise = executeAnnouncementBroadcast(
        mockBotApi,
        { type: 'text', text: 'First broadcast' },
        env.ADMIN_TELEGRAM_IDS[0]
      );

      expect(isBroadcastActive()).toBe(true);

      // Attempt second broadcast concurrently
      await expect(
        executeAnnouncementBroadcast(
          mockBotApi,
          { type: 'text', text: 'Second concurrent broadcast' },
          env.ADMIN_TELEGRAM_IDS[0]
        )
      ).rejects.toThrow('currently in progress');

      // Finish first broadcast
      resolveSlow!();
      await firstJobPromise;

      expect(isBroadcastActive()).toBe(false);
    });
  });

  describe('5. Bot Command Integration & /admin Easter Egg', () => {
    it('5.1 Silently ignores unauthorized /announce commands without sending any reply', async () => {
      const nonAdminId = 999999999;
      let replyMessage = '';

      const mockCtx: any = {
        from: { id: nonAdminId },
        message: { text: '/announce Test' },
        reply: async (text: string) => {
          replyMessage = text;
        },
      };

      const handlers = new Map<string, Function>();
      const mockBot: any = {
        command: (cmd: string, fn: Function) => {
          handlers.set(cmd, fn);
        },
        on: vi.fn(),
      };

      const { setupAdminCommand } = await import('../bot/commands/admin');
      setupAdminCommand(mockBot);

      const announceHandler = handlers.get('announce');
      expect(announceHandler).toBeDefined();

      await announceHandler!(mockCtx);
      expect(replyMessage).toBe('');
    });

    it('5.2 Returns exact Easter egg for /admin regardless of user role', async () => {
      const regularUserId = 555444333;
      let replyMessage = '';

      const mockCtx: any = {
        from: { id: regularUserId },
        reply: async (text: string) => {
          replyMessage = text;
        },
      };

      const handlers = new Map<string, Function>();
      const mockBot: any = {
        command: (cmd: string, fn: Function) => {
          handlers.set(cmd, fn);
        },
        on: vi.fn(),
      };

      const { setupAdminCommand } = await import('../bot/commands/admin');
      setupAdminCommand(mockBot);

      const adminHandler = handlers.get('admin');
      expect(adminHandler).toBeDefined();

      await adminHandler!(mockCtx);
      expect(replyMessage).toBe("Aha! Got you, lil hacker😈\n📞Calling 911...");
    });

    it('5.3 Supports standalone /announce and /cancel state machine', async () => {
      const adminId = Number(env.ADMIN_TELEGRAM_IDS[0]);
      let repliedText = '';

      const mockCtx: any = {
        from: { id: adminId },
        message: { text: '/announce' },
        session: { step: 'idle' },
        reply: async (text: string) => {
          repliedText = text;
        },
      };

      const handlers = new Map<string, Function>();
      const mockBot: any = {
        command: (cmd: string, fn: Function) => {
          handlers.set(cmd, fn);
        },
        on: vi.fn(),
      };

      const { setupAdminCommand } = await import('../bot/commands/admin');
      setupAdminCommand(mockBot);

      const announceHandler = handlers.get('announce');
      await announceHandler!(mockCtx);

      expect(mockCtx.session.step).toBe('awaiting_announcement');
      expect(repliedText).toContain('Announcement Broadcast Mode');

      // Now test /cancel
      const cancelHandler = handlers.get('cancel');
      let cancelReplied = '';
      const cancelCtx: any = {
        session: mockCtx.session,
        reply: async (text: string) => {
          cancelReplied = text;
        },
      };

      await cancelHandler!(cancelCtx, () => {});
      expect(mockCtx.session.step).toBe('idle');
      expect(cancelReplied).toContain('Announcement broadcast cancelled');
    });
  });
});
