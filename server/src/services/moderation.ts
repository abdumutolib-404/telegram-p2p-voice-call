import { prisma } from '../config/database';
import { lockRow } from '../utils/transactionLock';
import { getRedis } from '../config/redis';
import { logger } from '../utils/logger';

export interface ModerationResult {
  penaltyLevel: 'WARNING' | 'TEMP_BAN' | 'PERM_BAN';
  warningCount: number;
  bannedUntil?: Date;
  isPermanentlyBanned: boolean;
  message: string;
}

export class ModerationService {
  /**
   * Invalidate the Redis ban check cache for a telegram user
   * Key: bot:ban_check:${telegramId}
   */
  async invalidateBanCache(telegramId: bigint | string | number): Promise<void> {
    try {
      const redis = getRedis();
      await redis.del(`bot:ban_check:${telegramId.toString()}`);
    } catch (err) {
      logger.warn('Failed to invalidate ban check cache', {
        service: 'moderation',
        event: 'invalidate_ban_check_failed',
        telegramId: telegramId.toString(),
      }, err);
    }
  }

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

    let targetTelegramId: bigint | null = null;

    const result = await prisma.$transaction(async (tx) => {
      await lockRow(tx, 'User', targetUserId);
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

      targetTelegramId = targetUser.telegramId;

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

      if (newWarningCount < 3) {
        // 1st or 2nd report -> Warning
        await tx.user.update({
          where: { id: targetUserId },
          data: { warningCount: newWarningCount },
        });

        return {
          penaltyLevel: 'WARNING' as const,
          warningCount: newWarningCount,
          isPermanentlyBanned: false,
          message: `Warning issued to user (${newWarningCount}/3 warnings).`,
        };
      } else if (newWarningCount < 5) {
        // 3rd or 4th report -> 6-hour temporary ban
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
          message: `User temporarily banned for 6 hours (${newWarningCount} warnings threshold reached).`,
        };
      } else {
        // 5th report or higher -> Permanent Lock
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
          message: `User permanently locked (${newWarningCount} warnings limit reached).`,
        };
      }
    });

    if (result.penaltyLevel !== 'WARNING' && targetTelegramId) {
      await this.invalidateBanCache(targetTelegramId);
    }

    return result;
  }

  /**
   * Centralized warning escalation logic for admin moderation & user reports:
   * Warnings 1-2: Warned (warningCount 1..2)
   * Warnings 3-4: Temporarily Suspended for 6 hours (isBanned: true, bannedUntil: +6h)
   * Warnings 5+: Permanently Banned (isPermanentlyBanned: true, isBanned: true, bannedUntil: null)
   */
  async escalateUserWarning(userId: string, reason?: string): Promise<{
    user: any;
    penaltyLevel: 'WARNING' | 'TEMP_BAN' | 'PERM_BAN';
    warningCount: number;
    notificationText: string;
  }> {
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) throw new Error('User not found');

      const newWarningCount = user.warningCount + 1;
      let penaltyLevel: 'WARNING' | 'TEMP_BAN' | 'PERM_BAN' = 'WARNING';
      let updateData: any = { warningCount: newWarningCount };
      let notificationText = '';

      if (newWarningCount < 3) {
        penaltyLevel = 'WARNING';
        notificationText = `⚠️ *Official Community Warning (${newWarningCount}/3)*\n\nYou have received a warning from moderation.\n*Reason:* ${reason || 'Inappropriate conduct or policy violation in voice calls.'}\n\nAccumulating 3 warnings will result in an automatic 6-hour temporary ban.`;
      } else if (newWarningCount < 5) {
        penaltyLevel = 'TEMP_BAN';
        const bannedUntil = new Date(Date.now() + 6 * 60 * 60 * 1000);
        updateData = {
          warningCount: newWarningCount,
          isBanned: true,
          isPermanentlyBanned: false,
          bannedUntil,
        };
        notificationText = `🚫 *Account Temporarily Suspended (6 Hours)*\n\nYou have accumulated ${newWarningCount} warnings.\n*Reason:* ${reason || 'Repeated warnings or call policy violation.'}\n\nYour account is suspended for 6 hours. Temporary suspensions expire automatically.`;
      } else {
        penaltyLevel = 'PERM_BAN';
        updateData = {
          warningCount: newWarningCount,
          isBanned: true,
          isPermanentlyBanned: true,
          bannedUntil: null,
        };
        notificationText = `⛔ *Account Permanently Banned*\n\nYou have accumulated ${newWarningCount} warnings.\n*Reason:* ${reason || 'Severe or persistent policy violations.'}\n\nYour account has been permanently suspended. You may submit an appeal using the bot command /appeal.`;
      }

      const updated = await tx.user.update({
        where: { id: userId },
        data: updateData,
      });

      return {
        user: updated,
        penaltyLevel,
        warningCount: newWarningCount,
        notificationText,
      };
    });

    if (result.penaltyLevel !== 'WARNING' && result.user?.telegramId) {
      await this.invalidateBanCache(result.user.telegramId);
    }

    return result;
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

    if (user.bannedUntil) {
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
        if (user.telegramId) {
          await this.invalidateBanCache(user.telegramId);
        }
      }
    }

    return { banned: false };
  }

  /**
   * Explicitly ban a user and invalidate ban cache
   */
  async banUser(userId: string, permanent: boolean = true, durationMs: number = 6 * 60 * 60 * 1000) {
    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        isBanned: true,
        isPermanentlyBanned: permanent,
        bannedUntil: permanent ? null : new Date(Date.now() + durationMs),
      },
    });

    if (user.telegramId) {
      await this.invalidateBanCache(user.telegramId);
    }

    return user;
  }

  /**
   * Explicitly unban a user and invalidate ban cache
   */
  async unbanUser(userId: string) {
    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        isBanned: false,
        isPermanentlyBanned: false,
        bannedUntil: null,
        warningCount: 0,
      },
    });

    if (user.telegramId) {
      await this.invalidateBanCache(user.telegramId);
    }

    return user;
  }

  /**
   * Handle appeal status change and invalidate ban cache
   */
  async updateAppealStatus(appealId: string, status: 'APPROVED' | 'REJECTED') {
    const appeal = await prisma.unblockAppeal.findUnique({ where: { id: appealId } });
    if (!appeal) {
      throw new Error('Appeal not found');
    }

    const updated = await prisma.$transaction(async (tx) => {
      const app = await tx.unblockAppeal.update({
        where: { id: appealId },
        data: { status, reviewedAt: new Date() },
      });

      if (status === 'APPROVED') {
        await tx.user.update({
          where: { id: appeal.userId },
          data: {
            isBanned: false,
            isPermanentlyBanned: false,
            bannedUntil: null,
            warningCount: 0,
          },
        });
      }

      return app;
    });

    if (appeal.telegramId) {
      await this.invalidateBanCache(appeal.telegramId);
    }

    return updated;
  }
}

export const moderationService = new ModerationService();

export async function invalidateBanCheckCache(telegramId: bigint | string | number): Promise<void> {
  return moderationService.invalidateBanCache(telegramId);
}
