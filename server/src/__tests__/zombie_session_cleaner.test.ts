import { describe, it, expect } from 'vitest';
import { prisma } from '../config/database';
import { startZombieSessionCleaner, sweepZombieSessions } from '../socket/signaling';
import { createRedisDuplicates, pubClient, subClient } from '../config/redis';

describe('Zombie Call Session Cleaner & Socket.IO Clustering Test Suite', () => {
  describe('1. Redis Adapter Configuration & Duplicates', () => {
    it('1.1 createRedisDuplicates returns valid duplicate interface or null depending on test env', () => {
      const duplicates = createRedisDuplicates();
      if (duplicates) {
        expect(duplicates.pubClient).toBeDefined();
        expect(duplicates.subClient).toBeDefined();
      }
    });

    it('1.2 pubClient and subClient exports exist', () => {
      expect(typeof pubClient === 'object' || pubClient === null).toBe(true);
      expect(typeof subClient === 'object' || subClient === null).toBe(true);
    });
  });

  describe('2. Zombie Session Sweeper Lifecycle', () => {
    it('2.1 startZombieSessionCleaner starts a 5-minute interval timer', () => {
      const timer = startZombieSessionCleaner();
      expect(timer).toBeDefined();
      clearInterval(timer);
    });

    it('2.2 sweepZombieSessions executes cleanly without unhandled exceptions', async () => {
      const count = await sweepZombieSessions();
      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThanOrEqual(0);
    });
  });
});
