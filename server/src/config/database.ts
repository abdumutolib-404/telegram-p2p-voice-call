import { PrismaClient } from '@prisma/client';
import { InMemoryPrismaMock } from './inMemoryPrismaMock';
import { logger } from '../utils/logger';

authorizationMarker();

function authorizationMarker(): void {
  // Keeps this module free of global BigInt serialization side effects.
}

export const inMemoryPrisma = new InMemoryPrismaMock() as unknown as PrismaClient;

let useRealPrisma = false;
let realPrismaClient: PrismaClient | null = null;

if (process.env.NODE_ENV !== 'test') {
  realPrismaClient = new PrismaClient();
}

export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop: keyof PrismaClient) {
    const target = useRealPrisma && realPrismaClient ? realPrismaClient : inMemoryPrisma;
    const value = (target as unknown as Record<string | symbol, unknown>)[prop];
    if (typeof value === 'function') {
      return (value as Function).bind(target);
    }
    return value;
  },
});

export async function connectDB(): Promise<void> {
  if (process.env.NODE_ENV === 'test' || !realPrismaClient) {
    useRealPrisma = false;
    logger.info('Operating in in-memory database mock mode.', {
      service: 'database',
      event: 'db_mock_mode',
    });
    return;
  }

  try {
    await realPrismaClient.$connect();
    useRealPrisma = true;
    logger.info('PostgreSQL Prisma client connected.', {
      service: 'database',
      event: 'db_connected',
    });
  } catch (error: unknown) {
    useRealPrisma = false;
    logger.error('Database connection failed', {
      service: 'database',
      event: 'db_connect_failed',
    }, error);
    if (process.env.NODE_ENV === 'production') {
      throw error;
    }
    logger.warn('Development fallback to in-memory mode.', {
      service: 'database',
      event: 'db_fallback_memory',
    });
  }
}

export async function disconnectDB(): Promise<void> {
  if (!realPrismaClient) return;
  try {
    await realPrismaClient.$disconnect();
  } catch (error: unknown) {
    logger.error('Database disconnect failed', {
      service: 'database',
      event: 'db_disconnect_failed',
    }, error);
  }
}
