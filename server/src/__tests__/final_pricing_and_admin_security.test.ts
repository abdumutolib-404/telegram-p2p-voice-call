import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getPlansConfig,
  getEffectiveEntitlement,
  formatPriceDisplay,
  isDowngrade,
  PLAN_WEIGHTS,
} from '../services/plan';
import { env } from '../config/env';
import { setupAdminCommand } from '../bot/commands/admin';

describe('Final Pricing Migration & Admin Command Privacy Test Suite', () => {
  let handlers: Map<string, Function>;
  let mockBot: any;

  beforeEach(() => {
    handlers = new Map();
    mockBot = {
      command: (cmd: string, fn: Function) => {
        handlers.set(cmd, fn);
      },
      on: vi.fn(),
    };
    setupAdminCommand(mockBot);
  });

  describe('1. Authoritative Plan Specifications & Pricing Consistency', () => {
    it('1.1 FREE tier has exact canonical limits and zero pricing', () => {
      const config = getPlansConfig().FREE;
      expect(config.uzsPrice).toBe(0);
      expect(config.starsPrice).toBe(0);
      expect(config.dailyLimit).toBe(3);
      expect(config.callsLimit).toBe(3);
      expect(config.maxDuration).toBe(15);
      expect(config.recordingLimit).toBe(1);
      expect(config.retentionDays).toBe(1);
    });

    it('1.2 PLUS tier has exact canonical limits and 15,000 UZS / 99 XTR price', () => {
      const config = getPlansConfig().PLUS;
      expect(config.uzsPrice).toBe(15000);
      expect(config.starsPrice).toBe(99);
      expect(config.dailyLimit).toBe(10);
      expect(config.callsLimit).toBe(10);
      expect(config.maxDuration).toBe(30);
      expect(config.recordingLimit).toBe(3);
      expect(config.retentionDays).toBe(7);
    });

    it('1.3 PRO tier has exact canonical limits and 55,000 UZS / 349 XTR price', () => {
      const config = getPlansConfig().PRO;
      expect(config.uzsPrice).toBe(55000);
      expect(config.starsPrice).toBe(349);
      expect(config.dailyLimit).toBe(25);
      expect(config.callsLimit).toBe(25);
      expect(config.maxDuration).toBe(60);
      expect(config.recordingLimit).toBe(7);
      expect(config.retentionDays).toBe(30);
    });

    it('1.4 BOSS tier has exact canonical limits and 149,000 UZS / 899 XTR price', () => {
      const config = getPlansConfig().BOSS;
      expect(config.uzsPrice).toBe(149000);
      expect(config.starsPrice).toBe(899);
      expect(config.dailyLimit).toBe(50);
      expect(config.callsLimit).toBe(50);
      expect(config.maxDuration).toBe(90);
      expect(config.recordingLimit).toBe(15);
      expect(config.retentionDays).toBe(90);
    });

    it('1.5 Price display formatter generates accurate bilingual labels', () => {
      expect(formatPriceDisplay('PLUS')).toBe('⭐ 99 Stars / 💳 15,000 UZS');
      expect(formatPriceDisplay('PRO')).toBe('⭐ 349 Stars / 💳 55,000 UZS');
      expect(formatPriceDisplay('BOSS')).toBe('⭐ 899 Stars / 💳 149,000 UZS');
    });
  });

  describe('2. Admin Command Stealth & Non-Admin Privacy Hardening', () => {
    it('2.1 Non-admin sending /announce produces ZERO response (silent ignore)', async () => {
      let replyCalled = false;
      const mockCtx: any = {
        from: { id: 987654321, username: 'imposter_admin' },
        message: { text: '/announce Hello' },
        reply: async () => {
          replyCalled = true;
        },
      };

      const handler = handlers.get('announce');
      expect(handler).toBeDefined();
      await handler!(mockCtx);
      expect(replyCalled).toBe(false);
    });

    it('2.2 Non-admin sending /setplan produces ZERO response (silent ignore)', async () => {
      let replyCalled = false;
      const mockCtx: any = {
        from: { id: 987654321 },
        message: { text: '/setplan 11111 BOSS' },
        reply: async () => {
          replyCalled = true;
        },
      };

      const handler = handlers.get('setplan');
      expect(handler).toBeDefined();
      await handler!(mockCtx);
      expect(replyCalled).toBe(false);
    });

    it('2.3 Non-admin sending /resetlimit produces ZERO response (silent ignore)', async () => {
      let replyCalled = false;
      const mockCtx: any = {
        from: { id: 987654321 },
        message: { text: '/resetlimit 11111' },
        reply: async () => {
          replyCalled = true;
        },
      };

      const handler = handlers.get('resetlimit');
      expect(handler).toBeDefined();
      await handler!(mockCtx);
      expect(replyCalled).toBe(false);
    });

    it('2.4 Non-admin sending /user produces ZERO response (silent ignore)', async () => {
      let replyCalled = false;
      const mockCtx: any = {
        from: { id: 987654321 },
        message: { text: '/user 11111' },
        reply: async () => {
          replyCalled = true;
        },
      };

      const handler = handlers.get('user');
      expect(handler).toBeDefined();
      await handler!(mockCtx);
      expect(replyCalled).toBe(false);
    });

    it('2.5 Non-admin sending /setretention produces ZERO response (silent ignore)', async () => {
      let replyCalled = false;
      const mockCtx: any = {
        from: { id: 987654321 },
        message: { text: '/setretention 11111 60' },
        reply: async () => {
          replyCalled = true;
        },
      };

      const handler = handlers.get('setretention');
      expect(handler).toBeDefined();
      await handler!(mockCtx);
      expect(replyCalled).toBe(false);
    });

    it('2.6 /admin is public harmless Easter egg and responds to all users identically', async () => {
      let nonAdminReply = '';
      const nonAdminCtx: any = {
        from: { id: 88888888 },
        reply: async (text: string) => {
          nonAdminReply = text;
        },
      };

      let adminReply = '';
      const adminCtx: any = {
        from: { id: Number(env.ADMIN_TELEGRAM_IDS[0]) },
        reply: async (text: string) => {
          adminReply = text;
        },
      };

      const handler = handlers.get('admin');
      expect(handler).toBeDefined();

      await handler!(nonAdminCtx);
      await handler!(adminCtx);

      expect(nonAdminReply).toBe("Aha! Got you, lil hacker😈\n📞Calling 911...");
      expect(adminReply).toBe("Aha! Got you, lil hacker😈\n📞Calling 911...");
    });
  });

  describe('3. Subscription Hierarchy & Anti-Downgrade Safety', () => {
    it('3.1 Enforces strict hierarchy order: FREE (0) < PLUS (1) < PRO (2) < BOSS (3)', () => {
      expect(PLAN_WEIGHTS.FREE).toBe(0);
      expect(PLAN_WEIGHTS.PLUS).toBe(1);
      expect(PLAN_WEIGHTS.PRO).toBe(2);
      expect(PLAN_WEIGHTS.BOSS).toBe(3);

      expect(isDowngrade('BOSS', 'PRO')).toBe(true);
      expect(isDowngrade('BOSS', 'PLUS')).toBe(true);
      expect(isDowngrade('BOSS', 'FREE')).toBe(true);
      expect(isDowngrade('PRO', 'PLUS')).toBe(true);
      expect(isDowngrade('PRO', 'FREE')).toBe(true);
      expect(isDowngrade('PLUS', 'FREE')).toBe(true);

      expect(isDowngrade('FREE', 'PLUS')).toBe(false);
      expect(isDowngrade('PLUS', 'PRO')).toBe(false);
      expect(isDowngrade('PRO', 'BOSS')).toBe(false);
    });
  });
});
