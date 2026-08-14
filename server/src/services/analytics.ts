import { prisma } from '../config/database';

export interface MonthlyRevenue {
  month: string;
  stars: number;
  usd: number;
}

export interface AdminAnalyticsData {
  totalUsers: number;
  mau: number;
  dau: number;
  totalCalls: number;
  totalMinutesSpoken: number;
  activeCalls: number;
  starsRevenue: {
    totalStars: number;
    totalUsd: number;
    monthlyHistory: MonthlyRevenue[];
  };
}

export async function getAdminAnalytics(): Promise<AdminAnalyticsData> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const totalUsers = await prisma.user.count();

  const mau = await prisma.user.count({
    where: {
      updatedAt: { gte: thirtyDaysAgo },
    },
  });

  const dau = await prisma.user.count({
    where: {
      updatedAt: { gte: oneDayAgo },
    },
  });

  const totalCalls = await prisma.callSession.count({
    where: { status: 'COMPLETED' },
  });

  const activeCalls = await prisma.callSession.count({
    where: { status: 'ACTIVE' },
  });

  const completedSessions = await prisma.callSession.findMany({
    where: { status: 'COMPLETED' },
    select: { duration: true },
  });
  const totalDurationSeconds = completedSessions.reduce((acc, s) => acc + (s.duration || 0), 0);
  const totalMinutesSpoken = Math.round(totalDurationSeconds / 60);

  const transactions = await prisma.starsTransaction.findMany();
  const totalStars = transactions.reduce((acc, t) => acc + t.starsAmount, 0);

  // Build monthly breakdown for the chart
  const monthlyMap = new Map<string, { stars: number; usd: number }>();
  for (const t of transactions) {
    const dateStr = new Date(t.createdAt).toLocaleString('en-US', { month: 'short', year: 'numeric' });
    if (!monthlyMap.has(dateStr)) monthlyMap.set(dateStr, { stars: 0, usd: 0 });
    const entry = monthlyMap.get(dateStr)!;
    entry.stars += t.starsAmount;
    entry.usd += t.starsAmount * 0.013;
  }

  const monthlyHistory: MonthlyRevenue[] = Array.from(monthlyMap.entries()).map(([month, data]) => ({
    month,
    stars: data.stars,
    usd: parseFloat(data.usd.toFixed(2)),
  }));

  return {
    totalUsers,
    mau,
    dau,
    totalCalls,
    totalMinutesSpoken,
    activeCalls,
    starsRevenue: {
      totalStars,
      totalUsd: parseFloat((totalStars * 0.013).toFixed(2)),
      monthlyHistory,
    },
  };
}
