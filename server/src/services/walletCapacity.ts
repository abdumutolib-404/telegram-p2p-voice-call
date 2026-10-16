import type { Prisma } from '@prisma/client';

/** Caller holds the User row lock. Keep space for pending purchases and every
 * reversible debit, so a later payment or failed-session refund cannot overflow. */
export async function assertWalletHeadroom(
  tx: Prisma.TransactionClient,
  user: { id: string; callCredits: number; recordingCredits: number; storageCredits: number },
  add: { calls: number; recordings: number; storage: number },
) {
  const rows = await tx.$queryRaw<{ calls: string; recordings: string; storage: string }[]>`
    SELECT
      (COALESCE(SUM(calls),0) + COALESCE((SELECT SUM(quantity) FROM "CreditUsage" WHERE "userId"=${user.id} AND kind='CALL' AND status='RESERVED'),0))::text AS calls,
      (COALESCE(SUM(recordings),0) + COALESCE((SELECT SUM(quantity) FROM "CreditUsage" WHERE "userId"=${user.id} AND kind='RECORDING' AND status='RESERVED'),0))::text AS recordings,
      (COALESCE(SUM(storage),0) + COALESCE((SELECT SUM(quantity) FROM "CreditUsage" WHERE "userId"=${user.id} AND kind='STORAGE' AND status='RESERVED'),0))::text AS storage
    FROM "CreditOrder" WHERE "userId"=${user.id} AND
      (status='REFUND_PENDING' OR (status='PENDING' AND ("authorizedAt" IS NOT NULL OR "expiresAt">NOW())))`;
  const held = rows[0] ?? { calls: '0', recordings: '0', storage: '0' };
  const totals = [
    BigInt(user.callCredits) + BigInt(held.calls) + BigInt(add.calls),
    BigInt(user.recordingCredits) + BigInt(held.recordings) + BigInt(add.recordings),
    BigInt(user.storageCredits) + BigInt(held.storage) + BigInt(add.storage),
  ];
  if (totals.some(total => total > 2147483647n))
    throw new Error('Your available balance and pending purchases exceed the wallet range. Use existing practice or cancel unpaid checkouts before buying more.');
}
