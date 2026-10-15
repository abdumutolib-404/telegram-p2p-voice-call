import { EgressStatus, ServerError } from 'livekit-server-sdk';
import { prisma } from '../config/database';
import { roomServiceClient, egressClient } from '../config/livekit';
import { completeCallSession } from './callCompletion';
import { logger } from '../utils/logger';

let cleanupCursor: string | undefined;

/** Durable provider cleanup survives a failed request, lost pub/sub event, or restart. */
export async function recoverRestrictedCalls(userId?: string): Promise<void> {
  const restricted = { OR: [{ isPermanentlyBanned: true }, { isBanned: true, bannedUntil: null }, { bannedUntil: { gt: new Date() } }] };
  const calls = await prisma.callSession.findMany({ where: { status: 'ACTIVE',
    ...(userId ? { AND: [{ OR: [{ userAId: userId }, { userBId: userId }] }] } : {}),
    OR: [{ userA: restricted }, { userB: restricted }],
  }, take: 50 });
  for (const call of calls) await completeCallSession(call.id, { endedAt: new Date(), duration: 0,
    reason: 'account_restricted', restrictionCleanupPending: true });
  let pending = await prisma.callSession.findMany({ where: { restrictionCleanupPending: true }, orderBy: { id: 'asc' }, ...(cleanupCursor ? { cursor: { id: cleanupCursor }, skip: 1 } : {}), take: 50 });
  if (!pending.length && cleanupCursor) {
    cleanupCursor = undefined;
    pending = await prisma.callSession.findMany({ where: { restrictionCleanupPending: true }, orderBy: { id: 'asc' }, take: 50 });
  }
  // Advance before provider I/O: persistent failures cannot hold the first page forever.
  cleanupCursor = pending.at(-1)?.id;

  for (const call of pending) {
    try {
      if (!roomServiceClient) throw new Error('Room service unavailable');
      // Close media even if stopping its recording fails. Only confirmed outcomes clear the retry flag.
      const results = await Promise.allSettled([
        roomServiceClient.deleteRoom(call.roomName).catch(error => {
          if (!(error instanceof ServerError && error.code === 'not_found')) throw error;
        }),
        (async () => {
          if (!call.egressId) return;
          if (!egressClient) throw new Error('Recording service unavailable');
          try { await egressClient.stopEgress(call.egressId); }
          catch (error) {
            if (error instanceof ServerError && error.code === 'not_found') return;
            const jobs = await egressClient.listEgress({ egressId: call.egressId });
            const job = jobs.find(job => job.egressId === call.egressId);
            if (!job || ![EgressStatus.EGRESS_COMPLETE, EgressStatus.EGRESS_FAILED, EgressStatus.EGRESS_ABORTED, EgressStatus.EGRESS_LIMIT_REACHED].includes(job.status)) throw error;
          }
        })(),
      ]);
      if (results.some(result => result.status === 'rejected')) throw new Error('Provider cleanup remains pending');
      await prisma.callSession.updateMany({ where: { id: call.id, restrictionCleanupPending: true }, data: { restrictionCleanupPending: false } });
    } catch (error) {
      logger.warn('Restricted call cleanup deferred', { service: 'moderation', callId: call.id }, error);
    }
  }
}

export function startRestrictionWorker(): () => Promise<void> {
  let stopped = false;
  let active: Promise<void> | undefined;
  let timer: NodeJS.Timeout;
  const tick = async () => {
    if (stopped) return;
    active = recoverRestrictedCalls().catch(error => logger.warn('Restriction recovery deferred', { service: 'moderation' }, error));
    await active;
    if (!stopped) timer = setTimeout(tick, 5000);
  };
  timer = setTimeout(tick, 0);
  return async () => { stopped = true; clearTimeout(timer); await active; };
}
