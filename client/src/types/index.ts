/// <reference types="@types/telegram-web-app" />

declare global {
  interface Window {
    Telegram?: {
      WebApp: any;
    };
  }
}

export type AppState = 'lockdown' | 'ready' | 'radar' | 'connecting' | 'in_call' | 'ended' | 'idle';

export interface UserMatchData {
  userId: string;
  band: number;
  weakSkill: string;
  strongSkill: string;
}

export interface MatchFoundPayload {
  roomName: string;
  livekitToken?: string;
  token?: string;
  livekitUrl?: string;
  partnerAlias: string;
  partnerBand: number;
  callDurationLimit?: number;
  maxDurationSeconds?: number;
}

export interface RecordStatusPayload {
  record: boolean;
}

export interface CallEndedPayload {
  duration?: number;
  reason?: string;
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
