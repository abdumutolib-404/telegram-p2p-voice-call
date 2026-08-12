import { PrismaClient } from '@prisma/client';
import { InMemoryPrismaMock } from './inMemoryPrismaMock';

// Polyfill BigInt to JSON conversion so express res.json() works smoothly
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

export const inMemoryPrisma = new InMemoryPrismaMock() as unknown as PrismaClient;

let useRealPrisma = false;
let realPrismaClient: PrismaClient | null = null;

if (process.env.NODE_ENV !== 'test') {
  try {
    realPrismaClient = new PrismaClient();
  } catch (err) {
    console.warn('[Database] Could not instantiate PrismaClient, falling back to in-memory mock:', err);
  }
}

export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop: string | symbol) {
    if (useRealPrisma && realPrismaClient) {
      return (realPrismaClient as any)[prop];
    }
    return (inMemoryPrisma as any)[prop];
  },
});

export async function connectDB() {
  if (process.env.NODE_ENV === 'test' || !realPrismaClient) {
    useRealPrisma = false;
    console.log('[Database] Operating in in-memory database mock mode.');
    return;
  }

  try {
    await realPrismaClient.$connect();
    useRealPrisma = true;
    console.log('[Database] PostgreSQL Prisma client connected.');
  } catch (err) {
    useRealPrisma = false;
    console.warn('[Database] PostgreSQL connection failed. Falling back to in-memory database mock.');
  }
}
