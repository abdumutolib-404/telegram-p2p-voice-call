import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateOrderNumber,
  initializeOrderSequence,
  resetOrderSequenceForTesting,
  getMaxOrderNumberFromDb,
  createManualPaymentRequest,
} from '../services/plan';
import { getRedis } from '../config/redis';
import { prisma } from '../config/database';

describe('Monotonic Order ID Counter & Collision Resistance', () => {
  beforeEach(async () => {
    resetOrderSequenceForTesting();
    try {
      const redis = getRedis();
      await redis.del('counter:order_sequence');
    } catch {}
    try {
      await prisma.manualPaymentRequest.deleteMany();
      await prisma.starsTransaction.deleteMany();
      await prisma.user.deleteMany();
    } catch {}
  });

  it('generates strictly formatted monotonic sequential IDs (A1, A2, A3...)', async () => {
    const id1 = await generateOrderNumber('A');
    const id2 = await generateOrderNumber('A');
    const id3 = await generateOrderNumber('A');

    expect(id1).toMatch(/^A\d+$/);
    expect(id2).toMatch(/^A\d+$/);
    expect(id3).toMatch(/^A\d+$/);

    const num1 = parseInt(id1.slice(1), 10);
    const num2 = parseInt(id2.slice(1), 10);
    const num3 = parseInt(id3.slice(1), 10);

    expect(num2).toBe(num1 + 1);
    expect(num3).toBe(num2 + 1);
  });

  it('guarantees 100% uniqueness without collisions under concurrent generation', async () => {
    const CONCURRENCY = 200;
    const promises: Promise<string>[] = [];

    for (let i = 0; i < CONCURRENCY; i++) {
      promises.push(generateOrderNumber('A'));
    }

    const results = await Promise.all(promises);

    expect(results).toHaveLength(CONCURRENCY);

    // Verify all IDs are strictly formatted
    for (const id of results) {
      expect(id).toMatch(/^A\d+$/);
    }

    // Verify absolute collision-free uniqueness
    const uniqueIds = new Set(results);
    expect(uniqueIds.size).toBe(CONCURRENCY);

    // Verify numbers form an unbroken monotonic sequence
    const numbers = results.map((id) => parseInt(id.slice(1), 10)).sort((a, b) => a - b);
    const minNum = numbers[0];
    for (let i = 0; i < numbers.length; i++) {
      expect(numbers[i]).toBe(minNum + i);
    }
  });

  it('initializes sequence from existing DB records to avoid collision with historical orders', async () => {
    // Seed user and historical manual orders
    const user = await prisma.user.create({
      data: {
        telegramId: BigInt(77712345),
        alias: 'HistoricalTester',
        plan: 'FREE',
      },
    });

    await prisma.manualPaymentRequest.create({
      data: {
        orderNumber: 'A499',
        userId: user.id,
        telegramId: user.telegramId,
        alias: user.alias,
        plan: 'PLUS',
        uzsAmount: 15000,
        status: 'APPROVED',
      },
    });

    await prisma.starsTransaction.create({
      data: {
        orderNumber: 'A500',
        userId: user.id,
        telegramPaymentId: 'tg_star_hist_1',
        starsAmount: 50,
        planTier: 'PLUS',
        status: 'PAID',
      },
    });

    const maxFromDb = await getMaxOrderNumberFromDb();
    expect(maxFromDb).toBe(500);

    // Re-initialize sequence
    resetOrderSequenceForTesting();
    const redis = getRedis();
    await redis.del('counter:order_sequence');

    await initializeOrderSequence();

    // Next generated order should be strictly > 500 (i.e. A501)
    const nextOrder = await generateOrderNumber('A');
    expect(nextOrder).toBe('A501');

    const subsequentOrder = await generateOrderNumber('A');
    expect(subsequentOrder).toBe('A502');
  });

  it('createManualPaymentRequest generates authoritative unique orderNumber', async () => {
    const user = await prisma.user.create({
      data: {
        telegramId: BigInt(99988877),
        alias: 'PaymentRequestTester',
        plan: 'FREE',
      },
    });

    const res = await createManualPaymentRequest({
      userId: user.id,
      telegramId: user.telegramId,
      alias: user.alias,
      plan: 'PLUS',
      uzsAmount: 15000,
    });

    expect(res.success).toBe(true);
    expect(res.request).toBeDefined();
    expect(res.request!.orderNumber).toMatch(/^A\d+$/);
  });

  it('safely falls back to monotonic sequence when Redis throws', async () => {
    resetOrderSequenceForTesting();

    const redis = getRedis();
    const originalIncr = redis.incr;

    try {
      redis.incr = async () => {
        throw new Error('Redis connection lost');
      };

      const fallbackId1 = await generateOrderNumber('A');
      const fallbackId2 = await generateOrderNumber('A');
      const fallbackId3 = await generateOrderNumber('A');

      expect(fallbackId1).toMatch(/^A\d+$/);
      expect(fallbackId2).toMatch(/^A\d+$/);
      expect(fallbackId3).toMatch(/^A\d+$/);

      const num1 = parseInt(fallbackId1.slice(1), 10);
      const num2 = parseInt(fallbackId2.slice(1), 10);
      const num3 = parseInt(fallbackId3.slice(1), 10);

      expect(num2).toBe(num1 + 1);
      expect(num3).toBe(num2 + 1);
    } finally {
      redis.incr = originalIncr;
      resetOrderSequenceForTesting();
    }
  });

  it('guarantees 100% uniqueness without collisions under concurrent generation in fallback mode', async () => {
    resetOrderSequenceForTesting();

    const redis = getRedis();
    const originalIncr = redis.incr;

    try {
      redis.incr = async () => {
        throw new Error('Redis connection lost');
      };

      const CONCURRENCY = 200;
      const promises: Promise<string>[] = [];

      for (let i = 0; i < CONCURRENCY; i++) {
        promises.push(generateOrderNumber('A'));
      }

      const results = await Promise.all(promises);

      expect(results).toHaveLength(CONCURRENCY);

      for (const id of results) {
        expect(id).toMatch(/^A\d+$/);
      }

      const uniqueIds = new Set(results);
      expect(uniqueIds.size).toBe(CONCURRENCY);

      const numbers = results.map((id) => parseInt(id.slice(1), 10)).sort((a, b) => a - b);
      const minNum = numbers[0];
      for (let i = 0; i < numbers.length; i++) {
        expect(numbers[i]).toBe(minNum + i);
      }
    } finally {
      redis.incr = originalIncr;
      resetOrderSequenceForTesting();
    }
  });
});
