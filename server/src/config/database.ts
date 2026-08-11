import { PrismaClient } from '@prisma/client';

// Polyfill BigInt to JSON conversion so express res.json() works smoothly
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

export const prisma = new PrismaClient();

export async function connectDB() {
  try {
    await prisma.$connect();
    console.log('[Database] SQLite Prisma client connected.');
  } catch (err) {
    console.error('[Database] Connection error:', err);
  }
}
