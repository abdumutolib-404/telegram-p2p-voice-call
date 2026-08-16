import { Context, SessionFlavor } from 'grammy';

export interface SessionData {
  step: 'idle' | 'fc' | 'lr' | 'gra' | 'p' | 'confirm' | 'appeal' | 'awaiting_announcement' | 'awaiting_receipt';
  fc?: number;
  lr?: number;
  gra?: number;
  p?: number;
  appealText?: string;
  pendingPaymentPlan?: 'PLUS' | 'PRO' | 'BOSS';
}

export type MyContext = Context & SessionFlavor<SessionData>;
