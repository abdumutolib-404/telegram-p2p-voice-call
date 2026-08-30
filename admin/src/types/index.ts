export interface MonthlyRevenue {
  month: string;
  stars: number;
  usd: number;
}

export interface StarsRevenue {
  totalStars: number;
  totalUsd: number;
  transactionCount?: number;
  refundedCount?: number;
  refundedStars?: number;
  monthlyHistory: MonthlyRevenue[];
}

export interface ManualUzsRevenue {
  approvedUzs: number;
  transactionCount: number;
  pendingUzs: number;
  pendingCount: number;
  rejectedUzs: number;
  rejectedCount: number;
}

export interface CallQualityBreakdown {
  score: number | null; // null if insufficient sample size
  sampleSize: number;
  statusMessage: 'Optimal' | 'Good' | 'Degraded' | 'Insufficient sample size';
  completionRate: number;
  audioReliability: number;
  recordingReliability: number;
  cancellationRate: number;
  averageDurationSeconds: number;
}

export interface AdminStats {
  totalUsers: number;
  mau: number;
  dau: number;
  totalCalls?: number;
  totalMinutesSpoken?: number;
  activeCalls: number;
  starsRevenue: StarsRevenue;
  manualUzsRevenue?: ManualUzsRevenue;
  callQuality?: CallQualityBreakdown;
}

export interface PlanTierConfig {
  name?: string;
  description?: string;
  maxDuration: number;
  dailyLimit: number;
  callsLimit?: number;
  recordingLimit?: number;
  retentionDays: number;
  starsPrice?: number;
  uzsPrice?: number;
  subscriptionDurationDays?: number;
  active?: boolean;
}

export interface PlansResponse {
  FREE: PlanTierConfig;
  PLUS: PlanTierConfig;
  PRO: PlanTierConfig;
  BOSS: PlanTierConfig;
}

export interface Subscores {
  fc: number;
  lr: number;
  gra: number;
  p: number;
  band?: number;
}

export interface AppealItem {
  id: string;
  userId: string;
  alias: string;
  telegramId: number | string;
  subscores?: Subscores;
  banReason: string;
  offenseLogs?: string[];
  appealText: string;
  status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

export interface UserItem {
  id: string;
  telegramId: number | string;
  alias: string;
  role?: 'user' | 'admin';
  targetBand?: number;
  weakSkill?: string;
  strongSkill?: string;
  planTier: 'free' | 'plus' | 'pro' | 'boss' | 'FREE' | 'PLUS' | 'PRO' | 'BOSS';
  customPlanName?: string | null;
  status: 'active' | 'warned' | 'blocked' | 'banned';
  subscores?: Subscores;
  warningCount?: number;
  dailyLimit?: number;
  dailyCallsUsed?: number;
  maxDuration?: number;
  retentionOverride?: number | null;
  recordingLimitOverride?: number | null;
  createdAt: string;
}

export type ModerationAction =
  | 'warn'
  | 'block'
  | 'ban'
  | 'unban'
  | 'unblock'
  | 'reset-calls'
  | 'reset-score'
  | 'upgrade-plan';

export interface ManualPaymentRequestItem {
  id: string;
  orderNumber?: string;
  userId: string;
  alias: string;
  telegramId: string;
  planTier: string;
  amountUzs: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  paymentProof?: string | null;
  adminNote?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
  user?: {
    band: number;
    currentPlan: string;
    isBanned: boolean;
  };
}

export interface StarsTransactionItem {
  id: string;
  orderNumber?: string;
  userId: string;
  alias: string;
  telegramId: string;
  telegramPaymentId: string;
  starsAmount: number;
  planTier: string;
  status: 'PAID' | 'REFUND_PENDING' | 'REFUNDED';
  refundReason?: string | null;
  refundedAt?: string | null;
  createdAt: string;
}

export interface AuditLogItem {
  id: string;
  action: string;
  targetId?: string | null;
  adminId: string;
  beforeState?: string | null;
  afterState?: string | null;
  reason?: string | null;
  createdAt: string;
}

export interface AuthResponse {
  jwtToken: string;
  expiresAt: string;
}

export interface PasswordResponse {
  success: boolean;
  challengeId: string;
  expiresAt: string;
  step?: string;
  testOtp?: string;
}

export interface OtpResponse {
  success?: boolean;
  jwtToken: string;
  expiresAt: string;
}

export interface AnalyticsData {
  dau: number;
  mau: number;
  activeCalls: number;
  totalUsers: number;
  totalCalls: number;
  starsRevenue: StarsRevenue;
  manualUzsRevenue?: ManualUzsRevenue;
  totalMinutesSpoken?: number;
}
