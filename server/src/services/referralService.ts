import { prisma } from '../config/database';
import { Bot } from 'grammy';
import { MyContext } from '../bot/types';

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

export interface ContestStatus {
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
  referralParam?: string
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
    }

    return { success: true, inviterAlias: inviter.alias };
  } catch (err) {
    console.error('[Referral] bindReferral error:', err);
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
  if (!session || session.duration < 30) {
    return;
  }

  const participantIds = [session.userAId, session.userBId];

  for (const participantId of participantIds) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: participantId },
      });

      if (!user || !user.referredByUserId) {
        continue;
      }

      // Check if a reward was already granted for this referred user
      const existingReward = await prisma.referralReward.findFirst({
        where: { referredUserId: user.id },
      });

      if (existingReward) {
        continue;
      }

      // Inviter receives 1 free permanent bonus call (never expires)
      await prisma.referralReward.create({
        data: {
          userId: user.referredByUserId,
          referredUserId: user.id,
          qualifyingCallId: session.id,
          status: 'AVAILABLE',
        },
      });

      // Send celebratory Telegram notification to the inviter
      if (bot) {
        const inviter = await prisma.user.findUnique({
          where: { id: user.referredByUserId },
        });

        if (inviter && !inviter.dnd) {
          const msg =
            `🎉 <b>Referral Bonus Earned!</b>\n\n` +
            `Your friend <b>${user.alias}</b> just completed their first speaking practice session (<code>${Math.floor(session.duration / 60)} min</code>)!\n\n` +
            `🎁 <b>Reward Granted:</b> <code>1 Free Bonus Call</code> (Permanent / Never Expires)\n\n` +
            `💡 <i>Your bonus calls are saved forever and automatically used whenever your monthly plan limits run out.</i>`;

          await bot.api.sendMessage(inviter.telegramId.toString(), msg, { parse_mode: 'HTML' })
            .catch((e: unknown) => console.warn('[Referral] Failed to deliver reward notice:', e));
        }
      }
    } catch (err) {
      console.error('[Referral] Error processing qualifying call reward for participant:', participantId, err);
    }
  }
}

/**
 * Returns the number of currently active permanent bonus calls available for the user.
 */
export async function getActiveBonusCallsCount(userId: string): Promise<number> {
  try {
    const count = await prisma.referralReward.count({
      where: {
        userId,
        status: 'AVAILABLE',
      },
    });
    return count;
  } catch {
    return 0;
  }
}

/**
 * Consumes 1 bonus call.
 * Returns true if a bonus call was successfully consumed, false if none available.
 */
export async function consumeOldestBonusCall(userId: string): Promise<boolean> {
  try {
    const now = new Date();
    const oldestReward = await prisma.referralReward.findFirst({
      where: {
        userId,
        status: 'AVAILABLE',
      },
      orderBy: { createdAt: 'asc' },
    });

    if (!oldestReward) {
      return false;
    }

    await prisma.referralReward.update({
      where: { id: oldestReward.id },
      data: {
        status: 'USED',
        usedAt: now,
      },
    });

    return true;
  } catch (err) {
    console.error('[Referral] consumeOldestBonusCall error:', err);
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
 * Retrieves active Hall of Fame Contest & Leaderboard data.
 */
export async function getContestStatus(): Promise<ContestStatus> {
  const contest = await prisma.contest.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: 'desc' },
  });

  if (!contest) {
    return {
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
