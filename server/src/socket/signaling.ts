import { Server, Socket } from 'socket.io';
import { matchmakingService } from '../services/matchmaking';
import { calculateMixedPlanDuration, getRetentionDaysForPlan } from '../services/plan';
import { generateLiveKitToken, startAudioEgress, stopAudioEgress } from '../config/livekit';
import { prisma } from '../config/database';
import { moderationService } from '../services/moderation';
import { sendPostCallReviewCard } from '../bot/handlers/postCall';
import { Bot } from 'grammy';
import { MyContext } from '../bot/types';

export function setupSocketSignaling(io: Server, bot?: Bot<MyContext>) {
  // Store socket mapping: userId -> Set<socketId> (supports multiple tabs)
  const userSockets = new Map<string, Set<string>>();
  const activeEgresses = new Map<string, string>(); // roomName -> egressId

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
    // Return the last (most recent) socket
    return Array.from(sockets).pop();
  }

  io.on('connection', (socket: Socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);

    // Join user socket mapping
    socket.on('register_user', (userId: string) => {
      addUserSocket(userId, socket.id);
      socket.data.userId = userId;
    });

    // 1. join_queue
    socket.on('join_queue', async (data: { userId: string; band?: number; weakSkill?: string; strongSkill?: string }) => {
      const { userId } = data;
      addUserSocket(userId, socket.id);
      socket.data.userId = userId;

      try {
        // Ban check
        const banStatus = await moderationService.isUserBanned(userId);
        if (banStatus.banned) {
          socket.emit('error', { message: banStatus.reason || 'User is banned.' });
          return;
        }

        // Fetch user from DB to verify skills
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
          socket.emit('error', { message: 'User profile not found.' });
          return;
        }

        // Check daily call limit (use atomic increment to avoid race conditions)
        const todayStr = new Date().toISOString().split('T')[0];
        let currentDailyUsed = user.dailyCallsUsed;

        if (user.lastCallDate !== todayStr) {
          // Reset daily counter for new day
          await prisma.user.update({
            where: { id: user.id },
            data: { dailyCallsUsed: 0, lastCallDate: todayStr },
          });
          currentDailyUsed = 0;
        } else if (currentDailyUsed >= user.dailyLimit) {
          socket.emit('error', { message: `Daily call limit reached (${user.dailyLimit}/${user.dailyLimit}). Upgrade plan for more calls!` });
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
            socket.emit('error', { message: 'Matched partner not found. Please try again.' });
            return;
          }

          // Verify partner socket is still alive
          const partnerSocketId = getLatestSocketId(partner.id);
          const socketPartner = partnerSocketId ? io.sockets.sockets.get(partnerSocketId) : undefined;
          if (!socketPartner) {
            // Partner disconnected — re-queue the user
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

          // Generate tokens
          const tokenUser = generateLiveKitToken(roomName, user.id, user.alias);
          const tokenPartner = generateLiveKitToken(roomName, partner.id, partner.alias);

          // Create DB session
          await prisma.callSession.create({
            data: {
              roomName,
              userAId: user.id,
              userBId: partner.id,
              status: 'ACTIVE',
            },
          });

          // Update daily calls used with atomic increment
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
    socket.on('cancel_queue', async (data: { userId: string }) => {
      const userId = data.userId || socket.data.userId;
      if (userId) {
        await matchmakingService.cancelQueue(userId);
        socket.emit('queue_cancelled', { success: true });
      }
    });

    // 3. toggle_record (with authorization check)
    socket.on('toggle_record', async (data: { roomName: string; record: boolean }) => {
      const { roomName, record } = data;
      const requesterId = socket.data.userId;

      try {
        // Verify user is a participant in this call
        const session = await prisma.callSession.findUnique({ where: { roomName } });
        if (!session || (session.userAId !== requesterId && session.userBId !== requesterId)) {
          socket.emit('error', { message: 'Unauthorized: You are not a participant in this call.' });
          return;
        }

        if (record) {
          const egressId = await startAudioEgress(roomName);
          activeEgresses.set(roomName, egressId);

          await prisma.callSession.update({
            where: { id: session.id },
            data: { egressId },
          });

          io.to(roomName).emit('record_status', { record: true });
        } else {
          const egressId = activeEgresses.get(roomName) || session.egressId;
          if (egressId) {
            await stopAudioEgress(egressId);
            activeEgresses.delete(roomName);
          }

          io.to(roomName).emit('record_status', { record: false });
        }
      } catch (err) {
        console.error('[Socket] toggle_record error:', err);
        socket.emit('error', { message: 'Failed to toggle recording.' });
      }
    });

    // 4. finish_call (with authorization check)
    socket.on('finish_call', async (data: { roomName: string; userId: string }) => {
      const { roomName } = data;
      const requesterId = socket.data.userId || data.userId;

      try {
        const session = await prisma.callSession.findUnique({
          where: { roomName },
          include: { userA: true, userB: true },
        });

        if (!session || session.status !== 'ACTIVE') return;

        // Verify user is a participant
        if (session.userAId !== requesterId && session.userBId !== requesterId) {
          socket.emit('error', { message: 'Unauthorized: You are not a participant in this call.' });
          return;
        }

        const endedAt = new Date();
        const durationSeconds = Math.max(1, Math.floor((endedAt.getTime() - session.createdAt.getTime()) / 1000));

        // Stop active egress if any
        const egressId = activeEgresses.get(roomName) || session.egressId;
        let recordingUrl: string | undefined = undefined;
        let recordingExpiresAt: Date | undefined = undefined;

        if (egressId) {
          try {
            await stopAudioEgress(egressId);
          } catch (egressErr) {
            console.warn('[Socket] Failed to stop egress:', egressErr);
          }
          activeEgresses.delete(roomName);

          const maxRetentionDays = Math.max(
            getRetentionDaysForPlan(session.userA.plan),
            getRetentionDaysForPlan(session.userB.plan)
          );
          recordingUrl = `./recordings/${roomName}.mp3`;
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

        // Send Telegram post-call review cards if bot is available
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
