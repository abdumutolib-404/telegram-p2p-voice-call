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
  // Store socket mapping: userId -> socketId
  const userSockets = new Map<string, string>();
  const activeEgresses = new Map<string, string>(); // roomName -> egressId

  io.on('connection', (socket: Socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);

    // Join user socket mapping
    socket.on('register_user', (userId: string) => {
      userSockets.set(userId, socket.id);
      socket.data.userId = userId;
    });

    // 1. join_queue
    socket.on('join_queue', async (data: { userId: string; band?: number; weakSkill?: string; strongSkill?: string }) => {
      const { userId } = data;
      userSockets.set(userId, socket.id);
      socket.data.userId = userId;

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

      // Check daily call limit
      const todayStr = new Date().toISOString().split('T')[0];
      if (user.lastCallDate !== todayStr) {
        await prisma.user.update({
          where: { id: user.id },
          data: { dailyCallsUsed: 0, lastCallDate: todayStr },
        });
      } else if (user.dailyCallsUsed >= user.dailyLimit) {
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
        if (!partner) return;

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

        // Update daily calls used
        await prisma.user.update({
          where: { id: user.id },
          data: { dailyCallsUsed: user.dailyCallsUsed + 1 },
        });
        await prisma.user.update({
          where: { id: partner.id },
          data: { dailyCallsUsed: partner.dailyCallsUsed + 1 },
        });

        // Join sockets to room
        const socketUser = io.sockets.sockets.get(userSockets.get(user.id) || '');
        const socketPartner = io.sockets.sockets.get(userSockets.get(partner.id) || '');

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
    });

    // 2. cancel_queue
    socket.on('cancel_queue', async (data: { userId: string }) => {
      const userId = data.userId || socket.data.userId;
      if (userId) {
        await matchmakingService.cancelQueue(userId);
        socket.emit('queue_cancelled', { success: true });
      }
    });

    // 3. toggle_record
    socket.on('toggle_record', async (data: { roomName: string; record: boolean }) => {
      const { roomName, record } = data;

      if (record) {
        const egressId = await startAudioEgress(roomName);
        activeEgresses.set(roomName, egressId);

        await prisma.callSession.updateMany({
          where: { roomName },
          data: { egressId },
        });

        io.to(roomName).emit('record_status', { record: true });
      } else {
        const egressId = activeEgresses.get(roomName);
        if (egressId) {
          await stopAudioEgress(egressId);
          activeEgresses.delete(roomName);
        }

        io.to(roomName).emit('record_status', { record: false });
      }
    });

    // 4. finish_call
    socket.on('finish_call', async (data: { roomName: string; userId: string }) => {
      const { roomName, userId } = data;

      const session = await prisma.callSession.findUnique({
        where: { roomName },
        include: { userA: true, userB: true },
      });

      if (session && session.status === 'ACTIVE') {
        const endedAt = new Date();
        const durationSeconds = Math.max(1, Math.floor((endedAt.getTime() - session.createdAt.getTime()) / 1000));

        // Stop active egress if any
        const egressId = activeEgresses.get(roomName) || session.egressId;
        let recordingUrl: string | undefined = undefined;
        let recordingExpiresAt: Date | undefined = undefined;

        if (egressId) {
          await stopAudioEgress(egressId);
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
        }
      }
    });

    socket.on('disconnect', () => {
      if (socket.data.userId) {
        matchmakingService.cancelQueue(socket.data.userId);
        userSockets.delete(socket.data.userId);
      }
    });
  });
}
