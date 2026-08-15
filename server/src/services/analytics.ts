import { prisma } from '../config/database';

export interface MonthlyRevenue {
  month: string;
  stars: number;
  usd: number;
}

export interface CallQualityBreakdown {
  score: number | null; // null if insufficient sample size
  sampleSize: number;
  statusMessage: 'Optimal' | 'Good' | 'Degraded' | 'Insufficient sample size';
  completionRate: number; // 0-100%
  audioReliability: number; // 0-100%
  recordingReliability: number; // 0-100%
  cancellationRate: number; // 0-100%
  averageDurationSeconds: number;
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
    transactionCount: number;
    refundedCount: number;
    refundedStars: number;
    monthlyHistory: MonthlyRevenue[];
  };
  manualUzsRevenue: {
    approvedUzs: number;
    transactionCount: number;
    pendingUzs: number;
    pendingCount: number;
    rejectedUzs: number;
    rejectedCount: number;
  };
  callQuality: CallQualityBreakdown;
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

  const allSessions = await prisma.callSession.findMany({
    select: { status: true, duration: true, recordingUrl: true, egressId: true },
  });

  const totalCalls = allSessions.filter((s) => s.status === 'COMPLETED').length;
  const activeCalls = allSessions.filter((s) => s.status === 'ACTIVE').length;
  const cancelledCalls = allSessions.filter((s) => s.status === 'CANCELLED').length;

  const completedSessions = allSessions.filter((s) => s.status === 'COMPLETED');
  const totalDurationSeconds = completedSessions.reduce((acc, s) => acc + (s.duration || 0), 0);
  const totalMinutesSpoken = Math.round(totalDurationSeconds / 60);

  // Calculate Call Quality Score from measurable telemetry
  const sampleSize = allSessions.length;
  let callQuality: CallQualityBreakdown;

  if (sampleSize < 5) {
    callQuality = {
      score: null,
      sampleSize,
      statusMessage: 'Insufficient sample size',
      completionRate: sampleSize > 0 ? Math.round((totalCalls / sampleSize) * 100) : 100,
      audioReliability: 100,
      recordingReliability: 100,
      cancellationRate: sampleSize > 0 ? Math.round((cancelledCalls / sampleSize) * 100) : 0,
      averageDurationSeconds: totalCalls > 0 ? Math.round(totalDurationSeconds / totalCalls) : 0,
    };
  } else {
    const finishedOrCancelled = Math.max(1, totalCalls + cancelledCalls);
    const completionRate = Math.round((totalCalls / finishedOrCancelled) * 100);
    const cancellationRate = Math.round((cancelledCalls / finishedOrCancelled) * 100);

    const recordingAttempts = completedSessions.filter((s) => Boolean(s.egressId || s.recordingUrl)).length;
    const recordingsSucceeded = completedSessions.filter((s) => Boolean(s.recordingUrl)).length;
    const recordingReliability = recordingAttempts > 0 ? Math.round((recordingsSucceeded / recordingAttempts) * 100) : 100;

    const audioReliability = Math.max(0, Math.min(100, Math.round(100 - cancellationRate * 1.2)));
    const averageDurationSeconds = totalCalls > 0 ? Math.round(totalDurationSeconds / totalCalls) : 0;

    const weightedScore = Math.round(completionRate * 0.45 + audioReliability * 0.35 + recordingReliability * 0.2);
    const score = Math.max(0, Math.min(100, weightedScore));
    const statusMessage: 'Optimal' | 'Good' | 'Degraded' = score >= 90 ? 'Optimal' : score >= 75 ? 'Good' : 'Degraded';

    callQuality = {
      score,
      sampleSize,
      statusMessage,
      completionRate,
      audioReliability,
      recordingReliability,
      cancellationRate,
      averageDurationSeconds,
    };
  }

  // 1. Telegram Stars Accounting
  const starsTransactions = await prisma.starsTransaction.findMany();
  const paidStarsTxs = starsTransactions.filter((t) => t.status === 'PAID');
  const refundedStarsTxs = starsTransactions.filter((t) => t.status === 'REFUNDED');

  const totalStars = paidStarsTxs.reduce((acc, t) => acc + t.starsAmount, 0);
  const refundedStars = refundedStarsTxs.reduce((acc, t) => acc + t.starsAmount, 0);

  // Build monthly breakdown for Stars chart
  const monthlyMap = new Map<string, { stars: number; usd: number }>();
  for (const t of paidStarsTxs) {
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

  // 2. Manual UZS Accounting (Strict isolation: never count PENDING or REJECTED into approved revenue)
  const manualPayments = await prisma.manualPaymentRequest.findMany();
  const approvedManual = manualPayments.filter((p) => p.status === 'APPROVED');
  const pendingManual = manualPayments.filter((p) => p.status === 'PENDING');
  const rejectedManual = manualPayments.filter((p) => p.status === 'REJECTED');

  const approvedUzs = approvedManual.reduce((acc, p) => acc + (p.uzsAmount || 0), 0);
  const pendingUzs = pendingManual.reduce((acc, p) => acc + (p.uzsAmount || 0), 0);
  const rejectedUzs = rejectedManual.reduce((acc, p) => acc + (p.uzsAmount || 0), 0);

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
      transactionCount: paidStarsTxs.length,
      refundedCount: refundedStarsTxs.length,
      refundedStars,
      monthlyHistory,
    },
    manualUzsRevenue: {
      approvedUzs,
      transactionCount: approvedManual.length,
      pendingUzs,
      pendingCount: pendingManual.length,
      rejectedUzs,
      rejectedCount: rejectedManual.length,
    },
    callQuality,
  };
}
