export interface MonthlyRevenue {
  month: string;
  stars: number;
  usd: number;
}

export interface StarsRevenue {
  totalStars: number;
  totalUsd: number;
  monthlyHistory: MonthlyRevenue[];
}

export interface CallQualityBreakdown {
  score: number | null;
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
  callQuality?: CallQualityBreakdown;
}

export interface PlanTierConfig {
  name?: string;
  description?: string;
  maxDuration: number;
  dailyLimit: number;
  retentionDays: number;
  starsPrice?: number;
  uzsPrice?: number;
}

export interface PlansResponse {
  FREE: PlanTierConfig;
  PLUS: PlanTierConfig;
  PRO: PlanTierConfig;
}

export interface Subscores {
  fc: number;
  lr: number;
  gra: number;
  p: number;
}

export interface AppealItem {
  id: string;
  userId: string;
  alias: string;
  telegramId: number | string;
  subscores: Subscores;
  banReason: string;
  offenseLogs?: string[];
  appealText: string;
  status?: 'pending' | 'approved' | 'rejected';
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
  planTier: 'free' | 'plus' | 'pro';
  customPlanName?: string | null;
  status: 'active' | 'warned' | 'blocked' | 'banned';
  subscores?: Subscores;
  warningCount?: number;
  dailyLimit?: number;
  dailyCallsUsed?: number;
  maxDuration?: number;
  retentionOverride?: number | null;
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
  totalMinutesSpoken?: number;
}
