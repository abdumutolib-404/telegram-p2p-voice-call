import { prisma } from '../config/database';

export interface ModerationResult {
  penaltyLevel: 'WARNING' | 'TEMP_BAN' | 'PERM_BAN';
  warningCount: number;
  bannedUntil?: Date;
  isPermanentlyBanned: boolean;
  message: string;
}

export class ModerationService {
  /**
   * Process a report against a target user following the Moderation Penalty Ladder
   */
  async processReport(targetUserId: string, reporterUserId: string, callId: string, reason: string): Promise<ModerationResult> {
    if (!targetUserId || !reporterUserId || !callId || !reason) {
      throw new Error('Missing required fields');
    }

    if (targetUserId === reporterUserId) {
      throw new Error('Cannot report yourself');
    }

    return await prisma.$transaction(async (tx) => {
      // Validate that both users were actual participants in this call
      const session = await tx.callSession.findUnique({ where: { id: callId } });
      if (!session) {
        throw new Error('Call session not found');
      }

      const participants = [session.userAId, session.userBId];
      if (!participants.includes(targetUserId) || !participants.includes(reporterUserId)) {
        throw new Error('Users were not participants in this call');
      }

      // Prevent duplicate reports for the same call
      const existingReport = await tx.callRating.findFirst({
        where: { callId, raterId: reporterUserId, ratedId: targetUserId, reported: true },
      });
      if (existingReport) {
        throw new Error('You have already reported this user for this call');
      }

      const targetUser = await tx.user.findUnique({ where: { id: targetUserId } });
      if (!targetUser) {
        throw new Error('Target user not found');
      }

      // Save CallRating with reported=true
      await tx.callRating.create({
        data: {
          callId,
          raterId: reporterUserId,
          ratedId: targetUserId,
          stars: 1,
          feedback: reason,
          reported: true,
        },
      });

      const newWarningCount = targetUser.warningCount + 1;

      if (newWarningCount === 1) {
        // 1st report -> Warning
        await tx.user.update({
          where: { id: targetUserId },
          data: { warningCount: newWarningCount },
        });

        return {
          penaltyLevel: 'WARNING' as const,
          warningCount: newWarningCount,
          isPermanentlyBanned: false,
          message: 'Warning issued to user for 1st offense.',
        };
      } else if (newWarningCount === 2) {
        // 2nd report -> 6-hour temporary ban
        const bannedUntil = new Date(Date.now() + 6 * 60 * 60 * 1000);
        await tx.user.update({
          where: { id: targetUserId },
          data: {
            warningCount: newWarningCount,
            isBanned: true,
            bannedUntil,
          },
        });

        return {
          penaltyLevel: 'TEMP_BAN' as const,
          warningCount: newWarningCount,
          bannedUntil,
          isPermanentlyBanned: false,
          message: 'User temporary banned for 6 hours (2nd offense).',
        };
      } else {
        // 3rd report or higher -> Permanent Lock
        await tx.user.update({
          where: { id: targetUserId },
          data: {
            warningCount: newWarningCount,
            isBanned: true,
            isPermanentlyBanned: true,
            bannedUntil: null,
          },
        });

        return {
          penaltyLevel: 'PERM_BAN' as const,
          warningCount: newWarningCount,
          isPermanentlyBanned: true,
          message: 'User permanently locked (3rd offense).',
        };
      }
    });
  }

  /**
   * Check if a user is currently banned (and auto-resolves expired temporary bans)
   */
  async isUserBanned(userId: string): Promise<{ banned: boolean; reason?: string; bannedUntil?: Date }> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return { banned: false };

    if (user.isPermanentlyBanned) {
      return { banned: true, reason: 'Permanently banned due to multiple moderation reports.' };
    }

    if (user.isBanned && user.bannedUntil) {
      if (new Date() < user.bannedUntil) {
        return {
          banned: true,
          reason: 'Temporarily suspended due to recent reports.',
          bannedUntil: user.bannedUntil,
        };
      } else {
        // Temp ban expired, unban user
        await prisma.user.update({
          where: { id: userId },
          data: { isBanned: false, bannedUntil: null },
        });
      }
    }

    return { banned: false };
  }
}

export const moderationService = new ModerationService();
