/// <reference types="@types/telegram-web-app" />

declare global {
  interface Window {
    Telegram?: {
      WebApp: any;
    };
    __APP_LOGS__?: unknown[];
    __EXPORT_LOGS__?: () => string;
  }
}

export type AppState =
  | 'lockdown'
  | 'ready'
  | 'radar'
  | 'connecting'
  | 'in_call'
  | 'ended'
  | 'idle';

export type LockdownReason =
  | 'browser_direct'
  | 'telegram_no_initdata'
  | 'auth_rejected'
  | 'registration_required'
  | 'terms_required'
  | 'server_unavailable'
  | 'banned'
  | 'suspended'
  | 'rate_limited'
  | 'exhausted_quota';

export type IELTSCriterion = 'FC' | 'LR' | 'GRA' | 'P';
export type WholeBand = 5 | 6 | 7 | 8 | 9;

export interface UserMatchData {
  userId: string;
  telegramId?: number | string;
  alias?: string;
  band: number; // Target IELTS Band (whole band 5, 6, 7, 8, 9)
  subFC?: number; // 5, 6, 7, 8, 9
  subLR?: number; // 5, 6, 7, 8, 9
  subGRA?: number; // 5, 6, 7, 8, 9
  subP?: number; // 5, 6, 7, 8, 9
  weakSkill: IELTSCriterion;
  strongSkill: IELTSCriterion;
  plan?: 'FREE' | 'PLUS' | 'PRO' | 'BOSS' | string;
  planExpiresAt?: string | null;
  callsRemaining?: number;
  totalCallsLimit?: number;
  maxCallDuration?: number; // minutes or seconds
  recordingsRemaining?: number;
  recordingsLimit?: number;
  recordingRetentionDays?: number;
  bannedUntil?: string | null;
  isPermanentlyBanned?: boolean;
  dnd?: boolean;
}

export interface MatchFoundPayload {
  roomName: string;
  livekitToken?: string;
  token?: string;
  livekitUrl?: string;
  partnerAlias: string;
  partnerBand: number;
  callDurationLimit?: number; // seconds
  maxDurationSeconds?: number;
}

export interface RecordStatusPayload {
  record: boolean;
  roomName?: string;
}

export interface RoomRecordingStatusPayload {
  roomName: string;
  state: 'on' | 'off' | 'unknown';
  updatedAt: number;
}

export interface CallEndedPayload {
  duration?: number;
  reason?: string;
}

export interface CallStartedPayload {
  startedAt: number; // timestamp in ms
  durationSeconds: number;
  expiresAt: number; // timestamp in ms
}

export interface SocketErrorPayload {
  code?: string;
  message: string;
}

export interface RecordingErrorPayload {
  code?: string;
  message: string;
}

export interface TelegramUserData {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
}

export interface PaidPlanInfo {
  id: 'PLUS' | 'PRO' | 'BOSS';
  name: string;
  badge: string;
  starsPrice: number;
  uzsPrice: string;
  validityDays: number;
  callLimit: number;
  unlimitedCalls: boolean;
  maxDurationMinutes: number;
  recordingsLimit: number;
  retentionDays: number;
  accentColor: string;
  borderColor: string;
  bgGlow: string;
  description: string;
  features: string[];
}
