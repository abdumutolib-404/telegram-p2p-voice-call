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
  maxDuration: number;
  dailyLimit: number;
  retentionDays: number;
  starsPrice?: number;
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
  success: boolean;
  jwtToken: string;
  expiresAt: string;
}

export type ModerationAction = 'warn' | 'block' | 'ban' | 'unblock';
