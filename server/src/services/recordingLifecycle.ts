import { prisma } from '../config/database';
import { lockRow } from '../utils/transactionLock';
import { getEffectiveEntitlement, getUserRecordingsUsedThisPeriod } from './plan';
import type { Prisma } from '@prisma/client';
import { isAccountRestricted } from './accountRestriction';

async function consumeRecording(tx: Prisma.TransactionClient, callId: string, userId: string) {
  const user = await tx.user.findUnique({ where: { id: userId } });
  if (!user || isAccountRestricted(user)) throw new Error('Recording is unavailable for this account.');
  const existing = await tx.recordingUsage.findUnique({ where: { callId_userId: { callId, userId } } });
  if (existing) return;
  const entitlement = getEffectiveEntitlement(user);
  if (!entitlement.isAdmin && await getUserRecordingsUsedThisPeriod(userId, user, tx) >= entitlement.baseRecordingLimit) await (await import('./credits')).reserveRecordingCredit(tx,callId,userId);
  const call=await tx.callSession.findUnique({where:{id:callId},include:{userA:true,userB:true}});
  if(!call)throw new Error('Call is unavailable.');
  const {calculateEffectiveCallDuration}=await import('./plan');
  const minutes=calculateEffectiveCallDuration(call.userA,call.userB);
  const capacity=await tx.$queryRaw<{reserved:boolean}[]>`SELECT pairtalk_reserve_recording_capacity(${callId},${minutes}::integer) AS reserved`;
  if(!capacity[0]?.reserved)throw new Error('Recording capacity is currently unavailable. Your recording credit has not been charged.');
  await tx.recordingUsage.create({ data: { callId, userId } });
}

export async function commitRecordingStart(callId: string, userId: string, previousEgressId: string | null, egress: { egressId: string; relativeUrl: string }): Promise<boolean> {
  return prisma.$transaction(async tx => {
    await lockRow(tx, 'User', userId);
    await lockRow(tx, 'CallSession', callId);
    const current = await tx.callSession.findUnique({ where: { id: callId } });
    if (!current || current.status !== 'ACTIVE' || !current.mediaAuthorizedAt || current.activeRecorderIds || current.egressId !== previousEgressId || ![current.userAId,current.userBId].includes(userId)) return false;
    await consumeRecording(tx, callId, userId);
    await tx.callSession.update({ where: { id: callId }, data: { egressId: egress.egressId, recordingUrl: egress.relativeUrl, recordedByUserId: userId, activeRecorderIds: userId } });
    await tx.recordingSegment.create({ data: { callId, egressId: egress.egressId, objectKey: egress.relativeUrl, ownerIds: [userId] } });
    return true;
  });
}

export async function trackRecordingKey(callId: string, key: string): Promise<void> {
  await prisma.callSession.update({ where: { id: callId }, data: { recordingKeys: { push: key } } });
}

/** Intent and saved-file ownership are different: leaving never removes download access. */
export async function changeRecordingIntent(callId: string, userId: string, recording: boolean, egressId: string) {
  return prisma.$transaction(async tx => {
    await lockRow(tx, 'User', userId);
    await lockRow(tx, 'CallSession', callId);
    const session = await tx.callSession.findUnique({ where: { id: callId } });
    if (!session || session.status !== 'ACTIVE' || session.egressId !== egressId ||
        (session.userAId !== userId && session.userBId !== userId) || !session.activeRecorderIds) return null;
    const active = new Set(session.activeRecorderIds.split(',').filter(Boolean));
    if (recording) {
      await consumeRecording(tx, callId, userId);
      active.add(userId);
    } else active.delete(userId);
    const legacyShared = !session.recordedByUserId || ['BOTH', 'ALL'].includes(session.recordedByUserId);
    const owners = new Set(legacyShared ? [session.userAId, session.userBId] : session.recordedByUserId!.split(',').filter(Boolean));
    if (recording) owners.add(userId);
    if (recording) await tx.recordingSegment.updateMany({ where: { callId, egressId }, data: { ownerIds: [...owners].sort() } });
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
