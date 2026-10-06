import { prisma } from '../config/database';
import { lockRow } from '../utils/transactionLock';

export async function trackRecordingKey(callId: string, key: string): Promise<void> {
  await prisma.callSession.update({ where: { id: callId }, data: { recordingKeys: { push: key } } });
}

/** Intent and saved-file ownership are different: leaving never removes download access. */
export async function changeRecordingIntent(callId: string, userId: string, recording: boolean, egressId: string) {
  return prisma.$transaction(async tx => {
    await lockRow(tx, 'CallSession', callId);
    const session = await tx.callSession.findUnique({ where: { id: callId } });
    if (!session || session.status !== 'ACTIVE' || session.egressId !== egressId ||
        (session.userAId !== userId && session.userBId !== userId) || !session.activeRecorderIds) return null;
    const active = new Set(session.activeRecorderIds.split(',').filter(Boolean));
    if (recording) active.add(userId); else active.delete(userId);
    const legacyShared = !session.recordedByUserId || ['BOTH', 'ALL'].includes(session.recordedByUserId);
    const owners = new Set(legacyShared ? [session.userAId, session.userBId] : session.recordedByUserId!.split(',').filter(Boolean));
    if (recording) owners.add(userId);
    await tx.callSession.update({ where: { id: callId }, data: {
      activeRecorderIds: active.size ? [...active].sort().join(',') : null,
      ...(recording ? { recordedByUserId: [...owners].sort().join(',') } : {}),
    } });
    return { stopped: active.size === 0 };
  });
}

export async function forgetDeletedRecordingKeys(callId: string, deleted: Set<string>): Promise<void> {
  await prisma.$transaction(async tx => {
    await lockRow(tx, 'CallSession', callId);
    const current = await tx.callSession.findUnique({ where: { id: callId } });
    if (!current) return;
    await tx.callSession.update({ where: { id: callId }, data: {
      ...(current.recordingUrl && deleted.has(current.recordingUrl) ? { recordingUrl: null } : {}),
      ...(current.recordingKeys?.length ? { recordingKeys: current.recordingKeys.filter(key => !deleted.has(key)) } : {}),
    } });
  });
}
