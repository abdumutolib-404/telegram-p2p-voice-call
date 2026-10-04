import crypto from 'node:crypto';
import { admitCall } from '../services/callAdmission';
import { completeCallSession } from '../services/callCompletion';
import { Server, Socket } from 'socket.io';
import type { Prisma } from '@prisma/client';
import { Bot } from 'grammy';
import { matchmakingService, determineWeakAndStrongSkills } from '../services/matchmaking';
import { getPaidUserProfile, formatPriceDisplay, getPlansConfig, getEffectiveEntitlement, getUserRecordingsUsedThisPeriod, getUserCallsUsedThisPeriod, calculateEffectiveCallDuration } from '../services/plan';
import { getActiveBonusCallsCount } from '../services/referralService';
import { checkRateLimit } from '../services/rateLimitMatrix';
import { generateLiveKitToken, startAudioEgress, stopAudioEgress, deleteLiveKitRoom, areCallParticipantsPresent, countCallParticipants, type EgressResult } from '../config/livekit';
import { prisma } from '../config/database';
import { moderationService } from '../services/moderation';
import { wakePostCallWorker } from '../services/postCallOutbox';
import { validateTelegramInitData } from '../middleware/initDataLockdown';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { MyContext } from '../bot/types';
import { cleanupDirectCallMessages } from '../services/directCallMessages';
import { isUserSessionRecorder } from '../utils/recordingAccess';
export { isUserSessionRecorder } from '../utils/recordingAccess';

interface PeerReadyPayload {
  readonly roomName: string;
}

function isPeerReadyPayload(value: unknown): value is PeerReadyPayload {
  if (!value || typeof value !== 'object') return false;
  const data = value as Record<string, unknown>;
  return typeof data.roomName === 'string' && data.roomName.length > 0 && data.roomName.length <= 128;
}

interface ToggleRecordPayload {
  readonly roomName: string;
  readonly record: boolean;
  readonly requestId?: string;
}

interface FinishCallPayload {
  readonly roomName: string;
  readonly reason?: string;
  readonly requestId?: string;
}

interface SocketData {
  userId?: string;
  telegramId?: string;
  traceId?: string;
  socketId?: string;
  currentRequestId?: string;
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
  return typeof data.roomName === 'string' && data.roomName.length > 0 && data.roomName.length <= 128 && (data.reason === undefined || typeof data.reason === 'string');
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

export function addSessionRecorder(currentRecordedBy: string | null | undefined, userId: string): string {
  if (!currentRecordedBy) return userId;
  const ids = currentRecordedBy.split(',').map((id) => id.trim()).filter(Boolean);
  if (!ids.includes(userId)) {
    ids.push(userId);
  }
  return ids.join(',');
}

export function removeSessionRecorder(currentRecordedBy: string | null | undefined, userId: string): string | null {
  if (!currentRecordedBy) return null;
  const ids = currentRecordedBy.split(',').map((id) => id.trim()).filter((id) => id && id !== userId);
  return ids.length > 0 ? ids.join(',') : null;
}

const userSockets = new Map<string, Set<string>>();
const activeEgresses = new Map<string, ActiveEgress>();
const roomOperationTails = new Map<string, Promise<void>>();
const userJoinTails = new Map<string, Promise<void>>();
const serverSessionTimers = new Map<string, NodeJS.Timeout>();
const connectionHandshakeTimers = new Map<string, NodeJS.Timeout>();
const activeRoomPeers = new Map<string, Set<string>>();
const roomStartedAt = new Map<string, number>();
const roomDurationLimits = new Map<string, number>();
const userLastActionTime = new Map<string, number>();
const disconnectGraceTimers = new Map<string, NodeJS.Timeout>();

let globalIo: Server | null = null;
let globalBot: Bot<MyContext> | null = null;

const clearSessionTimer = (roomName: string) => {
  const existing = serverSessionTimers.get(roomName);
  if (existing) {
    clearTimeout(existing);
    serverSessionTimers.delete(roomName);
  }
};

export function clearConnectionHandshakeTimer(roomName: string): void {
  const existing = connectionHandshakeTimers.get(roomName);
  if (existing) {
    clearTimeout(existing);
    connectionHandshakeTimers.delete(roomName);
  }
}

export function setRoomDurationLimit(roomName: string, durationSeconds: number): void {
  roomDurationLimits.set(roomName, durationSeconds);
}

export function scheduleConnectionHandshakeTimer(
  roomName: string,
  timeoutSeconds: number = 90,
  botInstance?: Bot<MyContext>,
  ioInstance?: Server
): NodeJS.Timeout {
  clearConnectionHandshakeTimer(roomName);
  const effectiveIo = ioInstance ?? globalIo;
  const effectiveBot = botInstance ?? globalBot;

  const timer = setTimeout(() => {
    void (async () => {
      try {
        await runSerialized(roomOperationTails, roomName, async () => {
          connectionHandshakeTimers.delete(roomName);
          const currentSession = await prisma.callSession.findUnique({
            where: { roomName },
            include: { userA: true, userB: true },
          });
          if (!currentSession || currentSession.status !== 'ACTIVE') return;

          let connected: number;
          try {
            connected = await countCallParticipants(roomName, [currentSession.userAId, currentSession.userBId]);
          } catch (error) {
            logger.warn('Handshake presence could not be verified; retrying', { service: 'signaling', event: 'handshake_presence_unavailable', roomName }, error);
            scheduleConnectionHandshakeTimer(roomName, 30, effectiveBot ?? undefined, effectiveIo ?? undefined);
            return;
          }
          if (connected === 2) {
            const elapsed = Math.floor((Date.now() - currentSession.createdAt.getTime()) / 1000);
            const remaining = Math.max(1, calculateEffectiveCallDuration(currentSession.userA, currentSession.userB) * 60 - elapsed);
            scheduleAuthoritativeSessionTeardown(roomName, remaining, effectiveBot ?? undefined, effectiveIo ?? undefined);
            return;
          }
          // Fewer than two peers connected within 90s; provider has confirmed this.
          const claimed = await prisma.callSession.updateMany({
            where: { id: currentSession.id, status: 'ACTIVE' },
            data: { status: 'CANCELLED', endedAt: new Date(), duration: 0 },
          });
          if (claimed.count !== 1) return;

          await deleteLiveKitRoom(roomName);
          const readySet = activeRoomPeers.get(roomName);
          activeRoomPeers.delete(roomName);
          roomStartedAt.delete(roomName);
          roomDurationLimits.delete(roomName);

          await cleanupDirectCallMessages(roomName, effectiveBot ?? undefined);

          if (effectiveIo) {
            effectiveIo.to(roomName).emit('call_finished', {
              duration: 0,
              reason: 'partner_failed_to_join',
            });
          }

          if (effectiveBot) {
            const userJoined = readySet ? readySet.has(currentSession.userAId) : false;
            const partnerJoined = readySet ? readySet.has(currentSession.userBId) : false;

            if (userJoined && !partnerJoined) {
              await effectiveBot.api.sendMessage(
                currentSession.userA.telegramId.toString(),
                `⚠️ <b>Call Cancelled</b>\n\nYour partner did not connect in time. No call limits were consumed.`,
                { parse_mode: 'HTML' }
              ).catch(() => undefined);
            } else if (partnerJoined && !userJoined) {
              await effectiveBot.api.sendMessage(
                currentSession.userB.telegramId.toString(),
                `⚠️ <b>Call Cancelled</b>\n\nYour partner did not connect in time. No call limits were consumed.`,
                { parse_mode: 'HTML' }
              ).catch(() => undefined);
            }
          }
        });
      } catch (err) {
        logger.error('Connection handshake timeout failed', {
          service: 'signaling',
          event: 'handshake_timeout_error',
          roomName,
        }, err);
      }
    })();
  }, timeoutSeconds * 1000);

  connectionHandshakeTimers.set(roomName, timer);
  return timer;
}

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

export function scheduleAuthoritativeSessionTeardown(
  roomName: string,
  callDurationLimitSeconds: number,
  botInstance?: Bot<MyContext>,
  ioInstance?: Server
): NodeJS.Timeout {
  clearSessionTimer(roomName);
  clearConnectionHandshakeTimer(roomName);
  const effectiveIo = ioInstance ?? globalIo;
  const effectiveBot = botInstance ?? globalBot;

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
          const startTime = roomStartedAt.get(roomName) ?? currentSession.createdAt.getTime();
          const durationSeconds = Math.max(1, Math.floor((endedAt.getTime() - startTime) / 1000));
          const claimed = await completeCallSession(currentSession.id, { endedAt, duration: durationSeconds });
          if (claimed.count !== 1) return;

          const egress = activeEgresses.get(roomName);
          const egressId = egress?.egressId ?? currentSession.egressId;
          const recordingUrl = egress?.relativeUrl || currentSession.recordingUrl || undefined;
          if (egressId) {
            try {
              await stopAudioEgress(egressId);
            } catch (error: unknown) {
              logger.error('Timeout egress stop failed', {
                service: 'signaling',
                event: 'timeout_egress_stop_failed',
                roomName,
                egressId,
              }, error);
            }
          }
          activeEgresses.delete(roomName);

          const isUserARecorder = Boolean(recordingUrl && isUserSessionRecorder(currentSession.recordedByUserId, currentSession.userAId));
          const isUserBRecorder = Boolean(recordingUrl && isUserSessionRecorder(currentSession.recordedByUserId, currentSession.userBId));
          const retentionA = isUserARecorder ? getEffectiveEntitlement(currentSession.userA).retentionDays : 0;
          const retentionB = isUserBRecorder ? getEffectiveEntitlement(currentSession.userB).retentionDays : 0;
          const maxRetention = Math.max(retentionA, retentionB, 1);
          const recordingExpiresAt = (recordingUrl && (isUserARecorder || isUserBRecorder))
            ? new Date(Date.now() + maxRetention * 24 * 60 * 60 * 1000)
            : null;

          await prisma.callSession.update({
            where: { id: currentSession.id },
            data: { egressId: egressId ?? null, recordingUrl: recordingUrl ?? null, recordingExpiresAt },
          });

          clearSessionTimer(roomName);
          clearConnectionHandshakeTimer(roomName);
          roomStartedAt.delete(roomName);
          activeRoomPeers.delete(roomName);
          roomDurationLimits.delete(roomName);

          await deleteLiveKitRoom(roomName);
          await cleanupDirectCallMessages(roomName, effectiveBot ?? undefined);

          if (effectiveIo) {
            effectiveIo.to(roomName).emit('call_finished', {
              duration: durationSeconds,
              reason: 'call_duration_limit_reached',
            });
          }

          wakePostCallWorker();
        });
      } catch (timeoutErr) {
        logger.error('Server duration timeout execution failed', {
          service: 'signaling',
          event: 'duration_timeout_error',
        }, timeoutErr);
      }
    })();
  }, callDurationLimitSeconds * 1000);

  serverSessionTimers.set(roomName, timer);
  return timer;
}

export function setupSocketSignaling(io: Server, bot?: Bot<MyContext>): void {
  globalIo = io;
  if (bot) globalBot = bot;

  const addUserSocket = (userId: string, socketId: string): void => {
    const sockets = userSockets.get(userId) ?? new Set<string>();
    sockets.add(socketId);
    userSockets.set(userId, sockets);

    // Cancel any active disconnect grace timer if user reconnected
    const graceTimer = disconnectGraceTimers.get(userId);
    if (graceTimer) {
      clearTimeout(graceTimer);
      disconnectGraceTimers.delete(userId);
      logger.info(`User ${userId} reconnected within grace period. Cancelled session teardown.`);

      void prisma.callSession.findMany({
        where: {
          status: 'ACTIVE',
          OR: [{ userAId: userId }, { userBId: userId }],
        },
      }).then((sessions) => {
        for (const s of sessions) {
          io.to(s.roomName).emit('partner_reconnected', {
            userId,
            reconnectedAt: new Date().toISOString(),
          });
        }
      }).catch(() => undefined);
    }
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
      if (socket && socket.connected) return socket as Socket;
    }
    return undefined;
  };

  io.use(async (socket: Socket, next) => {
    const traceId =
      (typeof socket.handshake.auth?.traceId === 'string' && socket.handshake.auth.traceId.trim()) ||
      (typeof socket.handshake.headers['x-trace-id'] === 'string' && (socket.handshake.headers['x-trace-id'] as string).trim()) ||
      (typeof socket.handshake.headers['x-request-id'] === 'string' && (socket.handshake.headers['x-request-id'] as string).trim()) ||
      crypto.randomUUID();

    socket.data.traceId = traceId;
    socket.data.socketId = socket.id;

    try {
      const authToken = socket.handshake.auth?.token;
      const headerToken = socket.handshake.headers['x-telegram-init-data'];
      const token = typeof authToken === 'string' ? authToken : typeof headerToken === 'string' ? headerToken : undefined;

      if (env.NODE_ENV === 'test' && (token === 'test-allowed' || socket.handshake.auth?.userId)) {
        socket.data.userId = socket.handshake.auth?.userId || 'test_user_id';
        socket.data.telegramId = socket.handshake.auth?.telegramId || '12345678';
        logger.info('Socket test authentication successful', {
          service: 'signaling',
          event: 'socket:auth_success',
          socketId: socket.id,
          userId: socket.data.userId,
          traceId,
        });
        next();
        return;
      }

      if (!token) {
        logger.warn('Socket authentication rejected: Missing initData token', {
          service: 'signaling',
          event: 'socket:auth_missing_token',
          socketId: socket.id,
          traceId,
        });
        next(new Error('Authentication failed: Missing initData token.'));
        return;
      }

      const { valid, user: tgUser } = validateTelegramInitData(token, env.BOT_TOKEN);
      if (!valid || !tgUser) {
        logger.warn('Socket authentication rejected: Invalid initData signature', {
          service: 'signaling',
          event: 'socket:auth_invalid_signature',
          socketId: socket.id,
          traceId,
        });
        next(new Error('Authentication failed: Invalid initData signature.'));
        return;
      }

      const dbUser = await prisma.user.findUnique({ where: { telegramId: tgUser.id } });
      if (!dbUser) {
        logger.warn('Socket authentication rejected: User profile not found', {
          service: 'signaling',
          event: 'socket:auth_user_not_found',
          socketId: socket.id,
          telegramId: tgUser.id.toString(),
          traceId,
        });
        next(new Error('Authentication failed: User profile not found. Please type /start in Telegram.'));
        return;
      }

      socket.data.userId = dbUser.id;
      socket.data.telegramId = dbUser.telegramId.toString();
      logger.info('Socket authenticated successfully', {
        service: 'signaling',
        event: 'socket:auth_success',
        socketId: socket.id,
        userId: dbUser.id,
        traceId,
      });
      next();
    } catch (error: unknown) {
      logger.error('Socket authentication exception', {
        service: 'signaling',
        event: 'socket:auth_failed',
        socketId: socket.id,
        traceId,
      }, error);
      next(new Error('Authentication error.'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const userId = socket.data.userId as string | undefined;
    const traceId = socket.data.traceId as string || socket.id;

    socket.use(([event, payload, ..._rest], next) => {
      const eventPayload = typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>) : undefined;
      const eventRequestId = (typeof eventPayload?.requestId === 'string' && eventPayload.requestId.trim()) || crypto.randomUUID();
      socket.data.currentRequestId = eventRequestId;
      logger.debug(`Socket event: ${event}`, {
        service: 'signaling',
        event: `socket:${event}`,
        socketId: socket.id,
        userId: socket.data.userId,
        traceId: socket.data.traceId,
        requestId: eventRequestId,
      });
      next();
    });

    if (userId) {
      addUserSocket(userId, socket.id);

      // Auto-reconnect active calls immediately on socket connect
      void (async () => {
        try {
          const activeCall = await prisma.callSession.findFirst({
            where: {
              status: 'ACTIVE',
              OR: [{ userAId: userId }, { userBId: userId }],
            },
            orderBy: { createdAt: 'desc' },
            include: { userA: true, userB: true },
          });

          if (activeCall) {
            const isUserA = activeCall.userAId === userId;
            const selfUser = isUserA ? activeCall.userA : activeCall.userB;
            const partnerUser = isUserA ? activeCall.userB : activeCall.userA;
            const callDurationLimitMinutes = calculateEffectiveCallDuration(selfUser, partnerUser);
            const callDurationLimitSeconds = callDurationLimitMinutes * 60;
            const startedAt = roomStartedAt.get(activeCall.roomName);
            const startTime = startedAt ?? activeCall.createdAt.getTime();
            const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
            const remainingSeconds = Math.max(1, callDurationLimitSeconds - elapsedSeconds);

            if (elapsedSeconds < callDurationLimitSeconds) {
              const tokenTtlSeconds = Math.min(7200, Math.max(60, remainingSeconds + 300));
              const token = await generateLiveKitToken(activeCall.roomName, selfUser.id, selfUser.alias, tokenTtlSeconds);
              socket.join(activeCall.roomName);
              socket.emit('match_found', {
                roomName: activeCall.roomName,
                partnerId: partnerUser.id,
                partnerAlias: partnerUser.alias,
                partnerBand: partnerUser.band,
                token,
                livekitToken: token,
                livekitUrl: env.LIVEKIT_HOST,
                callDurationLimit: remainingSeconds,
                maxDurationSeconds: callDurationLimitSeconds,
              });
              if (startedAt) {
                socket.emit('call_started', {
                  startedAt,
                  durationSeconds: callDurationLimitSeconds,
                  expiresAt: startedAt + (callDurationLimitSeconds * 1000),
                });
              }
              logger.info('Active call auto-reconnected on socket connect', {
                service: 'signaling',
                event: 'socket:auto_reconnect',
                socketId: socket.id,
                userId,
                roomName: activeCall.roomName,
                traceId,
              });
            }
          }
        } catch (reconnectErr) {
          logger.warn('Auto-reconnect check failed', {
            service: 'signaling',
            event: 'socket:auto_reconnect_failed',
            socketId: socket.id,
            userId,
            traceId,
          }, reconnectErr);
        }
      })();
    }

    logger.info('Socket connected', {
      service: 'signaling',
      event: 'socket:connected',
      socketId: socket.id,
      userId,
      traceId,
    });

    // WebRTC direct signaling events
    socket.on('offer', (payload: any) => {
      if (!payload || typeof payload !== 'object' || !payload.roomName) return;
      const requestId = (typeof payload.requestId === 'string' && payload.requestId.trim()) || socket.data.currentRequestId || crypto.randomUUID();
      socket.to(payload.roomName).emit('offer', { ...payload, senderId: socket.data.userId, traceId: socket.data.traceId, requestId });
      logger.debug('WebRTC offer forwarded', {
        service: 'signaling',
        event: 'webrtc:offer',
        socketId: socket.id,
        userId: socket.data.userId,
        traceId: socket.data.traceId,
        requestId,
        roomName: payload.roomName,
      });
    });

    socket.on('answer', (payload: any) => {
      if (!payload || typeof payload !== 'object' || !payload.roomName) return;
      const requestId = (typeof payload.requestId === 'string' && payload.requestId.trim()) || socket.data.currentRequestId || crypto.randomUUID();
      socket.to(payload.roomName).emit('answer', { ...payload, senderId: socket.data.userId, traceId: socket.data.traceId, requestId });
      logger.debug('WebRTC answer forwarded', {
        service: 'signaling',
        event: 'webrtc:answer',
        socketId: socket.id,
        userId: socket.data.userId,
        traceId: socket.data.traceId,
        requestId,
        roomName: payload.roomName,
      });
    });

    socket.on('candidate', (payload: any) => {
      if (!payload || typeof payload !== 'object' || !payload.roomName) return;
      const requestId = (typeof payload.requestId === 'string' && payload.requestId.trim()) || socket.data.currentRequestId || crypto.randomUUID();
      socket.to(payload.roomName).emit('candidate', { ...payload, senderId: socket.data.userId, traceId: socket.data.traceId, requestId });
      logger.debug('WebRTC candidate forwarded', {
        service: 'signaling',
        event: 'webrtc:candidate',
        socketId: socket.id,
        userId: socket.data.userId,
        traceId: socket.data.traceId,
        requestId,
        roomName: payload.roomName,
      });
    });

    socket.on('leave', (payload: any) => {
      if (!payload || typeof payload !== 'object' || !payload.roomName) return;
      const requestId = (typeof payload.requestId === 'string' && payload.requestId.trim()) || socket.data.currentRequestId || crypto.randomUUID();
      socket.to(payload.roomName).emit('leave', { senderId: socket.data.userId, roomName: payload.roomName, traceId: socket.data.traceId, requestId });
      logger.info('WebRTC leave forwarded', {
        service: 'signaling',
        event: 'webrtc:leave',
        socketId: socket.id,
        userId: socket.data.userId,
        traceId: socket.data.traceId,
        requestId,
        roomName: payload.roomName,
      });
    });

    socket.on('join_queue', async () => {
      const currentUserId = socket.data.userId as string | undefined;
      if (!currentUserId) {
        socket.emit('error', { message: 'Unauthenticated socket session.' });
        return;
      }

      const rlResult = await checkRateLimit('MATCH_JOIN', currentUserId);
      if (!rlResult.allowed) {
        socket.emit('error', {
          code: 'RATE_LIMITED',
          message: rlResult.error?.message || 'Too many requests. Please wait a moment.',
          retryAfterSeconds: rlResult.retryAfterSeconds,
        });
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
            user.isPermanentlyBanned ||
            (user.isBanned && (!user.bannedUntil || new Date(user.bannedUntil) > new Date()));
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
            const maxDurationMinutes = calculateEffectiveCallDuration(activeCall.userA, activeCall.userB);
            const maxDurationMs = maxDurationMinutes * 60 * 1000 + 60 * 1000;
            const elapsedMs = Date.now() - activeCall.createdAt.getTime();
            if (elapsedMs > maxDurationMs) {
              await completeCallSession(activeCall.id, { endedAt: new Date(), duration: maxDurationMinutes * 60 });
              clearSessionTimer(activeCall.roomName);
            } else {
              socket.emit('error', {
                code: 'CALL_ALREADY_ACTIVE',
                message: 'Another session is currently in an active call from this account. Please try again later.',
              });
              return;
            }
          }

          // Check monthly call quota before queue entry using Effective Entitlements
          const entitlement = getEffectiveEntitlement(user);
          const callsUsed = await getUserCallsUsedThisPeriod(user.id, user);
          const activeBonusCalls = await getActiveBonusCallsCount(user.id);
          if (!entitlement.isAdmin && callsUsed >= entitlement.callLimit && activeBonusCalls <= 0) {
            socket.emit('error', {
              code: 'MATCHMAKING_QUOTA_EXCEEDED',
              message: `You have reached your monthly limit of ${entitlement.callLimit} calls. Invite friends with '👥 Invite Friends' to earn bonus calls or upgrade your plan!`,
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
            await matchmakingService.restoreQueue(user.id, ownBucket, { band: user.band, plan: user.plan }).catch((error: unknown) => {
              logger.error('Match requeue failed for user', {
                service: 'signaling',
                event: 'match_requeue_failed',
                userId: user.id,
              }, error);
            });
            socket.emit('queue_joined', { status: 'searching' });
            return;
          }

          const callDurationLimitMinutes = calculateEffectiveCallDuration(user, partner);
          const callDurationLimitSeconds = callDurationLimitMinutes * 60;
          const tokenTtlSeconds = Math.min(7200, Math.max(60, callDurationLimitSeconds + 300));
          const roomName = matchResult.roomName;

          let transactionSucceeded = false;
          try {
            await admitCall(user.id, partner.id, roomName, 'ACTIVE');
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

            // Defer authoritative duration teardown until both peers send peer_ready;
            // schedule a 90s connection handshake timer to cancel cleanly if a peer fails to join.
            setRoomDurationLimit(roomName, callDurationLimitSeconds);
            scheduleConnectionHandshakeTimer(roomName, 90, bot, io);

            userSocket.emit('match_found', {
              partnerId: partner.id,
              partnerAlias: partner.alias,
              partnerBand: partner.band,
              roomName,
              token: tokenUser,
              livekitToken: tokenUser,
              livekitUrl: env.LIVEKIT_HOST,
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
              livekitUrl: env.LIVEKIT_HOST,
              callDurationLimit: callDurationLimitSeconds,
              maxDurationSeconds: callDurationLimitSeconds,
            });
          } catch (error: unknown) {
            logger.error('Match dispatch failed', {
              service: 'signaling',
              event: 'match_dispatch_failed',
              userId: user.id,
              partnerId: partner.id,
              roomName,
              transactionSucceeded,
            }, error);

            if (transactionSucceeded) {
              await prisma.callSession.updateMany({
                where: { roomName, status: 'ACTIVE' },
                data: { status: 'CANCELLED' },
              });
            }

            const userStillConnected = getConnectedSocket(user.id);
            if (userStillConnected) {
              const ownBucket = getUserBucket(user);
              await matchmakingService.restoreQueue(user.id, ownBucket, { band: user.band, plan: user.plan }).catch((restoreError: unknown) => {
                logger.error('Own restore queue failed', {
                  service: 'signaling',
                  event: 'own_restore_failed',
                  userId: user.id,
                }, restoreError);
              });
              userStillConnected.emit('queue_joined', { status: 'searching' });
            }

            const partnerStillConnected = getConnectedSocket(partner.id);
            if (partnerStillConnected) {
              const partnerBucket = getUserBucket(partner);
              await matchmakingService.restoreQueue(partner.id, partnerBucket, { band: partner.band, plan: partner.plan }).catch((restoreError: unknown) => {
                logger.error('Partner restore queue failed', {
                  service: 'signaling',
                  event: 'partner_restore_failed',
                  userId: partner.id,
                }, restoreError);
              });
              partnerStillConnected.emit('queue_joined', { status: 'searching' });
            }
          }
        });
      } catch (error: unknown) {
        logger.error('Join queue failed', {
          service: 'signaling',
          event: 'join_queue_failed',
          userId: currentUserId,
        }, error);
        socket.emit('error', { message: 'Failed to join matchmaking queue.' });
      }
    });

    socket.on('cancel_queue', async () => {
      const currentUserId = socket.data.userId as string | undefined;
      if (!currentUserId) return;

      const rlResult = await checkRateLimit('MATCH_CANCEL', currentUserId);
      if (!rlResult.allowed) {
        socket.emit('error', {
          code: 'RATE_LIMITED',
          message: rlResult.error?.message || 'Too many requests. Please wait a moment.',
          retryAfterSeconds: rlResult.retryAfterSeconds,
        });
        return;
      }

      try {
        if ((userSockets.get(currentUserId)?.size ?? 0) <= 1) {
          await matchmakingService.cancelQueue(currentUserId);
        }
        socket.emit('queue_cancelled', { success: true });
      } catch (error: unknown) {
        logger.error('Cancel queue failed', {
          service: 'signaling',
          event: 'cancel_queue_failed',
          userId: currentUserId,
        }, error);
        socket.emit('error', { message: 'Failed to cancel matchmaking.' });
      }
    });

    socket.on('peer_ready', async (payload: unknown) => {
      if (!isPeerReadyPayload(payload)) {
        return;
      }
      const requesterId = socket.data.userId as string | undefined;
      if (!requesterId) {
        return;
      }

      const roomName = payload.roomName;
      let peers = activeRoomPeers.get(roomName);
      if (!peers) {
        peers = new Set<string>();
        activeRoomPeers.set(roomName, peers);
      }
      peers.add(requesterId);

      // When both peers have joined and sent peer_ready, start the synchronized call
      if (peers.size >= 2 && !roomStartedAt.has(roomName)) {
        clearConnectionHandshakeTimer(roomName);
        const startedAt = Date.now();
        roomStartedAt.set(roomName, startedAt);

        let durationLimitSeconds = roomDurationLimits.get(roomName);
        if (!durationLimitSeconds) {
          const session = await prisma.callSession.findUnique({
            where: { roomName },
            include: { userA: true, userB: true },
          });
          if (session?.userA && session?.userB) {
            durationLimitSeconds = calculateEffectiveCallDuration(session.userA, session.userB) * 60;
          } else {
            durationLimitSeconds = 15 * 60;
          }
          roomDurationLimits.set(roomName, durationLimitSeconds);
        }

        // Authoritative server duration teardown starts now
        scheduleAuthoritativeSessionTeardown(roomName, durationLimitSeconds, bot, io);

        // Notify both clients with exact synchronized timestamp
        io.to(roomName).emit('call_started', {
          startedAt,
          durationSeconds: durationLimitSeconds,
          expiresAt: startedAt + (durationLimitSeconds * 1000),
        });

        // Clean up direct call messages as both parties have joined
        await cleanupDirectCallMessages(roomName, bot).catch(() => undefined);
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

      const rlResult = await checkRateLimit(payload.record ? 'RECORD_START' : 'RECORD_STOP', requesterId);
      if (!rlResult.allowed) {
        socket.emit('recording_error', {
          code: 'RATE_LIMITED',
          message: 'Too many recording requests. Please wait a moment.',
        });
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
            const user = await prisma.user.findUnique({ where: { id: requesterId } });
            const entitlement = getEffectiveEntitlement(user || {});
            const recordingsUsed = await getUserRecordingsUsedThisPeriod(requesterId, user);
            if (!entitlement.isAdmin && recordingsUsed >= entitlement.recordingLimit) {
              socket.emit('record_status', { record: false });
              socket.emit('recording_error', {
                code: 'RECORDING_LIMIT_REACHED',
                message: 'Your recording limit for this period has been reached.',
              });
              return;
            }

            if (session.egressId) {
              activeEgresses.set(payload.roomName, {
                egressId: session.egressId,
                relativeUrl: session.recordingUrl ?? '',
              });
              const newRecorders = addSessionRecorder(session.recordedByUserId, requesterId);
              await prisma.callSession.updateMany({
                where: { id: session.id, status: 'ACTIVE' },
                data: { recordedByUserId: newRecorders },
              });
              socket.emit('record_status', { record: true });
              return;
            }

            try {
              const egress = await startAudioEgress(payload.roomName);
              const newRecorders = addSessionRecorder(session.recordedByUserId, requesterId);
              const updated = await prisma.callSession.updateMany({
                where: { id: session.id, status: 'ACTIVE', egressId: null },
                data: { egressId: egress.egressId, recordingUrl: egress.relativeUrl, recordedByUserId: newRecorders },
              });
              if (updated.count !== 1) {
                await stopAudioEgress(egress.egressId).catch((error: unknown) => {
                  logger.error('Rollback egress stop failed', {
                    service: 'signaling',
                    event: 'rollback_egress_stop_failed',
                    roomName: payload.roomName,
                  }, error);
                });
                return;
              }

              activeEgresses.set(payload.roomName, egress);
              socket.emit('record_status', { record: true });
              return;
            } catch (egressErr) {
              logger.warn('Recording start failed gracefully', {
                service: 'signaling',
                event: 'recording_start_failed',
                roomName: payload.roomName,
              }, egressErr);
              socket.emit('record_status', { record: false });
              socket.emit('recording_error', {
                code: 'RECORDING_UNAVAILABLE',
                message: 'Audio recording is temporarily unavailable. Your voice call can proceed normally.',
              });
              return;
            }
          }

          // If turning record OFF:
          const newRecorders = removeSessionRecorder(session.recordedByUserId, requesterId);
          if (newRecorders !== null) {
            // Partner is still recording, so keep egress alive and just remove this requester
            await prisma.callSession.updateMany({
              where: { id: session.id, status: 'ACTIVE' },
              data: { recordedByUserId: newRecorders },
            });
            socket.emit('record_status', { record: false });
            return;
          }

          // No recorders left; stop egress
          const egressId = session.egressId ?? activeEgresses.get(payload.roomName)?.egressId;
          if (egressId) {
            try {
              await stopAudioEgress(egressId);
            } catch {}
            await prisma.callSession.updateMany({
              where: { id: session.id, status: 'ACTIVE', egressId },
              data: { egressId: null, recordedByUserId: null },
            });
            activeEgresses.delete(payload.roomName);
          }
          socket.emit('record_status', { record: false });
        });
      } catch (error: unknown) {
        logger.error('Toggle record failed', {
          service: 'signaling',
          event: 'toggle_record_failed',
          roomName: payload.roomName,
          requesterId,
        }, error);
        socket.emit('recording_error', { code: 'RECORDING_UNAVAILABLE', message: 'Unable to update recording status.' });
        socket.emit('record_status', { record: false });
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

      const rlResult = await checkRateLimit('FINISH_CALL', requesterId);
      if (!rlResult.allowed) {
        socket.emit('error', { message: 'Too many requests. Please wait a moment.' });
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

          if (session.status !== 'ACTIVE') {
            socket.emit('call_finished', { duration: session.duration ?? 0 });
            return;
          }

          const endedAt = new Date();
          const startTime = roomStartedAt.get(payload.roomName) ?? session.createdAt.getTime();
          const durationSeconds = Math.max(1, Math.floor((endedAt.getTime() - startTime) / 1000));
          const claimed = await completeCallSession(session.id, {
            endedAt, duration: durationSeconds, charge: payload.reason !== 'microphone_permission_denied',
            reason: payload.reason, deniedUserId: payload.reason === 'microphone_permission_denied' ? requesterId : undefined,
          });
          if (claimed.count !== 1) {
            socket.emit('call_finished', { duration: session.duration ?? 0 });
            return;
          }

          clearSessionTimer(payload.roomName);
          clearConnectionHandshakeTimer(payload.roomName);

          const egress = activeEgresses.get(payload.roomName);
          const egressId = egress?.egressId ?? session.egressId;
          const recordingUrl = egress?.relativeUrl || session.recordingUrl || undefined;
          if (egressId) {
            try {
              await stopAudioEgress(egressId);
            } catch (error: unknown) {
              logger.error('Finish call egress stop failed', {
                service: 'signaling',
                event: 'finish_egress_stop_failed',
                roomName: payload.roomName,
                egressId,
              }, error);
            }
          }
          activeEgresses.delete(payload.roomName);

          const isUserARecorder = Boolean(recordingUrl && isUserSessionRecorder(session.recordedByUserId, session.userAId));
          const isUserBRecorder = Boolean(recordingUrl && isUserSessionRecorder(session.recordedByUserId, session.userBId));
          const retentionA = isUserARecorder ? getEffectiveEntitlement(session.userA).retentionDays : 0;
          const retentionB = isUserBRecorder ? getEffectiveEntitlement(session.userB).retentionDays : 0;
          const maxRetention = Math.max(retentionA, retentionB, 1);
          const recordingExpiresAt = (recordingUrl && (isUserARecorder || isUserBRecorder))
            ? new Date(Date.now() + maxRetention * 24 * 60 * 60 * 1000)
            : null;

          await prisma.callSession.update({
            where: { id: session.id },
            data: { egressId: egressId ?? null, recordingUrl: recordingUrl ?? null, recordingExpiresAt },
          });

          await deleteLiveKitRoom(payload.roomName);
          roomStartedAt.delete(payload.roomName);
          activeRoomPeers.delete(payload.roomName);
          roomDurationLimits.delete(payload.roomName);
          await cleanupDirectCallMessages(payload.roomName, bot).catch(() => undefined);

          io.to(payload.roomName).emit('call_finished', { duration: durationSeconds });

          wakePostCallWorker();
        });
      } catch (error: unknown) {
        logger.error('Finish call failed', {
          service: 'signaling',
          event: 'finish_call_failed',
          roomName: payload.roomName,
          requesterId,
        }, error);
        socket.emit('error', { message: 'Failed to finish call.' });
      }
    });

    socket.on('disconnect', (reason: string) => {
      void (async (): Promise<void> => {
        const disconnectedUserId = socket.data.userId as string | undefined;
        if (!disconnectedUserId) return;

        const disconnectTimestamp = Date.now();

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

          // Notify the room that temporary connection was interrupted and grace timer has started
          for (const session of activeSessions) {
            io.to(session.roomName).emit('partner_connection_lost', {
              userId: disconnectedUserId,
              gracePeriodSec: 15,
            });
          }

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

                  const startTime = roomStartedAt.get(session.roomName) ?? currentSession.createdAt.getTime();
                  const durationSeconds = Math.max(0, Math.floor((disconnectTimestamp - startTime) / 1000));
                  const isCancelled = durationSeconds < 5;
                  const endedAt = new Date(disconnectTimestamp);

                  const egress = activeEgresses.get(session.roomName);
                  const egressId = egress?.egressId ?? currentSession.egressId;
                  const recordingUrl = egress?.relativeUrl || currentSession.recordingUrl || undefined;

                  const isUserARecorder = Boolean(recordingUrl && isUserSessionRecorder(currentSession.recordedByUserId, currentSession.userAId));
                  const isUserBRecorder = Boolean(recordingUrl && isUserSessionRecorder(currentSession.recordedByUserId, currentSession.userBId));
                  const retentionA = isUserARecorder ? getEffectiveEntitlement(currentSession.userA).retentionDays : 0;
                  const retentionB = isUserBRecorder ? getEffectiveEntitlement(currentSession.userB).retentionDays : 0;
                  const maxRetention = Math.max(retentionA, retentionB, 1);
                  const recordingExpiresAt = (recordingUrl && (isUserARecorder || isUserBRecorder))
                    ? new Date(Date.now() + maxRetention * 24 * 60 * 60 * 1000)
                    : null;

                  const claimed = await completeCallSession(session.id, {
                      status: isCancelled ? 'CANCELLED' : 'COMPLETED',
                      endedAt,
                      duration: durationSeconds,
                      egressId: egressId ?? null,
                      recordingUrl: recordingUrl ?? null,
                      recordingExpiresAt,
                  });
                  if (claimed.count !== 1) return;
                  if (egressId) {
                    await stopAudioEgress(egressId).catch((stopErr: unknown) => {
                      logger.error('Disconnect egress stop failed', {
                        service: 'signaling', event: 'disconnect_egress_stop_failed', roomName: session.roomName,
                      }, stopErr);
                    });
                  }
                  activeEgresses.delete(session.roomName);

                  clearSessionTimer(session.roomName);
                  clearConnectionHandshakeTimer(session.roomName);
                  roomStartedAt.delete(session.roomName);
                  activeRoomPeers.delete(session.roomName);
                  roomDurationLimits.delete(session.roomName);
                  await deleteLiveKitRoom(session.roomName);
                  await cleanupDirectCallMessages(session.roomName, bot).catch(() => undefined);

                  io.to(session.roomName).emit('call_finished', {
                    duration: durationSeconds,
                    reason: isCancelled ? 'call_cancelled' : 'partner_disconnected',
                  });

                  wakePostCallWorker();
                });
              } catch (error: unknown) {
                logger.error('Disconnect session cleanup failed', {
                  service: 'signaling',
                  event: 'disconnect_session_cleanup_failed',
                  roomName: session.roomName,
                }, error);
              }
            }
          }, 15000);

          disconnectGraceTimers.set(disconnectedUserId, graceTimer);
        } catch (error: unknown) {
          logger.error('Disconnect handler failed', {
            service: 'signaling',
            event: 'disconnect_handler_failed',
            userId: disconnectedUserId,
            reason,
          }, error);
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
        if (!session.userA || !session.userB) {
          logger.warn('Cleaning up active session with missing participant records', {
            service: 'signaling',
            event: 'reconcile_orphan_session_cleaned',
            sessionId: session.id,
            roomName: session.roomName,
          });
          await prisma.callSession.update({
            where: { id: session.id },
            data: { status: 'CANCELLED', endedAt: new Date() },
          }).catch(() => undefined);
          await deleteLiveKitRoom(session.roomName).catch(() => undefined);
          continue;
        }

        const callDurationLimitMinutes = calculateEffectiveCallDuration(session.userA, session.userB);
        const callDurationLimitSeconds = callDurationLimitMinutes * 60;
        const elapsedSeconds = Math.floor((now - session.createdAt.getTime()) / 1000);
        const remainingSeconds = Math.max(1, callDurationLimitSeconds - elapsedSeconds);

        if (elapsedSeconds >= callDurationLimitSeconds) {
          const endedAt = new Date();
          const claimed = await completeCallSession(session.id, { endedAt, duration: elapsedSeconds });
          if (claimed.count !== 1) continue;
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
                  const claimed = await completeCallSession(session.id, { endedAt, duration: durationSeconds });
                  if (claimed.count !== 1) return;

                  clearSessionTimer(session.roomName);
                  await deleteLiveKitRoom(session.roomName);
                  io.to(session.roomName).emit('call_finished', { duration: durationSeconds, reason: 'call_duration_limit_reached' });
                });
              } catch (timeoutErr) {
                logger.error('Reconciled call timeout execution failed', {
                  service: 'signaling',
                  event: 'reconciled_call_timeout_error',
                  roomName: session.roomName,
                }, timeoutErr);
              }
            })();
          }, remainingSeconds * 1000);

          serverSessionTimers.set(session.roomName, timer);
        }
      }
      logger.info(`Reconciled ${activeSessions.length} active call sessions on startup.`, {
        service: 'signaling',
        event: 'active_sessions_reconciled',
        count: activeSessions.length,
      });
    } catch (reconcileErr) {
      logger.error('Failed to reconcile active sessions on startup', {
        service: 'signaling',
        event: 'active_sessions_reconcile_failed',
      }, reconcileErr);
    }
  })();
}

export async function sweepZombieSessions(io?: Server, bot?: Bot<MyContext>): Promise<number> {
  const effectiveIo = io ?? globalIo;
  const effectiveBot = bot ?? globalBot;

  try {
    const now = Date.now();
    let sweptCount = 0;

    // 0. Sweep stale PENDING direct call sessions older than 2 minutes
    try {
      const stalePendingSessions = await prisma.callSession.findMany({
        where: {
          status: 'PENDING',
          createdAt: { lt: new Date(now - 2 * 60 * 1000) },
        },
      });

      for (const pending of stalePendingSessions) {
        const updated = await prisma.callSession.updateMany({
          where: { id: pending.id, status: 'PENDING' },
          data: { status: 'CANCELLED', endedAt: new Date(), duration: 0 },
        });
        if (updated.count > 0) sweptCount++;
      }
    } catch (pendingErr) {
      logger.warn('Failed to sweep stale pending sessions', {
        service: 'signaling',
        event: 'sweep_pending_failed',
      }, pendingErr);
    }

    const activeSessions = await prisma.callSession.findMany({
      where: { status: 'ACTIVE' },
      include: { userA: true, userB: true },
    });

    if (activeSessions.length === 0) return sweptCount;

    for (const session of activeSessions) {
      try {
        const maxDurationMinutes = calculateEffectiveCallDuration(session.userA, session.userB);
        const maxDurationMs = maxDurationMinutes * 60 * 1000;
        const elapsedMs = now - session.createdAt.getTime();
        const elapsedSeconds = Math.max(0, Math.floor(elapsedMs / 1000));

        // 1. Condition: createdAt < now - maxDuration - 5 minutes
        const isPastMaxDurationWithMargin = elapsedMs > (maxDurationMs + 5 * 60 * 1000);

        // 2. Condition: both participants disconnected
        // Preserve the complete 90-second connection-handshake window.
        let bothParticipantsDisconnected = false;
        if (elapsedMs >= 90_000) {
          let roomSocketsCount = 0;
          if (effectiveIo) {
            try {
              const sockets = await effectiveIo.in(session.roomName).fetchSockets();
              roomSocketsCount = sockets.length;
            } catch {
              const userASockets = userSockets.get(session.userAId)?.size ?? 0;
              const userBSockets = userSockets.get(session.userBId)?.size ?? 0;
              roomSocketsCount = userASockets + userBSockets;
            }
          } else {
            const userASockets = userSockets.get(session.userAId)?.size ?? 0;
            const userBSockets = userSockets.get(session.userBId)?.size ?? 0;
            roomSocketsCount = userASockets + userBSockets;
          }

          const isGraceA = disconnectGraceTimers.has(session.userAId);
          const isGraceB = disconnectGraceTimers.has(session.userBId);
          bothParticipantsDisconnected = roomSocketsCount === 0 && !isGraceA && !isGraceB;
        }

        if (!isPastMaxDurationWithMargin && !bothParticipantsDisconnected) {
          continue;
        }
        if (!isPastMaxDurationWithMargin && await areCallParticipantsPresent(session.roomName, [session.userAId, session.userBId])) continue;

        await runSerialized(roomOperationTails, session.roomName, async () => {
          const current = await prisma.callSession.findUnique({
            where: { id: session.id },
          });
          if (!current || current.status !== 'ACTIVE') return;

          const endedAt = new Date();
          // If past max duration with margin, call completed full entitlement -> COMPLETED.
          // Otherwise, if both dropped, call was interrupted/abandoned -> CANCELLED to protect call quotas.
          const isCompleted = isPastMaxDurationWithMargin;
          const targetStatus = isCompleted ? 'COMPLETED' : 'CANCELLED';
          const finalDuration = isCompleted ? Math.min(elapsedSeconds, maxDurationMinutes * 60) : 0;

          const claimed = await completeCallSession(session.id, {
              status: targetStatus,
              endedAt,
              duration: finalDuration,
          });

          if (claimed.count !== 1) return;

          clearSessionTimer(session.roomName);

          const egress = activeEgresses.get(session.roomName);
          const egressId = egress?.egressId ?? session.egressId;
          const recordingUrl = egress?.relativeUrl || session.recordingUrl || undefined;

          if (egressId) {
            try {
              await stopAudioEgress(egressId);
            } catch (eErr) {
              logger.warn('Zombie sweeper stop audio egress failed', {
                service: 'signaling',
                event: 'zombie_sweeper_egress_stop_failed',
                roomName: session.roomName,
                egressId,
              }, eErr);
            }
          }
          activeEgresses.delete(session.roomName);

          try {
            await deleteLiveKitRoom(session.roomName);
          } catch (lkErr) {
            logger.warn('Zombie sweeper delete LiveKit room failed', {
              service: 'signaling',
              event: 'zombie_sweeper_delete_room_failed',
              roomName: session.roomName,
            }, lkErr);
          }

          if (recordingUrl) {
            const isUserARecorder = Boolean(isUserSessionRecorder(session.recordedByUserId, session.userAId));
            const isUserBRecorder = Boolean(isUserSessionRecorder(session.recordedByUserId, session.userBId));
            const retentionA = isUserARecorder ? getEffectiveEntitlement(session.userA).retentionDays : 0;
            const retentionB = isUserBRecorder ? getEffectiveEntitlement(session.userB).retentionDays : 0;
            const maxRetention = Math.max(retentionA, retentionB, 1);
            const recordingExpiresAt = (isUserARecorder || isUserBRecorder)
              ? new Date(Date.now() + maxRetention * 24 * 60 * 60 * 1000)
              : null;

            await prisma.callSession.update({
              where: { id: session.id },
              data: {
                egressId: egressId ?? null,
                recordingUrl: recordingUrl ?? null,
                recordingExpiresAt,
              },
            }).catch(() => undefined);
          }

          wakePostCallWorker();

          if (effectiveIo) {
            effectiveIo.to(session.roomName).emit('call_finished', {
              duration: finalDuration,
              reason: isPastMaxDurationWithMargin ? 'call_duration_limit_reached' : 'all_participants_disconnected',
            });
          }

          sweptCount += 1;
          logger.info(`Zombie call session cleaned up safely`, {
            service: 'signaling',
            event: 'zombie_session_cleaned',
            sessionId: session.id,
            roomName: session.roomName,
            status: targetStatus,
            duration: finalDuration,
            reason: isPastMaxDurationWithMargin ? 'max_duration_exceeded' : 'both_participants_disconnected',
          });
        });
      } catch (sessionErr) {
        logger.error('Error sweeping individual zombie session', {
          service: 'signaling',
          event: 'zombie_session_clean_error',
          sessionId: session.id,
          roomName: session.roomName,
        }, sessionErr);
      }
    }

    if (sweptCount > 0) {
      logger.info(`Zombie session sweeper finished run: ${sweptCount} sessions swept.`, {
        service: 'signaling',
        event: 'zombie_sweeper_completed',
        sweptCount,
      });
    }

    return sweptCount;
  } catch (error) {
    logger.error('Zombie session sweeper run failed', {
      service: 'signaling',
      event: 'zombie_sweeper_run_failed',
    }, error);
    return 0;
  }
}

export function startZombieSessionCleaner(io?: Server, bot?: Bot<MyContext>): NodeJS.Timeout {
  if (io) globalIo = io;
  if (bot) globalBot = bot;

  logger.info('Starting 5-minute background zombie call session cleaner...', {
    service: 'signaling',
    event: 'zombie_cleaner_started',
  });

  const interval = setInterval(() => {
    void sweepZombieSessions(io, bot).catch((error) => {
      logger.error('Scheduled zombie session cleaner encountered an error', {
        service: 'signaling',
        event: 'zombie_cleaner_interval_error',
      }, error);
    });
  }, 5 * 60 * 1000);

  if (interval.unref) {
    interval.unref();
  }

  return interval;
}

export const setupSignaling = setupSocketSignaling;
