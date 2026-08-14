import { Server, Socket } from 'socket.io';
import type { Prisma } from '@prisma/client';
import { Bot } from 'grammy';
import { matchmakingService, determineWeakAndStrongSkills } from '../services/matchmaking';
import { calculateMixedPlanDuration, getRetentionDaysForPlan, getDailyLimitForPlan, getEffectiveEntitlement } from '../services/plan';
import { generateLiveKitToken, startAudioEgress, stopAudioEgress, deleteLiveKitRoom, type EgressResult } from '../config/livekit';
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
  const serverSessionTimers = new Map<string, NodeJS.Timeout>();
  const userLastActionTime = new Map<string, number>();
  const disconnectGraceTimers = new Map<string, NodeJS.Timeout>();

  const clearSessionTimer = (roomName: string) => {
    const existing = serverSessionTimers.get(roomName);
    if (existing) {
      clearTimeout(existing);
      serverSessionTimers.delete(roomName);
    }
  };

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

    // Cancel any active disconnect grace timer if user reconnected
    const graceTimer = disconnectGraceTimers.get(userId);
    if (graceTimer) {
      clearTimeout(graceTimer);
      disconnectGraceTimers.delete(userId);
    }
  };

  const removeUserSocket = (userId: string, socketId: string): void => {
    const sockets = userSockets.get(userId);
    if (!sockets) return;
    sockets.delete(socketId);
    if (sockets.size === 0) userSockets.delete(userId);
  };

  const recordCompletedCallCredits = async (userAId: string, userBId: string, durationSeconds: number): Promise<void> => {
    if (durationSeconds < 5) return;
    const today = new Date().toISOString().slice(0, 10);
    await Promise.allSettled([
      prisma.user.updateMany({
        where: { id: userAId, lastCallDate: today },
        data: { dailyCallsUsed: { increment: 1 } },
      }),
      prisma.user.updateMany({
        where: { id: userAId, OR: [{ lastCallDate: null }, { lastCallDate: { not: today } }] },
        data: { lastCallDate: today, dailyCallsUsed: 1 },
      }),
      prisma.user.updateMany({
        where: { id: userBId, lastCallDate: today },
        data: { dailyCallsUsed: { increment: 1 } },
      }),
      prisma.user.updateMany({
        where: { id: userBId, OR: [{ lastCallDate: null }, { lastCallDate: { not: today } }] },
        data: { lastCallDate: today, dailyCallsUsed: 1 },
      }),
    ]);
  };

  const getConnectedSocket = (userId: string): Socket | undefined => {
    const sockets = userSockets.get(userId);
    if (!sockets) return undefined;
    for (const socketId of sockets) {
      const socket = io.sockets.sockets.get(socketId);
      if (socket && socket.connected) return socket as Socket;
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

      const now = Date.now();
      const lastAction = userLastActionTime.get(currentUserId) || 0;
      if (now - lastAction < 800) {
        socket.emit('queue_joined', { status: 'searching' });
        return;
      }
      userLastActionTime.set(currentUserId, now);

      try {
        await runSerialized(userJoinTails, currentUserId, async () => {
          const banStatus = await moderationService.isUserBanned(currentUserId);
          if (banStatus.banned) {
            socket.emit('error', {
              code: 'MATCHMAKING_SUSPENDED',
              message: banStatus.reason || 'Your account is suspended from matchmaking.',
            });
            return;
          }

          const user = await prisma.user.findUnique({ where: { id: currentUserId } });
          if (!user) {
            socket.emit('error', { code: 'USER_NOT_FOUND', message: 'User profile not found.' });
            return;
          }

          const isSuspended =
            user.isBanned ||
            user.isPermanentlyBanned ||
            Boolean(user.bannedUntil && new Date(user.bannedUntil) > new Date());
          if (isSuspended) {
            socket.emit('error', {
              code: 'MATCHMAKING_SUSPENDED',
              message: 'Your account is suspended from matchmaking. Please contact support via the Telegram Bot.',
            });
            return;
          }

          const activeCall = await prisma.callSession.findFirst({
            where: {
              status: 'ACTIVE',
              OR: [{ userAId: user.id }, { userBId: user.id }],
            },
            include: { userA: true, userB: true },
          });
          if (activeCall) {
            const maxDurationMinutes = calculateMixedPlanDuration(activeCall.userA.plan, activeCall.userB.plan);
            const maxDurationMs = maxDurationMinutes * 60 * 1000 + 60 * 1000;
            const elapsedMs = Date.now() - activeCall.createdAt.getTime();
            if (elapsedMs > maxDurationMs) {
              await prisma.callSession.updateMany({
                where: { id: activeCall.id, status: 'ACTIVE' },
                data: { status: 'COMPLETED', endedAt: new Date(), duration: maxDurationMinutes * 60 },
              });
              clearSessionTimer(activeCall.roomName);
            } else {
              socket.emit('error', {
                code: 'CALL_ALREADY_ACTIVE',
                message: 'Another session is currently in an active call from this account. Please try again later.',
              });
              return;
            }
          }

          // Check daily call quota before queue entry using Effective Entitlements
          const entitlement = getEffectiveEntitlement(user);
          const today = new Date().toISOString().slice(0, 10);
          const dailyCallsToday = user.lastCallDate === today ? user.dailyCallsUsed : 0;
          if (!entitlement.isAdmin && !entitlement.isUnlimited && dailyCallsToday >= entitlement.dailyLimit) {
            socket.emit('error', {
              code: 'MATCHMAKING_QUOTA_EXCEEDED',
              message: `You have reached your daily limit of ${entitlement.dailyLimit} calls. Please upgrade to PLUS or PRO to continue practicing!`,
            });
            return;
          }

          const matchResult = await matchmakingService.joinQueue(
            user.id,
            user.band,
            {
              subFC: user.subFC,
              subLR: user.subLR,
              subGRA: user.subGRA,
              subP: user.subP,
            },
            {
              plan: user.plan,
              warningCount: user.warningCount,
            }
          );

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

          const callDurationLimitMinutes = calculateMixedPlanDuration(user.plan, partner.plan);
          const callDurationLimitSeconds = callDurationLimitMinutes * 60;
          const tokenTtlSeconds = Math.min(3600, Math.max(60, callDurationLimitSeconds + 300));
          const roomName = matchResult.roomName;

          let transactionSucceeded = false;
          try {
            await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
              // Ensure call session is created cleanly with status ACTIVE
              await tx.callSession.create({
                data: { roomName, userAId: user.id, userBId: partner.id, status: 'ACTIVE' },
              });
            });
            transactionSucceeded = true;

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

            // Server-side call duration enforcement timer at exact entitlement boundary
            clearSessionTimer(roomName);
            const timer = setTimeout(() => {
              void (async () => {
                try {
                  await runSerialized(roomOperationTails, roomName, async () => {
                    const currentSession = await prisma.callSession.findUnique({
                      where: { roomName },
                      include: { userA: true, userB: true },
                    });
                    if (!currentSession || currentSession.status !== 'ACTIVE') return;

                    const endedAt = new Date();
                    const durationSeconds = Math.max(1, Math.floor((endedAt.getTime() - currentSession.createdAt.getTime()) / 1000));
                    const claimed = await prisma.callSession.updateMany({
                      where: { id: currentSession.id, status: 'ACTIVE' },
                      data: { status: 'COMPLETED', endedAt, duration: durationSeconds },
                    });
                    if (claimed.count !== 1) return;

                    await recordCompletedCallCredits(currentSession.userAId, currentSession.userBId, durationSeconds);

                    const egress = activeEgresses.get(roomName);
                    const egressId = egress?.egressId ?? currentSession.egressId;
                    const recordingUrl = egress?.relativeUrl || currentSession.recordingUrl || undefined;
                    if (egressId) {
                      try {
                        await stopAudioEgress(egressId);
                      } catch (error: unknown) {
                        console.error('[Socket] timeout_egress_stop_failed', {
                          roomName,
                          egressId,
                          error: error instanceof Error ? error.message : 'unknown_error',
                        });
                      }
                    }
                    activeEgresses.delete(roomName);

                    const retentionA = getEffectiveEntitlement(currentSession.userA).retentionDays;
                    const retentionB = getEffectiveEntitlement(currentSession.userB).retentionDays;
                    const recordingExpiresAt = recordingUrl
                      ? new Date(Date.now() + Math.max(retentionA, retentionB) * 24 * 60 * 60 * 1000)
                      : null;

                    await prisma.callSession.update({
                      where: { id: currentSession.id },
                      data: { egressId: egressId ?? null, recordingUrl: recordingUrl ?? null, recordingExpiresAt },
                    });

                    clearSessionTimer(roomName);
                    await deleteLiveKitRoom(roomName);

                    io.to(roomName).emit('call_finished', {
                      duration: durationSeconds,
                      reason: 'call_duration_limit_reached',
                    });

                    if (bot) {
                      await Promise.allSettled([
                        sendPostCallReviewCard(bot, currentSession.userA.telegramId.toString(), currentSession.id, currentSession.userB.alias, durationSeconds, recordingUrl),
                        sendPostCallReviewCard(bot, currentSession.userB.telegramId.toString(), currentSession.id, currentSession.userA.alias, durationSeconds, recordingUrl),
                      ]);
                    }
                  });
                } catch (timeoutErr) {
                  console.error('[Signaling] Server duration timeout execution failed:', timeoutErr);
                }
              })();
            }, callDurationLimitSeconds * 1000);

            serverSessionTimers.set(roomName, timer);

            userSocket.emit('match_found', {
              partnerId: partner.id,
              partnerAlias: partner.alias,
              partnerBand: partner.band,
              roomName,
              token: tokenUser,
              livekitToken: tokenUser,
              callDurationLimit: callDurationLimitSeconds,
              maxDurationSeconds: callDurationLimitSeconds,
            });

            partnerSocket.emit('match_found', {
              partnerId: user.id,
              partnerAlias: user.alias,
              partnerBand: user.band,
              roomName,
              token: tokenPartner,
              livekitToken: tokenPartner,
              callDurationLimit: callDurationLimitSeconds,
              maxDurationSeconds: callDurationLimitSeconds,
            });
          } catch (error: unknown) {
            console.error('[Socket] match_dispatch_failed', {
              userId: user.id,
              partnerId: partner.id,
              roomName,
              transactionSucceeded,
              error: error instanceof Error ? error.message : 'unknown_error',
            });

            if (transactionSucceeded) {
              await prisma.callSession.updateMany({
                where: { roomName, status: 'ACTIVE' },
                data: { status: 'CANCELLED' },
              });
            }

            const ownBucket = getUserBucket(user);
            await matchmakingService.restoreQueue(user.id, ownBucket).catch((restoreError: unknown) => {
              console.error('[Socket] own_restore_failed', {
                userId: user.id,
                error: restoreError instanceof Error ? restoreError.message : 'unknown_error',
              });
            });

            socket.emit('queue_joined', { status: 'searching' });
          }
        });
      } catch (error: unknown) {
        console.error('[Socket] join_queue_failed', {
          userId: currentUserId,
          error: error instanceof Error ? error.message : 'unknown_error',
        });
        socket.emit('error', { message: 'Failed to join matchmaking queue.' });
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

            try {
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
            } catch (egressErr) {
              console.warn('[Socket] Recording start failed gracefully:', egressErr instanceof Error ? egressErr.message : egressErr);
              socket.emit('record_status', { record: false });
              socket.emit('error', {
                code: 'RECORDING_UNAVAILABLE',
                message: 'Audio recording is temporarily unavailable. Your voice call can proceed normally.',
              });
              return;
            }
          }

          const egressId = session.egressId ?? activeEgresses.get(payload.roomName)?.egressId;
          if (egressId) {
            try {
              await stopAudioEgress(egressId);
            } catch {}
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
        socket.emit('error', { code: 'INTERNAL_ERROR', message: 'Unable to update recording status.' });
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

          clearSessionTimer(payload.roomName);

          if (session.status !== 'ACTIVE') {
            socket.emit('call_finished', { duration: session.duration ?? 0 });
            return;
          }

          const endedAt = new Date();
          const durationSeconds = Math.max(1, Math.floor((endedAt.getTime() - session.createdAt.getTime()) / 1000));
          const claimed = await prisma.callSession.updateMany({
            where: { id: session.id, status: 'ACTIVE' },
            data: { status: 'COMPLETED', endedAt, duration: durationSeconds },
          });
          if (claimed.count !== 1) {
            socket.emit('call_finished', { duration: session.duration ?? 0 });
            return;
          }

          await recordCompletedCallCredits(session.userAId, session.userBId, durationSeconds);

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

          const retentionA = getEffectiveEntitlement(session.userA).retentionDays;
          const retentionB = getEffectiveEntitlement(session.userB).retentionDays;
          const recordingExpiresAt = recordingUrl
            ? new Date(Date.now() + Math.max(retentionA, retentionB) * 24 * 60 * 60 * 1000)
            : null;

          await prisma.callSession.update({
            where: { id: session.id },
            data: { egressId: egressId ?? null, recordingUrl: recordingUrl ?? null, recordingExpiresAt },
          });

          await deleteLiveKitRoom(payload.roomName);

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

          // Find active sessions involving this user
          const activeSessions = await prisma.callSession.findMany({
            where: {
              status: 'ACTIVE',
              OR: [{ userAId: disconnectedUserId }, { userBId: disconnectedUserId }],
            },
          });

          if (activeSessions.length === 0) return;

          // 15-second grace period for mobile app blur / network reconnect
          const graceTimer = setTimeout(async () => {
            disconnectGraceTimers.delete(disconnectedUserId);
            const isReconnected = (userSockets.get(disconnectedUserId)?.size ?? 0) > 0;
            if (isReconnected) return;

            for (const session of activeSessions) {
              try {
                await runSerialized(roomOperationTails, session.roomName, async () => {
                  const currentSession = await prisma.callSession.findUnique({
                    where: { id: session.id },
                    include: { userA: true, userB: true },
                  });
                  if (!currentSession || currentSession.status !== 'ACTIVE') return;

                  const endedAt = new Date();
                  const durationSeconds = Math.max(1, Math.floor((endedAt.getTime() - currentSession.createdAt.getTime()) / 1000));

                  const egress = activeEgresses.get(session.roomName);
                  const egressId = egress?.egressId ?? currentSession.egressId;
                  const recordingUrl = egress?.relativeUrl || currentSession.recordingUrl || undefined;

                  if (egressId) {
                    await stopAudioEgress(egressId).catch((stopErr: unknown) => {
                      console.error('[Socket] disconnect_egress_stop_failed', {
                        roomName: session.roomName,
                        error: stopErr instanceof Error ? stopErr.message : 'unknown_error',
                      });
                    });
                    activeEgresses.delete(session.roomName);
                  }

                  const recordingExpiresAt = recordingUrl
                    ? new Date(Date.now() + Math.max(getRetentionDaysForPlan(currentSession.userA.plan), getRetentionDaysForPlan(currentSession.userB.plan)) * 24 * 60 * 60 * 1000)
                    : null;

                  await prisma.callSession.update({
                    where: { id: session.id },
                    data: {
                      status: 'COMPLETED',
                      endedAt,
                      duration: durationSeconds,
                      egressId: egressId ?? null,
                      recordingUrl: recordingUrl ?? null,
                      recordingExpiresAt,
                    },
                  });

                  clearSessionTimer(session.roomName);
                  await deleteLiveKitRoom(session.roomName);

                  io.to(session.roomName).emit('call_finished', {
                    duration: durationSeconds,
                    reason: 'partner_disconnected',
                  });

                  if (bot) {
                    await Promise.allSettled([
                      sendPostCallReviewCard(bot, currentSession.userA.telegramId.toString(), currentSession.id, currentSession.userB.alias, durationSeconds, recordingUrl),
                      sendPostCallReviewCard(bot, currentSession.userB.telegramId.toString(), currentSession.id, currentSession.userA.alias, durationSeconds, recordingUrl),
                    ]);
                  }
                });
              } catch (error: unknown) {
                console.error('[Socket] disconnect_session_cleanup_failed', {
                  roomName: session.roomName,
                  error: error instanceof Error ? error.message : 'unknown_error',
                });
              }
            }
          }, 15000);

          disconnectGraceTimers.set(disconnectedUserId, graceTimer);
        } catch (error: unknown) {
          console.error('[Socket] disconnect_handler_failed', {
            userId: disconnectedUserId,
            reason,
            error: error instanceof Error ? error.message : 'unknown_error',
          });
        }
      })();
    });
  });

  void (async () => {
    try {
      const activeSessions = await prisma.callSession.findMany({
        where: { status: 'ACTIVE' },
        include: { userA: true, userB: true },
      });

      const now = Date.now();
      for (const session of activeSessions) {
        const callDurationLimitMinutes = calculateMixedPlanDuration(session.userA.plan, session.userB.plan);
        const callDurationLimitSeconds = callDurationLimitMinutes * 60;
        const elapsedSeconds = Math.floor((now - session.createdAt.getTime()) / 1000);
        const remainingSeconds = Math.max(1, callDurationLimitSeconds - elapsedSeconds);

        if (elapsedSeconds >= callDurationLimitSeconds) {
          const endedAt = new Date();
          await prisma.callSession.update({
            where: { id: session.id },
            data: { status: 'COMPLETED', endedAt, duration: elapsedSeconds },
          });
          await deleteLiveKitRoom(session.roomName);
        } else {
          clearSessionTimer(session.roomName);
          const timer = setTimeout(() => {
            void (async () => {
              try {
                await runSerialized(roomOperationTails, session.roomName, async () => {
                  const current = await prisma.callSession.findUnique({
                    where: { id: session.id },
                    include: { userA: true, userB: true },
                  });
                  if (!current || current.status !== 'ACTIVE') return;

                  const endedAt = new Date();
                  const durationSeconds = Math.max(1, Math.floor((endedAt.getTime() - current.createdAt.getTime()) / 1000));
                  await prisma.callSession.update({
                    where: { id: session.id },
                    data: { status: 'COMPLETED', endedAt, duration: durationSeconds },
                  });

                  clearSessionTimer(session.roomName);
                  await deleteLiveKitRoom(session.roomName);
                  io.to(session.roomName).emit('call_finished', { duration: durationSeconds, reason: 'call_duration_limit_reached' });
                });
              } catch (timeoutErr) {
                console.error('[Signaling] Reconciled call timeout execution failed:', timeoutErr);
              }
            })();
          }, remainingSeconds * 1000);

          serverSessionTimers.set(session.roomName, timer);
        }
      }
      console.log(`[Signaling] Reconciled ${activeSessions.length} active call sessions on startup.`);
    } catch (reconcileErr) {
      console.error('[Signaling] Failed to reconcile active sessions on startup:', reconcileErr);
    }
  })();
}
