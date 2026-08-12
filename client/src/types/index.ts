/// <reference types="@types/telegram-web-app" />

declare global {
  interface Window {
    Telegram?: Telegram;
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
  livekitToken: string;
  livekitUrl?: string;
  partnerAlias: string;
  partnerBand: number;
  callDurationLimit: number;
}

export interface RecordStatusPayload {
  record: boolean;
}

export interface CallEndedPayload {
  reason?: string;
}

export interface SocketErrorPayload {
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
