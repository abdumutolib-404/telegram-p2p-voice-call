import type { Prisma } from '@prisma/client';
export async function lockRow(tx: Prisma.TransactionClient, table: 'User' | 'StarsTransaction' | 'ManualPaymentRequest' | 'Contest', id: string): Promise<void> {
  if (process.env.NODE_ENV === 'test') return; // Unit mocks serialize transactions; integration uses actual row locks.
  await tx.$queryRawUnsafe(`SELECT id FROM "${table}" WHERE id = $1 FOR UPDATE`, id);
}
