import { Server, Socket } from 'socket.io';
import type { Prisma } from '@prisma/client';
import { Bot } from 'grammy';
import { matchmakingService, determineWeakAndStrongSkills } from '../services/matchmaking';
import { calculateMixedPlanDuration, getRetentionDaysForPlan } from '../services/plan';
import { generateLiveKitToken, startAudioEgress, stopAudioEgress, type EgressResult } from '../config/livekit';
import { prisma } from '../config/database';
import { moderationService } from '../services/moderation';
import { sendPostCallReviewCard } from '../bot/handlers/postCall';
import { validateTelegramInitData } from '../middleware/initDataLockdown';
import { env } from '../config/env';
import { MyContext } from '../bot/types';

interface ToggleRecordPayload {
  readonly roomName: string;
  readonly record: boolean;
}

interface FinishCallPayload {
  readonly roomName: string;
}

interface SocketData {
  userId?: string;
  telegramId?: string;
}

interface ActiveEgress extends EgressResult {}

function isToggleRecordPayload(value: unknown): value is ToggleRecordPayload {
  if (!value || typeof value !== 'object') return false;
  const data = value as Record<string, unknown>;
  return typeof data.roomName === 'string' && data.roomName.length > 0 && data.roomName.length <= 128 && typeof data.record === 'boolean';
}

function isFinishCallPayload(value: unknown): value is FinishCallPayload {
  if (!value || typeof value !== 'object') return false;
  const data = value as Record<string, unknown>;
  return typeof data.roomName === 'string' && data.roomName.length > 0 && data.roomName.length <= 128;
}

function getUserBucket(user: {
  band: number;
  subFC: number;
  subLR: number;
  subGRA: number;
  subP: number;
}): string {
  const { weakSkill, strongSkill } = determineWeakAndStrongSkills({
    subFC: user.subFC,
    subLR: user.subLR,
    subGRA: user.subGRA,
    subP: user.subP,
  });
  return matchmakingService.getBucketKey(user.band, weakSkill, strongSkill);
}

export function setupSocketSignaling(io: Server, bot?: Bot<MyContext>): void {
  const userSockets = new Map<string, Set<string>>();
  const activeEgresses = new Map<string, ActiveEgress>();
  const roomOperationTails = new Map<string, Promise<void>>();
  const userJoinTails = new Map<string, Promise<void>>();

  const runSerialized = async <T>(map: Map<string, Promise<void>>, key: string, operation: () => Promise<T>): Promise<T> => {
    const previous = map.get(key) ?? Promise.resolve();
    let release: (() => void) | undefined;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    map.set(key, current);

    await previous.catch(() => undefined);
    try {
      return await operation();
    } finally {
      release?.();
      if (map.get(key) === current) map.delete(key);
    }
  };

  const addUserSocket = (userId: string, socketId: string): void => {
    const sockets = userSockets.get(userId) ?? new Set<string>();
    sockets.add(socketId);
    userSockets.set(userId, sockets);
  };

  const removeUserSocket = (userId: string, socketId: string): void => {
    const sockets = userSockets.get(userId);
    if (!sockets) return;
    sockets.delete(socketId);
    if (sockets.size === 0) userSockets.delete(userId);
  };

  const getConnectedSocket = (userId: string): Socket | undefined => {
    const sockets = userSockets.get(userId);
    if (!sockets) return undefined;
    for (const socketId of sockets) {
      const socket = io.sockets.sockets.get(socketId);
      if (socket) return socket as Socket;
    }
    return undefined;
  };

  io.use(async (socket: Socket, next) => {
    try {
      const authToken = socket.handshake.auth?.token;
      const headerToken = socket.handshake.headers['x-telegram-init-data'];
      const token = typeof authToken === 'string' ? authToken : typeof headerToken === 'string' ? headerToken : undefined;

      if (env.NODE_ENV === 'test' && token === 'test-allowed') {
        socket.data.userId = 'test_user_id';
        socket.data.telegramId = '12345678';
        next();
        return;
      }

      if (!token) {
        next(new Error('Authentication failed: Missing initData token.'));
        return;
      }

      const { valid, user: tgUser } = validateTelegramInitData(token, env.BOT_TOKEN);
      if (!valid || !tgUser) {
        next(new Error('Authentication failed: Invalid initData signature.'));
        return;
      }

      const dbUser = await prisma.user.findUnique({ where: { telegramId: tgUser.id } });
      if (!dbUser) {
        next(new Error('Authentication failed: User profile not found. Please type /start in Telegram.'));
        return;
      }

      socket.data.userId = dbUser.id;
      socket.data.telegramId = dbUser.telegramId.toString();
      next();
    } catch (error: unknown) {
      console.error('[Socket] auth_failed', {
        socketId: socket.id,
        error: error instanceof Error ? error.message : 'unknown_error',
      });
      next(new Error('Authentication error.'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const userId = socket.data.userId as string | undefined;
    if (userId) addUserSocket(userId, socket.id);

    console.log('[Socket] connected', { socketId: socket.id, userId });

    socket.on('join_queue', async () => {
      const currentUserId = socket.data.userId as string | undefined;
      if (!currentUserId) {
        socket.emit('error', { message: 'Unauthenticated socket session.' });
        return;
      }

      try {
        await runSerialized(userJoinTails, currentUserId, async () => {
          const banStatus = await moderationService.isUserBanned(currentUserId);
          if (banStatus.banned) {
            socket.emit('error', { message: banStatus.reason || 'User is banned.' });
            return;
          }

          const user = await prisma.user.findUnique({ where: { id: currentUserId } });
          if (!user) {
            socket.emit('error', { message: 'User profile not found.' });
            return;
          }

          const activeCall = await prisma.callSession.findFirst({
            where: {
              status: 'ACTIVE',
              OR: [{ userAId: user.id }, { userBId: user.id }],
            },
          });
          if (activeCall) {
            socket.emit('error', { message: 'You are already in an active call.' });
            return;
          }

          const matchResult = await matchmakingService.joinQueue(user.id, user.band, {
            subFC: user.subFC,
            subLR: user.subLR,
            subGRA: user.subGRA,
            subP: user.subP,
          });

          if (!matchResult.matched || !matchResult.partnerId || !matchResult.roomName || !matchResult.partnerBucketKey) {
            socket.emit('queue_joined', { status: 'searching' });
            return;
          }

          const partner = await prisma.user.findUnique({ where: { id: matchResult.partnerId } });
          const partnerSocket = partner ? getConnectedSocket(partner.id) : undefined;
          if (!partner || !partnerSocket) {
            if (partner) await matchmakingService.cancelQueue(partner.id).catch(() => undefined);
            const ownBucket = getUserBucket(user);
            await matchmakingService.restoreQueue(user.id, ownBucket).catch((error: unknown) => {
              console.error('[Socket] match_requeue_failed', {
                userId: user.id,
                error: error instanceof Error ? error.message : 'unknown_error',
              });
            });
            socket.emit('queue_joined', { status: 'searching' });
            return;
          }

          const callDurationLimit = calculateMixedPlanDuration(user.plan, partner.plan);
          const tokenTtlSeconds = Math.min(3600, Math.max(60, callDurationLimit * 60 + 300));
          const roomName = matchResult.roomName;

          try {
            await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
              const today = new Date().toISOString().slice(0, 10);
              await tx.user.updateMany({
                where: {
                  id: { in: [user.id, partner.id] },
                  OR: [{ lastCallDate: null }, { lastCallDate: { not: today } }],
                },
                data: { dailyCallsUsed: 0, lastCallDate: today },
              });

              const userQuota = await tx.user.updateMany({
                where: { id: user.id, lastCallDate: today, dailyCallsUsed: { lt: user.dailyLimit } },
                data: { dailyCallsUsed: { increment: 1 } },
              });
              const partnerQuota = await tx.user.updateMany({
                where: { id: partner.id, lastCallDate: today, dailyCallsUsed: { lt: partner.dailyLimit } },
                data: { dailyCallsUsed: { increment: 1 } },
              });

              if (userQuota.count !== 1 || partnerQuota.count !== 1) {
                throw new Error('Daily call limit reached');
              }

              await tx.callSession.create({
                data: { roomName, userAId: user.id, userBId: partner.id, status: 'ACTIVE' },
              });
            });

            const [tokenUser, tokenPartner] = await Promise.all([
              generateLiveKitToken(roomName, user.id, user.alias, tokenTtlSeconds),
              generateLiveKitToken(roomName, partner.id, partner.alias, tokenTtlSeconds),
            ]);

            const userSocket = getConnectedSocket(user.id);
            if (!userSocket || !partnerSocket.connected) {
              throw new Error('Participant disconnected during match setup');
            }

            userSocket.join(roomName);
            partnerSocket.join(roomName);

            userSocket.emit('match_found', {
              roomName,
              livekitToken: tokenUser,
              partnerAlias: partner.alias,
              partnerBand: partner.band,
              callDurationLimit,
            });
            partnerSocket.emit('match_found', {
              roomName,
              livekitToken: tokenPartner,
              partnerAlias: user.alias,
              partnerBand: user.band,
              callDurationLimit,
            });
          } catch (error: unknown) {
            try {
              await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
                const cancelled = await tx.callSession.updateMany({
                  where: { roomName, status: 'ACTIVE' },
                  data: { status: 'CANCELLED', endedAt: new Date() },
                });
                if (cancelled.count !== 1) return;

                const today = new Date().toISOString().slice(0, 10);
                await tx.user.updateMany({
                  where: { id: user.id, lastCallDate: today, dailyCallsUsed: { gt: 0 } },
                  data: { dailyCallsUsed: { decrement: 1 } },
                });
                await tx.user.updateMany({
                  where: { id: partner.id, lastCallDate: today, dailyCallsUsed: { gt: 0 } },
                  data: { dailyCallsUsed: { decrement: 1 } },
                });
              });
            } catch (rollbackError: unknown) {
              console.error('[Socket] match_rollback_failed', {
                roomName,
                error: rollbackError instanceof Error ? rollbackError.message : 'unknown_error',
              });
            }

            const bucketUser = getUserBucket(user);
            const bucketPartner = getUserBucket(partner);
            await Promise.allSettled([
              matchmakingService.restoreQueue(user.id, bucketUser),
              matchmakingService.restoreQueue(partner.id, bucketPartner),
            ]);
            socket.emit('error', {
              message: error instanceof Error && error.message === 'Daily call limit reached'
                ? 'Daily call limit reached.'
                : 'Unable to establish the call. You have been returned to the queue.',
            });
          }
        });
      } catch (error: unknown) {
        console.error('[Socket] join_queue_failed', {
          socketId: socket.id,
          userId: currentUserId,
          error: error instanceof Error ? error.message : 'unknown_error',
        });
        socket.emit('error', { message: 'Unable to join matchmaking right now.' });
      }
    });

    socket.on('cancel_queue', async () => {
      const currentUserId = socket.data.userId as string | undefined;
      if (!currentUserId) return;
      try {
        if ((userSockets.get(currentUserId)?.size ?? 0) <= 1) {
          await matchmakingService.cancelQueue(currentUserId);
        }
        socket.emit('queue_cancelled', { success: true });
      } catch (error: unknown) {
        console.error('[Socket] cancel_queue_failed', {
          userId: currentUserId,
          error: error instanceof Error ? error.message : 'unknown_error',
        });
        socket.emit('error', { message: 'Failed to cancel matchmaking.' });
      }
    });

    socket.on('toggle_record', async (payload: unknown) => {
      if (!isToggleRecordPayload(payload)) {
        socket.emit('error', { message: 'Invalid recording request.' });
        return;
      }
      const requesterId = socket.data.userId as string | undefined;
      if (!requesterId) {
        socket.emit('error', { message: 'Unauthenticated socket session.' });
        return;
      }

      try {
        await runSerialized(roomOperationTails, payload.roomName, async () => {
          const session = await prisma.callSession.findUnique({ where: { roomName: payload.roomName } });
          if (!session || session.status !== 'ACTIVE' || (session.userAId !== requesterId && session.userBId !== requesterId)) {
            socket.emit('error', { message: 'Unauthorized or inactive call.' });
            return;
          }

          if (payload.record) {
            if (session.egressId) {
              activeEgresses.set(payload.roomName, {
                egressId: session.egressId,
                relativeUrl: session.recordingUrl ?? '',
              });
              io.to(payload.roomName).emit('record_status', { record: true });
              return;
            }

            const egress = await startAudioEgress(payload.roomName);
            const updated = await prisma.callSession.updateMany({
              where: { id: session.id, status: 'ACTIVE', egressId: null },
              data: { egressId: egress.egressId, recordingUrl: egress.relativeUrl },
            });
            if (updated.count !== 1) {
              await stopAudioEgress(egress.egressId).catch((error: unknown) => {
                console.error('[Socket] rollback_egress_stop_failed', {
                  roomName: payload.roomName,
                  error: error instanceof Error ? error.message : 'unknown_error',
                });
              });
              return;
            }

            activeEgresses.set(payload.roomName, egress);
            io.to(payload.roomName).emit('record_status', { record: true });
            return;
          }

          const egressId = session.egressId ?? activeEgresses.get(payload.roomName)?.egressId;
          if (egressId) {
            await stopAudioEgress(egressId);
            await prisma.callSession.updateMany({
              where: { id: session.id, status: 'ACTIVE', egressId },
              data: { egressId: null },
            });
            activeEgresses.delete(payload.roomName);
          }
          io.to(payload.roomName).emit('record_status', { record: false });
        });
      } catch (error: unknown) {
        console.error('[Socket] toggle_record_failed', {
          roomName: payload.roomName,
          requesterId,
          error: error instanceof Error ? error.message : 'unknown_error',
        });
        socket.emit('error', { message: 'Failed to toggle recording.' });
      }
    });

    socket.on('finish_call', async (payload: unknown) => {
      if (!isFinishCallPayload(payload)) {
        socket.emit('error', { message: 'Invalid call completion request.' });
        return;
      }
      const requesterId = socket.data.userId as string | undefined;
      if (!requesterId) {
        socket.emit('error', { message: 'Unauthenticated socket session.' });
        return;
      }

      try {
        await runSerialized(roomOperationTails, payload.roomName, async () => {
          const session = await prisma.callSession.findUnique({
            where: { roomName: payload.roomName },
            include: { userA: true, userB: true },
          });
          if (!session) return;
          if (session.userAId !== requesterId && session.userBId !== requesterId) {
            socket.emit('error', { message: 'Unauthorized: You are not a participant in this call.' });
            return;
          }

          const endedAt = new Date();
          const durationSeconds = Math.max(1, Math.floor((endedAt.getTime() - session.createdAt.getTime()) / 1000));
          const claimed = await prisma.callSession.updateMany({
            where: { id: session.id, status: 'ACTIVE' },
            data: { status: 'COMPLETED', endedAt, duration: durationSeconds },
          });
          if (claimed.count !== 1) return;

          const egress = activeEgresses.get(payload.roomName);
          const egressId = egress?.egressId ?? session.egressId;
          const recordingUrl = egress?.relativeUrl || session.recordingUrl || undefined;
          if (egressId) {
            try {
              await stopAudioEgress(egressId);
            } catch (error: unknown) {
              console.error('[Socket] finish_egress_stop_failed', {
                roomName: payload.roomName,
                egressId,
                error: error instanceof Error ? error.message : 'unknown_error',
              });
            }
          }
          activeEgresses.delete(payload.roomName);

          const recordingExpiresAt = recordingUrl
            ? new Date(Date.now() + Math.max(getRetentionDaysForPlan(session.userA.plan), getRetentionDaysForPlan(session.userB.plan)) * 24 * 60 * 60 * 1000)
            : null;

          await prisma.callSession.update({
            where: { id: session.id },
            data: { egressId: egressId ?? null, recordingUrl: recordingUrl ?? null, recordingExpiresAt },
          });

          io.to(payload.roomName).emit('call_finished', { duration: durationSeconds });

          if (bot) {
            await Promise.allSettled([
              sendPostCallReviewCard(bot, session.userA.telegramId.toString(), session.id, session.userB.alias, durationSeconds, recordingUrl),
              sendPostCallReviewCard(bot, session.userB.telegramId.toString(), session.id, session.userA.alias, durationSeconds, recordingUrl),
            ]);
          }
        });
      } catch (error: unknown) {
        console.error('[Socket] finish_call_failed', {
          roomName: payload.roomName,
          requesterId,
          error: error instanceof Error ? error.message : 'unknown_error',
        });
        socket.emit('error', { message: 'Failed to finish call.' });
      }
    });

    socket.on('disconnect', (reason: string) => {
      void (async (): Promise<void> => {
        const disconnectedUserId = socket.data.userId as string | undefined;
        if (!disconnectedUserId) return;

        try {
          removeUserSocket(disconnectedUserId, socket.id);
          const remainingSockets = userSockets.get(disconnectedUserId);
          if (remainingSockets && remainingSockets.size > 0) return;

          await matchmakingService.cancelQueue(disconnectedUserId);

          for (const [roomName, egress] of activeEgresses.entries()) {
            try {
              const session = await prisma.callSession.findUnique({ where: { roomName } });
              if (!session || (session.userAId !== disconnectedUserId && session.userBId !== disconnectedUserId)) continue;

              const otherUserId = session.userAId === disconnectedUserId ? session.userBId : session.userAId;
              if ((userSockets.get(otherUserId)?.size ?? 0) > 0) continue;

              await stopAudioEgress(egress.egressId);
              activeEgresses.delete(roomName);
            } catch (error: unknown) {
              console.error('[Socket] disconnect_egress_cleanup_failed', {
                roomName,
                reason,
                error: error instanceof Error ? error.message : 'unknown_error',
              });
            }
          }
        } catch (error: unknown) {
          console.error('[Socket] disconnect_cleanup_failed', {
            socketId: socket.id,
            userId: disconnectedUserId,
            reason,
            error: error instanceof Error ? error.message : 'unknown_error',
          });
        }
      })().catch((error: unknown) => {
        console.error('[Socket] disconnect_unhandled', {
          socketId: socket.id,
          error: error instanceof Error ? error.message : 'unknown_error',
        });
      });
    });
  });
}
