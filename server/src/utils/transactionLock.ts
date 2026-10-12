import { Prisma } from '@prisma/client';

const ALLOWED_LOCK_TABLES = new Set([
  'User',
  'CallSession',
  'StarsTransaction',
  'ManualPaymentRequest',
  'Contest',
  'IeltsTopic',
] as const);

export async function lockRow(
  tx: Prisma.TransactionClient,
  table: 'User' | 'CallSession' | 'StarsTransaction' | 'ManualPaymentRequest' | 'Contest' | 'IeltsTopic',
  id: string
): Promise<void> {
  if (!ALLOWED_LOCK_TABLES.has(table as any)) {
    throw new Error(`Invalid table identifier for row lock: ${String(table)}`);
  }
  if (process.env.NODE_ENV === 'test') return; // Unit mocks serialize transactions; integration uses actual row locks.
  await tx.$queryRaw`SELECT id FROM ${Prisma.raw(`"${table}"`)} WHERE id = ${id} FOR UPDATE`;
}
