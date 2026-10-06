import type { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { lockRow } from '../utils/transactionLock';
import { getEffectiveEntitlement, getUserCallsUsedThisPeriod } from './plan';
import { consumeOldestBonusCall } from './referralService';
import { isUserSessionRecorder } from '../utils/recordingAccess';

interface Completion {
  endedAt: Date;
  duration: number;
  status?: 'COMPLETED' | 'CANCELLED';
  charge?: boolean;
  egressId?: string | null;
  recordingUrl?: string | null;
  recordingExpiresAt?: Date | null;
  reason?: string;
  deniedUserId?: string;
}

/** Shares Go's participant-first lock order; the terminal claim and allowance writes commit together. */
export async function completeCallSession(id: string, completion: Completion): Promise<{ count: number }> {
  if (!Number.isSafeInteger(completion.duration) || completion.duration < 0) throw new Error('Invalid call duration.');
  return prisma.$transaction(async tx => {
    const initial = await tx.callSession.findUnique({ where: { id } });
    if (!initial || initial.status !== 'ACTIVE') return { count: 0 };
    const participantIds = [initial.userAId, initial.userBId].sort();
    for (const userId of participantIds) await lockRow(tx, 'User', userId);
    await lockRow(tx, 'CallSession', id);
    const session = await tx.callSession.findUnique({ where: { id } });
    if (!session || session.status !== 'ACTIVE') return { count: 0 };

    // An empty room cannot undo previously granted media permissions.
    const status = completion.status === 'CANCELLED' && !session.mediaAuthorizedAt ? 'CANCELLED' : 'COMPLETED';
    const duration = status === 'CANCELLED' ? 0 : Math.max(completion.duration, Math.max(0, Math.floor((completion.endedAt.getTime() - session.createdAt.getTime()) / 1000)));
    const charge = status === 'COMPLETED' && duration >= 5;
    const allowances = [];
    if (charge) {
      for (const userId of participantIds) {
        const user = await tx.user.findUnique({ where: { id: userId } });
        if (!user) throw new Error('Call participant is missing.');
        // Query while the current call is still ACTIVE, so the last included call does not use a bonus.
        const used = await getUserCallsUsedThisPeriod(userId, user, tx);
        allowances.push({ user, used, entitlement: getEffectiveEntitlement(user) });
      }
    }

    const { charge: _charge, reason: suppliedReason, deniedUserId: suppliedDeniedUserId, ...fields } = completion;
    const deniedFailure = !charge && suppliedReason === 'microphone_permission_denied';
    const reason = suppliedReason === 'microphone_permission_denied' && charge ? 'call_finished' : suppliedReason;
    const deniedUserId = deniedFailure ? suppliedDeniedUserId : undefined;
    const a = await tx.user.findUnique({ where: { id: session.userAId } });
    const b = await tx.user.findUnique({ where: { id: session.userBId } });
    if (!a || !b) throw new Error('Call participant is missing.');
    const retentionA = getEffectiveEntitlement(a).retentionDays;
    const retentionB = getEffectiveEntitlement(b).retentionDays;
    const retention = Math.max(1,
      isUserSessionRecorder(session.recordedByUserId, a.id) ? retentionA : 0,
      isUserSessionRecorder(session.recordedByUserId, b.id) ? retentionB : 0);
    const recordingExpiresAt = session.recordingUrl || session.recordingKeys?.length
      ? new Date(completion.endedAt.getTime() + retention * 86400000) : null;
    // Persistent latest-egress state is authoritative, including when another replica stopped/restarted it.
    const data: Prisma.CallSessionUpdateManyMutationInput = { ...fields, duration, status, activeRecorderIds: null,
      egressId: session.egressId, recordingUrl: session.recordingUrl, recordingExpiresAt };
    const claimed = await tx.callSession.updateMany({ where: { id, status: 'ACTIVE' }, data });
    if (claimed.count !== 1) return claimed;
    if (status === 'COMPLETED' || status === 'CANCELLED') {
      if (suppliedDeniedUserId && suppliedDeniedUserId !== a.id && suppliedDeniedUserId !== b.id) throw new Error('Invalid denied participant.');
      await tx.postCallJob.create({ data: {
        callId: id, reason, deniedUserId,
        nextAttemptAt: new Date(Date.now() + 2000),
        retentionA, retentionB,
      } });
    }
    for (const { user, used, entitlement } of allowances) {
      if (!entitlement.isUnlimited && used >= entitlement.callLimit && await consumeOldestBonusCall(user.id, tx)) continue;
      await tx.user.update({
        where: { id: user.id },
        data: { dailyCallsUsed: used + 1, lastCallDate: completion.endedAt.toISOString().slice(0, 7) },
      });
    }
    return claimed;
  }, { maxWait: 10000, timeout: 15000 });
}
