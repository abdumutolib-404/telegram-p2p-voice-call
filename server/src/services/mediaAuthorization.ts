import { prisma } from '../config/database';
import { lockRow } from '../utils/transactionLock';

/** Commit the media gate before granting any provider subscription permission. */
export async function registerReadyParticipant(callId: string, userId: string): Promise<boolean> {
  return prisma.$transaction(async tx => {
    await lockRow(tx, 'CallSession', callId);
    const session = await tx.callSession.findUnique({ where: { id: callId } });
    if (!session || session.status !== 'ACTIVE' || ![session.userAId, session.userBId].includes(userId)) return false;
    const ready = new Set(session.readyParticipantIds ?? []);
    ready.add(userId);
    const authorized = Boolean(session.mediaAuthorizedAt) || (ready.has(session.userAId) && ready.has(session.userBId));
    await tx.callSession.update({ where: { id: callId }, data: {
      readyParticipantIds: [...ready].sort(),
      ...(authorized && !session.mediaAuthorizedAt ? { mediaAuthorizedAt: new Date() } : {}),
    } });
    return authorized;
  });
}
