import { prisma } from '../config/database';

export interface AdminAnalyticsData {
  totalUsers: number;
  mau: number;
  dau: number;
  activeCalls: number;
  starsRevenue: {
    totalStars: number;
    estimatedUsd: number; // ~0.013 USD per Star or approximate calculation
    transactionCount: number;
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

  const activeCalls = await prisma.callSession.count({
    where: { status: 'ACTIVE' },
  });

  const transactions = await prisma.starsTransaction.findMany();
  const totalStars = transactions.reduce((acc, t) => acc + t.starsAmount, 0);

  return {
    totalUsers,
    mau,
    dau,
    activeCalls,
    starsRevenue: {
      totalStars,
      estimatedUsd: parseFloat((totalStars * 0.013).toFixed(2)),
      transactionCount: transactions.length,
    },
  };
}
