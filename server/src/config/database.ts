import { PrismaClient } from '@prisma/client';
import { InMemoryPrismaMock } from './inMemoryPrismaMock';
import { logger } from '../utils/logger';

authorizationMarker();

function authorizationMarker(): void {
  // Keeps this module free of global BigInt serialization side effects.
}

export const inMemoryPrisma = new InMemoryPrismaMock() as unknown as PrismaClient;

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
    // Mock storage is an explicit test-only dependency, never an outage fallback.
    const target = process.env.NODE_ENV === 'test' ? inMemoryPrisma : realPrismaClient;
    if (!target) throw new Error('Persistent database is not configured');
    const value = (target as unknown as Record<string | symbol, unknown>)[prop];
    if (typeof value === 'function') {
      return (value as Function).bind(target);
    }
    return value;
  },
});

export async function connectDB(): Promise<void> {
  if (process.env.NODE_ENV === 'test') {
    logger.info('Operating in in-memory database mock mode.', {
      service: 'database',
      event: 'db_mock_mode',
    });
    return;
  }
  let stage: 'configuration' | 'connection' | 'schema' = 'configuration';
  try {
    if (!realPrismaClient || !process.env.DATABASE_URL) throw new Error('DATABASE_URL is required outside tests');
    stage = 'connection';
    await realPrismaClient.$connect();
    stage = 'schema';
    await Promise.all([
      realPrismaClient.user.findFirst({ select: { id: true } }),
      realPrismaClient.manualPaymentRequest.findFirst({ select: { id: true } }),
      realPrismaClient.auditLog.findFirst({ select: { id: true } }),
      realPrismaClient.notificationJob.findFirst({ select: { id: true } }),
      realPrismaClient.postCallJob.findFirst({ select: { callId: true } }),
    ]);
    logger.info('PostgreSQL Prisma client connected.', {
      service: 'database',
      event: 'db_connected',
    });

  } catch (error: unknown) {
    // Hosted log viewers often display only the message, hiding structured error
    // attributes. Include a validated Prisma code and static advice, never a URL.
    const details = error && typeof error === 'object'
      ? error as { code?: unknown; errorCode?: unknown } : {};
    const prismaCode = [details.code, details.errorCode].find(
      (value): value is string => typeof value === 'string' && /^P\d{4}$/.test(value)
    );
    const advice: Record<string, string> = {
      P1000: 'Database authentication failed; verify the backend DATABASE_URL credentials.',
      P1001: 'Database is unreachable; verify the backend DATABASE_URL and database network access.',
      P1002: 'Database connection timed out; check database availability and network access.',
      P1003: 'The configured database does not exist; verify the database name in DATABASE_URL.',
      P1010: 'Database access denied; verify the database user permissions.',
      P1011: 'Database TLS connection failed; use the database provider connection settings.',
      P1013: 'Database connection string is invalid; verify the provider DATABASE_URL.',
      P2021: 'A required table is missing; verify that npm run db:deploy succeeded for this database.',
      P2022: 'A required column is missing; verify that npm run db:deploy succeeded for this database.',
    };
    const hint = stage === 'configuration' ? 'DATABASE_URL is required outside tests.'
      : (prismaCode && advice[prismaCode]) || 'Expand the structured error.message for details.';
    logger.error(`Database ${stage} readiness failed${prismaCode ? ` [${prismaCode}]` : ''}: ${hint}`, {
      service: 'database',
      event: 'db_connect_failed',
      stage,
      prismaErrorCode: prismaCode,
    }, error);
    await realPrismaClient?.$disconnect().catch(() => undefined);
    throw error;
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
