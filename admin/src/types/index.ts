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

export interface AdminStats {
  totalUsers: number;
  mau: number;
  dau: number;
  activeCalls: number;
  starsRevenue: StarsRevenue;
}

export interface PlanTierConfig {
  maxDuration: number;
  dailyLimit: number;
  retentionDays: number;
  starsPrice?: number;
}

export interface PlansResponse {
  free: PlanTierConfig;
  plus: PlanTierConfig;
  pro: PlanTierConfig;
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
  status: 'active' | 'warned' | 'blocked' | 'banned';
  subscores?: Subscores;
  warningCount?: number;
  createdAt: string;
}

export interface AuthResponse {
  jwtToken: string;
  expiresAt: string;
}

export type ModerationAction = 'warn' | 'block' | 'ban' | 'unblock';
