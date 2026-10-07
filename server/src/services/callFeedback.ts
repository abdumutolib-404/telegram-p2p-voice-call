import { prisma } from '../config/database';
import { lockRow } from '../utils/transactionLock';

export type RatingResult = 'CREATED' | 'DUPLICATE' | 'MISSING_CALL' | 'UNAUTHORIZED';

/** Preserves existing feedback policy while making the duplicate check and write atomic. */
export async function saveCallQualityRating(callId: string, raterId: string, stars: number): Promise<RatingResult> {
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) throw new Error('Rating must be an integer from 1 to 5.');
  return prisma.$transaction(async tx => {
    const initial = await tx.callSession.findUnique({ where: { id: callId } });
    if (!initial) return 'MISSING_CALL';
    if (initial.userAId !== raterId && initial.userBId !== raterId) return 'UNAUTHORIZED';
    for (const id of [initial.userAId, initial.userBId].sort()) await lockRow(tx, 'User', id);
    await lockRow(tx, 'CallSession', callId);
    const call = await tx.callSession.findUnique({ where: { id: callId } });
    if (!call) return 'MISSING_CALL';
    if (call.userAId !== raterId && call.userBId !== raterId) return 'UNAUTHORIZED';
    if (await tx.callRating.findFirst({ where: { callId, raterId, reported: false } })) return 'DUPLICATE';
    await tx.callRating.create({ data: {
      callId, raterId, ratedId: call.userAId === raterId ? call.userBId : call.userAId, stars,
    } });
    return 'CREATED';
  }, { maxWait: 10000, timeout: 15000 });
}
