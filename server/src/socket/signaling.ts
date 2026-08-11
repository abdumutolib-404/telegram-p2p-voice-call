import { Server, Socket } from 'socket.io';
import { matchmakingService } from '../services/matchmaking';
import { calculateMixedPlanDuration, getRetentionDaysForPlan } from '../services/plan';
import { generateLiveKitToken, startAudioEgress, stopAudioEgress } from '../config/livekit';
import { prisma } from '../config/database';
import { moderationService } from '../services/moderation';
import { sendPostCallReviewCard } from '../bot/handlers/postCall';
import { validateTelegramInitData } from '../middleware/initDataLockdown';
import { env } from '../config/env';
import { Bot } from 'grammy';
import { MyContext } from '../bot/types';

export function setupSocketSignaling(io: Server, bot?: Bot<MyContext>) {
  // Socket mapping: userId -> Set<socketId>
  const userSockets = new Map<string, Set<string>>();
  const activeEgresses = new Map<string, { egressId: string; relativeUrl: string }>(); // roomName -> { egressId, relativeUrl }

  function addUserSocket(userId: string, socketId: string) {
    const sockets = userSockets.get(userId) || new Set();
    sockets.add(socketId);
    userSockets.set(userId, sockets);
  }

  function removeUserSocket(userId: string, socketId: string) {
    const sockets = userSockets.get(userId);
    if (sockets) {
      sockets.delete(socketId);
      if (sockets.size === 0) userSockets.delete(userId);
    }
  }

  function getLatestSocketId(userId: string): string | undefined {
    const sockets = userSockets.get(userId);
    if (!sockets || sockets.size === 0) return undefined;
    return Array.from(sockets).pop();
  }

  // Socket Authorization Middleware
  io.use(async (socket: Socket, next) => {
    const token = socket.handshake.auth?.token || (socket.handshake.headers['x-telegram-init-data'] as string);

    if (env.NODE_ENV === 'test' && token === 'test-allowed') {
      socket.data.userId = 'test_user_id';
      socket.data.telegramId = 12345678;
      return next();
    }

    if (!token) {
      return next(new Error('Authentication failed: Missing initData token.'));
    }

    const { valid, user: tgUser } = validateTelegramInitData(token, env.BOT_TOKEN);
    if (!valid || !tgUser) {
      return next(new Error('Authentication failed: Invalid initData signature.'));
    }

    try {
      const telegramId = BigInt(tgUser.id);
      const dbUser = await prisma.user.findUnique({ where: { telegramId } });
      if (!dbUser) {
        return next(new Error('Authentication failed: User profile not found. Please type /start in Telegram.'));
      }

      // Lock down the socket to verified DB user ID
      socket.data.userId = dbUser.id;
      socket.data.telegramId = Number(dbUser.telegramId);
      next();
    } catch (err) {
      next(new Error('Authentication error.'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const userId = socket.data.userId;
    if (userId) {
      addUserSocket(userId, socket.id);
    }

    console.log(`[Socket] Authenticated client connected: socketId=${socket.id}, userId=${userId}`);

    // 1. join_queue
    socket.on('join_queue', async () => {
      const currentUserId = socket.data.userId;
      if (!currentUserId) {
        socket.emit('error', { message: 'Unauthenticated socket session.' });
        return;
      }

      addUserSocket(currentUserId, socket.id);

      try {
        // Ban check
        const banStatus = await moderationService.isUserBanned(currentUserId);
        if (banStatus.banned) {
          socket.emit('error', { message: banStatus.reason || 'User is banned.' });
          return;
        }

        // Fetch user from DB
        const user = await prisma.user.findUnique({ where: { id: currentUserId } });
        if (!user) {
          socket.emit('error', { message: 'User profile not found.' });
          return;
        }

        // Check daily call limit
        const todayStr = new Date().toISOString().split('T')[0];
        let currentDailyUsed = user.dailyCallsUsed;

        if (user.lastCallDate !== todayStr) {
          await prisma.user.update({
            where: { id: user.id },
            data: { dailyCallsUsed: 0, lastCallDate: todayStr },
          });
          currentDailyUsed = 0;
        } else if (currentDailyUsed >= user.dailyLimit) {
          socket.emit('error', {
            message: `Daily call limit reached (${user.dailyLimit}/${user.dailyLimit}). Upgrade plan for more calls!`,
          });
          return;
        }

        const matchResult = await matchmakingService.joinQueue(user.id, user.band, {
          subFC: user.subFC,
          subLR: user.subLR,
          subGRA: user.subGRA,
          subP: user.subP,
        });

        if (matchResult.matched && matchResult.partnerId && matchResult.roomName) {
          const partner = await prisma.user.findUnique({ where: { id: matchResult.partnerId } });
          if (!partner) {
            socket.emit('error', { message: 'Matched partner not found. Retrying...' });
            return;
          }

          // Verify partner socket is still connected
          const partnerSocketId = getLatestSocketId(partner.id);
          const socketPartner = partnerSocketId ? io.sockets.sockets.get(partnerSocketId) : undefined;
          if (!socketPartner) {
            socket.emit('queue_joined', { status: 'searching' });
            await matchmakingService.joinQueue(user.id, user.band, {
              subFC: user.subFC,
              subLR: user.subLR,
              subGRA: user.subGRA,
              subP: user.subP,
            });
            return;
          }

          const roomName = matchResult.roomName;
          const callDurationLimit = calculateMixedPlanDuration(user.plan, partner.plan);

          // Generate tokens with AWAIT
          const tokenUser = await generateLiveKitToken(roomName, user.id, user.alias);
          const tokenPartner = await generateLiveKitToken(roomName, partner.id, partner.alias);

          // Create DB session
          await prisma.callSession.create({
            data: {
              roomName,
              userAId: user.id,
              userBId: partner.id,
              status: 'ACTIVE',
            },
          });

          // Update daily calls used
          await prisma.user.update({
            where: { id: user.id },
            data: { dailyCallsUsed: { increment: 1 } },
          });
          await prisma.user.update({
            where: { id: partner.id },
            data: { dailyCallsUsed: { increment: 1 } },
          });

          // Join sockets to room
          const userSocketId = getLatestSocketId(user.id);
          const socketUser = userSocketId ? io.sockets.sockets.get(userSocketId) : undefined;

          if (socketUser) socketUser.join(roomName);
          if (socketPartner) socketPartner.join(roomName);

          // Emit match_found
          if (socketUser) {
            socketUser.emit('match_found', {
              roomName,
              livekitToken: tokenUser,
              partnerAlias: partner.alias,
              partnerBand: partner.band,
              callDurationLimit,
            });
          }

          if (socketPartner) {
            socketPartner.emit('match_found', {
              roomName,
              livekitToken: tokenPartner,
              partnerAlias: user.alias,
              partnerBand: user.band,
              callDurationLimit,
            });
          }
        } else {
          socket.emit('queue_joined', { status: 'searching' });
        }
      } catch (err) {
        console.error('[Socket] join_queue error:', err);
        socket.emit('error', { message: 'An error occurred while joining the queue. Please try again.' });
      }
    });

    // 2. cancel_queue
    socket.on('cancel_queue', async () => {
      const currentUserId = socket.data.userId;
      if (currentUserId) {
        await matchmakingService.cancelQueue(currentUserId);
        socket.emit('queue_cancelled', { success: true });
      }
    });

    // 3. toggle_record (Authorization check via socket.data.userId)
    socket.on('toggle_record', async (data: { roomName: string; record: boolean }) => {
      const { roomName, record } = data;
      const requesterId = socket.data.userId;

      try {
        const session = await prisma.callSession.findUnique({ where: { roomName } });
        if (!session || (session.userAId !== requesterId && session.userBId !== requesterId)) {
          socket.emit('error', { message: 'Unauthorized: You are not a participant in this call.' });
          return;
        }

        if (record) {
          const egress = await startAudioEgress(roomName);
          activeEgresses.set(roomName, egress);

          await prisma.callSession.update({
            where: { id: session.id },
            data: { egressId: egress.egressId, recordingUrl: egress.relativeUrl },
          });

          io.to(roomName).emit('record_status', { record: true });
        } else {
          const egress = activeEgresses.get(roomName);
          if (egress) {
            await stopAudioEgress(egress.egressId);
            activeEgresses.delete(roomName);
          }

          io.to(roomName).emit('record_status', { record: false });
        }
      } catch (err) {
        console.error('[Socket] toggle_record error:', err);
        socket.emit('error', { message: 'Failed to toggle recording.' });
      }
    });

    // 4. finish_call (Authorization check via socket.data.userId)
    socket.on('finish_call', async (data: { roomName: string }) => {
      const { roomName } = data;
      const requesterId = socket.data.userId;

      try {
        const session = await prisma.callSession.findUnique({
          where: { roomName },
          include: { userA: true, userB: true },
        });

        if (!session || session.status !== 'ACTIVE') return;

        if (session.userAId !== requesterId && session.userBId !== requesterId) {
          socket.emit('error', { message: 'Unauthorized: You are not a participant in this call.' });
          return;
        }

        const endedAt = new Date();
        const durationSeconds = Math.max(1, Math.floor((endedAt.getTime() - session.createdAt.getTime()) / 1000));

        // Stop egress if active
        const egress = activeEgresses.get(roomName);
        let recordingUrl: string | undefined = session.recordingUrl || undefined;
        let recordingExpiresAt: Date | undefined = undefined;

        if (egress) {
          try {
            await stopAudioEgress(egress.egressId);
          } catch (egressErr) {
            console.warn('[Socket] Failed to stop egress:', egressErr);
          }
          activeEgresses.delete(roomName);
          recordingUrl = egress.relativeUrl;

          const maxRetentionDays = Math.max(
            getRetentionDaysForPlan(session.userA.plan),
            getRetentionDaysForPlan(session.userB.plan)
          );
          recordingExpiresAt = new Date(Date.now() + maxRetentionDays * 24 * 60 * 60 * 1000);
        }

        await prisma.callSession.update({
          where: { id: session.id },
          data: {
            status: 'COMPLETED',
            endedAt,
            duration: durationSeconds,
            recordingUrl,
            recordingExpiresAt,
          },
        });

        io.to(roomName).emit('call_finished', { duration: durationSeconds });

        if (bot) {
          try {
            await sendPostCallReviewCard(
              bot,
              Number(session.userA.telegramId),
              session.id,
              session.userB.alias,
              durationSeconds,
              recordingUrl
            );

            await sendPostCallReviewCard(
              bot,
              Number(session.userB.telegramId),
              session.id,
              session.userA.alias,
              durationSeconds,
              recordingUrl
            );
          } catch (postCallErr) {
            console.warn('[Socket] Failed to send post-call review cards:', postCallErr);
          }
        }
      } catch (err) {
        console.error('[Socket] finish_call error:', err);
      }
    });

    socket.on('disconnect', () => {
      if (socket.data.userId) {
        matchmakingService.cancelQueue(socket.data.userId).catch((err) => {
          console.warn('[Socket] Failed to cancel queue on disconnect:', err);
        });
        removeUserSocket(socket.data.userId, socket.id);
      }
    });
  });
}
