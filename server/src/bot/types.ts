import { Context, SessionFlavor } from 'grammy';

export interface SessionData {
  step: 'idle' | 'terms' | 'fc' | 'lr' | 'gra' | 'p' | 'confirm' | 'appeal' | 'awaiting_announcement' | 'awaiting_receipt' | 'awaiting_refund_card';
  termsOffer?: { version: string; sha256: string; messageId: number };
  pendingReferralPayload?: string;
  fc?: number;
  lr?: number;
  gra?: number;
  p?: number;
  appealText?: string;
  pendingPaymentPlan?: 'PLUS' | 'PRO' | 'BOSS';
  pendingRefundManualReqId?: string;
}

export type MyContext = Context & SessionFlavor<SessionData>;
