import { prisma } from '../config/database';
import { lockRow } from '../utils/transactionLock';
import { isAccountRestricted } from './accountRestriction';

/** Commit the media gate before granting any provider subscription permission. */
export async function registerReadyParticipant(callId: string, userId: string): Promise<boolean> {
  return prisma.$transaction(async tx => {
    const initial = await tx.callSession.findUnique({ where: { id: callId } });
    if (!initial || ![initial.userAId, initial.userBId].includes(userId)) return false;
    for (const id of [initial.userAId, initial.userBId].sort()) {
      await lockRow(tx, 'User', id);
      const user = await tx.user.findUnique({ where: { id } });
      if (!user || isAccountRestricted(user)) return false;
    }
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
