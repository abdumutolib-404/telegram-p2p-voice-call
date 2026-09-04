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

function getDatabaseUrlWithPoolParams(): string | undefined {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return undefined;
  try {
    const url = new URL(dbUrl);
    if (!url.searchParams.has('connection_limit')) {
      url.searchParams.set('connection_limit', '20');
    }
    if (!url.searchParams.has('pool_timeout')) {
      url.searchParams.set('pool_timeout', '10');
    }
    const withPool = url.toString();
    process.env.DATABASE_URL = withPool;
    return withPool;
  } catch {
    const sep = dbUrl.includes('?') ? '&' : '?';
    let res = dbUrl;
    if (!res.includes('connection_limit=')) res += `${sep}connection_limit=20`;
    if (!res.includes('pool_timeout=')) res += `&pool_timeout=10`;
    process.env.DATABASE_URL = res;
    return res;
  }
}

if (process.env.NODE_ENV !== 'test') {
  const dbUrl = getDatabaseUrlWithPoolParams();
  realPrismaClient = new PrismaClient(
    dbUrl
      ? {
          datasources: {
            db: {
              url: dbUrl,
            },
          },
        }
      : undefined
  );
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
