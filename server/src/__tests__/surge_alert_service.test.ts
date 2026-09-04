import { describe, it, expect, beforeEach, vi } from 'vitest';
import { prisma } from '../config/database';
import { getRedis } from '../config/redis';
import { surgeAlertService, SURGE_CONFIG } from '../services/surgeAlertService';

describe('Peak-Hour Surge Alert Service Test Suite', () => {
  beforeEach(async () => {
    const redis = getRedis();
    await redis.del('pairtalk:surge_alert:global_last_sent');
    await redis.del('pairtalk:surge:scheduler:lock');
  });

  describe('1. Quorum & Concurrent Count Calculation', () => {
    it('1.1 computes active callers and queued users cleanly', async () => {
      const counts = await surgeAlertService.getActiveConcurrentCount();
      expect(typeof counts.callersCount).toBe('number');
      expect(typeof counts.queuedCount).toBe('number');
      expect(typeof counts.totalCount).toBe('number');
      expect(counts.totalCount).toBe(counts.callersCount + counts.queuedCount);
    });

    it('1.2 correctly identifies when activity is below surge threshold', async () => {
      const mockBot = {
        api: {
          sendMessage: vi.fn(),
        },
      } as any;

      // With low activity in test database, should not trigger
      const result = await surgeAlertService.checkAndTriggerSurgeAlert(mockBot);
      expect(result.triggered).toBe(false);
      expect(result.reason).toContain('below surge threshold');
      expect(mockBot.api.sendMessage).not.toHaveBeenCalled();
    });
  });

  describe('2. Anti-Spam Cooldown & Filter Guarantees', () => {
    it('2.1 enforces global cooldown when key is set in Redis', async () => {
      const redis = getRedis();
      await redis.set('pairtalk:surge_alert:global_last_sent', new Date().toISOString(), 'EX', 3600);

      const mockBot = { api: { sendMessage: vi.fn() } } as any;
      const result = await surgeAlertService.checkAndTriggerSurgeAlert(mockBot);

      expect(result.triggered).toBe(false);
      expect(result.reason).toBe('Global surge cooldown active');
    });

    it('2.2 aborts cleanly when bot instance is unavailable', async () => {
      const result = await surgeAlertService.checkAndTriggerSurgeAlert(null);
      expect(result.triggered).toBe(false);
      expect(result.reason).toBe('Bot instance unavailable');
    });
  });

  describe('3. Scheduler Lifecycle', () => {
    it('3.1 starts and stops scheduler cleanly without unhandled exceptions', () => {
      const mockBot = { api: { sendMessage: vi.fn() } } as any;
      surgeAlertService.startScheduler(() => mockBot, 60000);
      surgeAlertService.stopScheduler();
      expect(true).toBe(true);
    });
  });
});
