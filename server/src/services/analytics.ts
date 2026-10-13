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

  // Performance Optimization: Parallelize independent DB queries via Promise.all.
  // Previously, 6 Prisma queries were executed sequentially, incurring unnecessary network round-trip latency.
  // Field-level projection (select) is used for transactions to minimize memory overhead and payload size.
  const [
    totalUsers,
    mau,
    dau,
    allSessions,
    starsTransactions,
    manualPayments,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { updatedAt: { gte: thirtyDaysAgo } } }),
    prisma.user.count({ where: { updatedAt: { gte: oneDayAgo } } }),
    prisma.callSession.findMany({ select: { status: true, duration: true, recordingUrl: true, egressId: true } }),
    prisma.starsTransaction.findMany({ select: { status: true, starsAmount: true, createdAt: true } }),
    prisma.manualPaymentRequest.findMany({ select: { status: true, uzsAmount: true } }),
  ]);

  // Performance Optimization: Single-pass iteration over call sessions
  // Replaces multiple .filter() and .reduce() array traversals with a single loop.
  let totalCalls = 0;
  let activeCalls = 0;
  let cancelledCalls = 0;
  let totalDurationSeconds = 0;
  let recordingAttempts = 0;
  let recordingsSucceeded = 0;

  for (let i = 0; i < allSessions.length; i++) {
    const s = allSessions[i];
    if (s.status === 'COMPLETED') {
      totalCalls++;
      const dur = s.duration || 0;
      totalDurationSeconds += dur;
      if (s.egressId || s.recordingUrl) recordingAttempts++;
      if (s.recordingUrl) recordingsSucceeded++;
    } else if (s.status === 'ACTIVE') {
      activeCalls++;
    } else if (s.status === 'CANCELLED') {
      cancelledCalls++;
    }
  }

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

  // Performance Optimization: Telegram Stars Accounting via single-pass loop
  let totalStars = 0;
  let refundedStars = 0;
  let paidCount = 0;
  let refundedCount = 0;
  const monthlyMap = new Map<string, { stars: number; usd: number }>();

  for (let i = 0; i < starsTransactions.length; i++) {
    const t = starsTransactions[i];
    if (t.status === 'PAID') {
      paidCount++;
      totalStars += t.starsAmount;
      const dateStr = new Date(t.createdAt).toLocaleString('en-US', { month: 'short', year: 'numeric' });
      let entry = monthlyMap.get(dateStr);
      if (!entry) {
        entry = { stars: 0, usd: 0 };
        monthlyMap.set(dateStr, entry);
      }
      entry.stars += t.starsAmount;
      entry.usd += t.starsAmount * 0.013;
    } else if (t.status === 'REFUNDED') {
      refundedCount++;
      refundedStars += t.starsAmount;
    }
  }

  const monthlyHistory: MonthlyRevenue[] = Array.from(monthlyMap.entries()).map(([month, data]) => ({
    month,
    stars: data.stars,
    usd: parseFloat(data.usd.toFixed(2)),
  }));

  // Performance Optimization: Manual UZS Accounting via single-pass loop
  let approvedUzs = 0;
  let approvedCount = 0;
  let pendingUzs = 0;
  let pendingCount = 0;
  let rejectedUzs = 0;
  let rejectedCount = 0;

  for (let i = 0; i < manualPayments.length; i++) {
    const p = manualPayments[i];
    if (p.status === 'APPROVED') {
      approvedCount++;
      approvedUzs += p.uzsAmount || 0;
    } else if (p.status === 'PENDING') {
      pendingCount++;
      pendingUzs += p.uzsAmount || 0;
    } else if (p.status === 'REJECTED') {
      rejectedCount++;
      rejectedUzs += p.uzsAmount || 0;
    }
  }

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
      transactionCount: paidCount,
      refundedCount,
      refundedStars,
      monthlyHistory,
    },
    manualUzsRevenue: {
      approvedUzs,
      transactionCount: approvedCount,
      pendingUzs,
      pendingCount,
      rejectedUzs,
      rejectedCount,
    },
    callQuality,
  };
}
