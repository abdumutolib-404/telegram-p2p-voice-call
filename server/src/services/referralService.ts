import { lockRow } from '../utils/transactionLock';
import { prisma } from '../config/database';
import { Bot } from 'grammy';
import { MyContext } from '../bot/types';
import { logger } from '../utils/logger';
import type { Prisma } from '@prisma/client';
import { env } from '../config/env';
import { escapeHtml } from '../utils/sanitize';
import { persistNotification } from '../bot/notifications';

export interface ReferralStats {
  totalInvited: number;
  qualifyingCompleted: number;
  activeBonusCalls: number;
  rewards: Array<{
    id: string;
    referredAlias: string;
    expiresAt: Date;
    status: string;
    createdAt: Date;
  }>;
}

export interface ContestLeaderboardEntry {
  rank: number;
  alias: string;
  telegramId: string;
  userId: string;
  invitesCount: number;
}

export type ContestLifecycleState = 'NO_ACTIVE' | 'ACTIVE' | 'ENDED';

export interface ContestStatus {
  status: ContestLifecycleState;
  isActive: boolean;
  contest: {
    id: string;
    title: string;
    description: string;
    prizes: string;
    startsAt: Date;
    endsAt: Date | null;
  } | null;
  leaderboard: ContestLeaderboardEntry[];
}

/**
 * Parses and binds a referral link parameter (e.g. ref_12345678 or ref_<uuid>) to a newly registering user.
 */
export async function bindReferral(
  invitedTelegramId: bigint,
  referralParam?: string,
  bot?: Bot<MyContext>,
  guestDisplayName?: string
): Promise<{ success: boolean; inviterAlias?: string }> {
  if (!referralParam || !referralParam.startsWith('ref_')) {
    return { success: false };
  }

  const rawCode = referralParam.slice(4).trim();
  if (!rawCode) return { success: false };

  try {
    // 1. Resolve inviter (can be telegramId or userId)
    let inviter = null;
    if (/^\d+$/.test(rawCode)) {
      inviter = await prisma.user.findUnique({
        where: { telegramId: BigInt(rawCode) },
      });
    } else {
      inviter = await prisma.user.findUnique({
        where: { id: rawCode },
      });
    }

    if (!inviter || inviter.isPermanentlyBanned) {
      return { success: false };
    }

    // 2. Anti-Abuse: Prevent self-referral
    if (inviter.telegramId === invitedTelegramId) {
      return { success: false };
    }

    // 3. Check if the invited user already exists and was already referred
    const existingUser = await prisma.user.findUnique({
      where: { telegramId: invitedTelegramId },
    });

    if (existingUser && existingUser.referredByUserId) {
      // Already bound to an inviter
      return { success: false };
    }

    if (existingUser) {
      await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          referredByUserId: inviter.id,
          referredAt: new Date(),
        },
      });
    } else {
      const randomAlias = `P2P-${Math.floor(1000 + Math.random() * 9000)}-${Date.now().toString(36).slice(-3).toUpperCase()}`;
      await prisma.user.create({
        data: {
          telegramId: invitedTelegramId,
          alias: randomAlias,
          referredByUserId: inviter.id,
          referredAt: new Date(),
          onboarded: false,
        },
      });
    }

    // 4. Send instant automatic notification to the inviter
    if (bot && inviter && !inviter.dnd) {
      const guestName = guestDisplayName ? `<b>${guestDisplayName}</b>` : 'A new student';
      const msg =
        `👋 <b>New Invite Registered!</b>\n\n` +
        `${guestName} just joined PairTalk using your personal invite link! 🚀\n\n` +
        `⚠️ <b>Important:</b>\n` +
        `Your <b>1 Free Permanent Bonus Call</b> will be granted automatically once they complete a speaking call of at least <b>30 seconds</b>.\n\n` +
        `💡 <i>Encourage your friend to practice their first IELTS call to unlock your bonus!</i>`;

      await bot.api.sendMessage(inviter.telegramId.toString(), msg, { parse_mode: 'HTML' })
        .catch((e: unknown) => logger.warn('Failed to send new invite notification', {
          service: 'referral',
          event: 'invite_notify_failed',
          inviterTelegramId: inviter.telegramId.toString(),
        }, e));
    }

    return { success: true, inviterAlias: inviter.alias };
  } catch (err) {
    logger.error('bindReferral error', {
      service: 'referral',
      event: 'bind_referral_error',
      invitedTelegramId: invitedTelegramId.toString(),
    }, err);
    return { success: false };
  }
}

/**
 * Triggered upon call completion. If call duration is >= 30 seconds, checks if either
 * participant is a newly referred friend whose first qualifying call has not yet awarded their inviter.
 */
export async function onCallFinishedCheckReferralReward(
  session: { id: string; userAId: string; userBId: string; duration: number },
  bot?: Bot<MyContext>
): Promise<void> {
  if (!session || !Number.isInteger(session.duration) || session.duration < 30) return;
  for (const participantId of [session.userAId, session.userBId]) {
    const user = await prisma.user.findUnique({ where: { id: participantId } });
    if (!user?.referredByUserId) continue;
    await prisma.$transaction(async tx => {
      for (const id of [user.id, user.referredByUserId!].sort()) await lockRow(tx, 'User', id);
      const friend = await tx.user.findUnique({ where: { id: user.id } });
      if (!friend || friend.referredByUserId !== user.referredByUserId) return;
      if (await tx.referralReward.findFirst({ where: { referredUserId: friend.id } })) return;
      await tx.referralReward.create({ data: {
        userId: friend.referredByUserId!, referredUserId: friend.id,
        qualifyingCallId: session.id, status: 'AVAILABLE',
      } });
      const inviter = await tx.user.findUnique({ where: { id: friend.referredByUserId! } });
      if (bot && inviter && !inviter.dnd) {
        const text = '🎉 <b>Referral Bonus Earned!</b>\n\n' +
          'Your friend <b>' + escapeHtml(friend.alias) + '</b> just completed their first speaking practice session (<code>' + Math.floor(session.duration / 60) + ' min</code>)!\n\n' +
          '🎁 <b>Reward Granted:</b> <code>1 Free Bonus Call</code> (Permanent / Never Expires)\n\n' +
          '💡 <i>Your bonus calls are saved forever and automatically used whenever your monthly plan limits run out.</i>';
        // The award and its notice commit together; a crash cannot lose the notice after awarding.
        await persistNotification(tx, inviter.telegramId.toString(), text, { parse_mode: 'HTML' }, true, 'referral:' + friend.id);
      }
    }, { maxWait: 10000, timeout: 15000 });
  }
}

/**
 * Returns the number of currently active permanent bonus calls available for the user.
 */
export async function getActiveBonusCallsCount(userId: string, transaction?: Pick<Prisma.TransactionClient, 'referralReward'>): Promise<number> {
  const database = transaction ?? prisma;
  try {
    const count = await database.referralReward.count({
      where: {
        userId,
        status: 'AVAILABLE',
      },
    });
    return count;
  } catch (error) {
    if (env.NODE_ENV !== 'test' || transaction) throw error;
    return 0;
  }
}

/**
 * Consumes 1 bonus call.
 * Returns true if a bonus call was successfully consumed, false if none available.
 */
export async function consumeOldestBonusCall(userId: string, transaction?: Pick<Prisma.TransactionClient, 'referralReward'>): Promise<boolean> {
  const database = transaction ?? prisma;
  try {
    const now = new Date();
    const oldestReward = await database.referralReward.findFirst({
      where: {
        userId,
        status: 'AVAILABLE',
      },
      orderBy: { createdAt: 'asc' },
    });

    if (!oldestReward) {
      return false;
    }

    const claimed = await database.referralReward.updateMany({
      where: { id: oldestReward.id, userId, status: 'AVAILABLE' },
      data: {
        status: 'USED',
        usedAt: now,
      },
    });

    return claimed.count === 1;
  } catch (err) {
    logger.error('consumeOldestBonusCall error', {
      service: 'referral',
      event: 'consume_bonus_call_error',
      userId,
    }, err);
    if (env.NODE_ENV !== 'test' || transaction) throw err;
    return false;
  }
}

/**
 * Retrieves referral dashboard stats for a specific user.
 */
export async function getReferralStats(userId: string): Promise<ReferralStats> {
  const [totalInvited, activeBonusCalls, rewardRows] = await Promise.all([
    prisma.user.count({ where: { referredByUserId: userId } }),
    prisma.referralReward.count({
      where: {
        userId,
        status: 'AVAILABLE',
      },
    }),
    prisma.referralReward.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
  ]);

  const userIdsToFetch = rewardRows.map((r) => r.referredUserId);
  const friendUsers = userIdsToFetch.length > 0
    ? await prisma.user.findMany({
        where: { id: { in: userIdsToFetch } },
        select: { id: true, alias: true },
      })
    : [];

  const friendMap = new Map(friendUsers.map((u) => [u.id, u.alias]));

  const rewards = rewardRows.map((r) => {
    return {
      id: r.id,
      referredAlias: friendMap.get(r.referredUserId) || 'Friend',
      expiresAt: r.expiresAt || new Date(0),
      status: r.status,
      createdAt: r.createdAt,
    };
  });

  return {
    totalInvited,
    qualifyingCompleted: rewardRows.length,
    activeBonusCalls,
    rewards,
  };
}

/**
 * Retrieves active Hall of Fame Contest & Leaderboard data with strict 3-state lifecycle.
 */
export async function getContestStatus(): Promise<ContestStatus> {
  const contest = await prisma.contest.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: 'desc' },
  });

  if (!contest) {
    return {
      status: 'NO_ACTIVE',
      isActive: false,
      contest: null,
      leaderboard: [],
    };
  }

  // Check if active contest has expired duration
  const isExpired = contest.endsAt ? new Date(contest.endsAt).getTime() <= Date.now() : false;
  if (isExpired) {
    return {
      status: 'ENDED',
      isActive: false,
      contest: null,
      leaderboard: [],
    };
  }

  // Aggregate qualifying rewards earned since contest startsAt
  const rewards = await prisma.referralReward.findMany({
    where: {
      createdAt: {
        gte: contest.startsAt,
        ...(contest.endsAt ? { lte: contest.endsAt } : {}),
      },
    },
    select: { userId: true },
  });

  const countByUser = new Map<string, number>();
  for (const r of rewards) {
    countByUser.set(r.userId, (countByUser.get(r.userId) || 0) + 1);
  }

  const sortedUserIds = [...countByUser.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  const topUsers = sortedUserIds.length > 0
    ? await prisma.user.findMany({
        where: { id: { in: sortedUserIds.map(([id]) => id) } },
        select: { id: true, alias: true, telegramId: true },
      })
    : [];

  const userMap = new Map(topUsers.map((u) => [u.id, u]));

  const leaderboard: ContestLeaderboardEntry[] = sortedUserIds.map(([userId, count], index) => {
    const user = userMap.get(userId);
    return {
      rank: index + 1,
      userId,
      alias: user?.alias || `User-${userId.slice(0, 6)}`,
      telegramId: user?.telegramId ? user.telegramId.toString() : '',
      invitesCount: count,
    };
  });

  return {
    status: 'ACTIVE',
    isActive: true,
    contest: {
      id: contest.id,
      title: contest.title,
      description: contest.description,
      prizes: contest.prizes,
      startsAt: contest.startsAt,
      endsAt: contest.endsAt,
    },
    leaderboard,
  };
}

/**
 * Concludes a championship and executes atomic, idempotent automatic prize distribution for ranks 1, 2, and 3.
 */
export async function concludeContestAndDistributePrizes(
  contestId?: string,
  bot?: Bot<MyContext>
): Promise<{
  success: boolean;
  alreadyAwarded: boolean;
  contestId: string;
  winners: Array<{ rank: number; userId: string; alias: string; prize: string }>;
}> {
  // 1. Locate target contest
  let contest = contestId
    ? await prisma.contest.findUnique({ where: { id: contestId } })
    : await prisma.contest.findFirst({ where: { isActive: true }, orderBy: { createdAt: 'desc' } });

  if (!contest && !contestId) {
    contest = await prisma.contest.findFirst({ orderBy: { createdAt: 'desc' } });
  }

  if (!contest) {
    throw new Error('No championship found to conclude.');
  }

  const targetContestId = contest.id;

  // 2. Atomic & Idempotent Prize Distribution inside prisma.$transaction
  const result = await prisma.$transaction(async (tx) => {
    await lockRow(tx, 'Contest', targetContestId);
    // Check if prize distribution was already recorded in AuditLog for idempotency
    const existingAwardLog = await tx.auditLog.findFirst({
      where: {
        action: 'CONTEST_PRIZES_AWARDED',
        targetId: targetContestId,
      },
    });

    if (existingAwardLog) {
      let parsedWinners: any[] = [];
      try {
        parsedWinners = JSON.parse(existingAwardLog.afterState || '[]')?.winners || [];
      } catch {}
      return {
        alreadyAwarded: true,
        winners: parsedWinners,
      };
    }

    const concludedEndsAt = contest!.endsAt && contest!.endsAt <= new Date() ? contest!.endsAt : new Date();

    // Mark contest ended
    await tx.contest.update({
      where: { id: targetContestId },
      data: {
        isActive: false,
        endsAt: concludedEndsAt,
      },
    });

    // Determine top 3 candidates
    const rewards = await tx.referralReward.findMany({
      where: {
        createdAt: {
          gte: contest!.startsAt,
          lte: concludedEndsAt,
        },
      },
      select: { userId: true },
    });

    const countByUser = new Map<string, number>();
    for (const r of rewards) {
      countByUser.set(r.userId, (countByUser.get(r.userId) || 0) + 1);
    }

    const sortedUserIds = [...countByUser.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    const winners: Array<{ rank: number; userId: string; alias: string; prize: string; telegramId?: string }> = [];

    // Award 1st, 2nd, 3rd place prizes
    for (let index = 0; index < sortedUserIds.length; index++) {
      const [userId, count] = sortedUserIds[index];
      const rank = index + 1;
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) continue;

      let prizeName = '';
      if (rank === 1) {
        prizeName = '🥇 60-Day BOSS Plan';
        await tx.user.update({
          where: { id: userId },
          data: {
            plan: 'BOSS',
            customPlanName: '🥇 Championship Winner (60-Day BOSS)',
            dailyLimit: 50,
            maxDuration: 90,
            retentionOverride: 90,
            recordingLimitOverride: 15,
            subscriptionStatus: 'ACTIVE',
            subscriptionExpiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
          },
        });
      } else if (rank === 2) {
        prizeName = '🥈 30-Day BOSS Plan';
        await tx.user.update({
          where: { id: userId },
          data: {
            plan: 'BOSS',
            customPlanName: '🥈 Championship Runner-Up (30-Day BOSS)',
            dailyLimit: 50,
            maxDuration: 90,
            retentionOverride: 90,
            recordingLimitOverride: 15,
            subscriptionStatus: 'ACTIVE',
            subscriptionExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          },
        });
      } else if (rank === 3) {
        prizeName = '🥉 14-Day PRO Plan';
        await tx.user.update({
          where: { id: userId },
          data: {
            plan: 'PRO',
            customPlanName: '🥉 Championship 3rd Place (14-Day PRO)',
            dailyLimit: 25,
            maxDuration: 60,
            retentionOverride: 30,
            recordingLimitOverride: 7,
            subscriptionStatus: 'ACTIVE',
            subscriptionExpiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
          },
        });
      }

      winners.push({
        rank,
        userId: user.id,
        alias: user.alias,
        prize: prizeName,
        telegramId: user.telegramId.toString(),
      });
    }

    // Record idempotent distribution audit log
    await tx.auditLog.create({
      data: {
        action: 'CONTEST_PRIZES_AWARDED',
        targetId: targetContestId,
        adminId: 'SYSTEM',
        beforeState: JSON.stringify({ contestId: targetContestId, isActive: true }),
        afterState: JSON.stringify({ contestId: targetContestId, winners }),
        reason: `Automatic prize distribution for championship ${contest!.title}`,
      },
    });

    return {
      alreadyAwarded: false,
      winners,
    };
  });

  // 3. Deliver celebratory notifications to winners if bot instance is available
  if (bot && result.winners && result.winners.length > 0 && !result.alreadyAwarded) {
    for (const winner of result.winners) {
      if (winner.telegramId) {
        const medal = winner.rank === 1 ? '🥇' : winner.rank === 2 ? '🥈' : '🥉';
        const msg =
          `🏆 <b>Congratulations, Champion!</b>\n\n` +
          `You took <b>${medal} Rank #${winner.rank}</b> in the <b>${contest.title}</b>!\n\n` +
          `🎁 <b>Your Prize:</b> <code>${winner.prize}</code> has been activated on your account.\n\n` +
          `Thank you for helping grow the PairTalk speaking community! 🚀`;

        await bot.api.sendMessage(winner.telegramId, msg, { parse_mode: 'HTML' })
          .catch((e: unknown) => logger.warn('Failed to deliver prize notification to winner', {
            service: 'referral',
            event: 'prize_notification_failed',
            winnerTelegramId: winner.telegramId,
          }, e));
      }
    }
  }

  return {
    success: true,
    alreadyAwarded: result.alreadyAwarded,
    contestId: targetContestId,
    winners: result.winners,
  };
}
