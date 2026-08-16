import { Context, SessionFlavor } from 'grammy';

export interface SessionData {
  step: 'idle' | 'fc' | 'lr' | 'gra' | 'p' | 'confirm' | 'appeal' | 'awaiting_announcement';
  fc?: number;
  lr?: number;
  gra?: number;
  p?: number;
  appealText?: string;
}

export type MyContext = Context & SessionFlavor<SessionData>;
