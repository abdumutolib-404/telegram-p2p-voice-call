import type { User } from '@prisma/client';
import type { NextFunction, Response } from 'express';
import { prisma } from '../config/database';
import { hasAcceptedCurrentTerms } from '../services/terms';
import type { AuthenticatedTelegramRequest } from './initDataLockdown';

export interface MemberRequest extends AuthenticatedTelegramRequest { member?: User }
export async function requireRegisteredMember(req: MemberRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    res.setHeader('Cache-Control', 'no-store');
    const user = req.telegramUser ? await prisma.user.findUnique({ where: { telegramId: req.telegramUser.id } }) : null;
    if (!user?.onboarded) { res.status(403).json({ code: 'registration_required', error: 'Finish registration with /start in the Telegram bot.' }); return; }
    if (!hasAcceptedCurrentTerms(user)) { res.status(403).json({ code: 'terms_required', error: 'Read and accept the current Terms of Use with /start in the Telegram bot.' }); return; }
    if (user.isPermanentlyBanned || (user.isBanned && (!user.bannedUntil || user.bannedUntil > new Date()))) {
      res.status(403).json({ code: user.isPermanentlyBanned ? 'banned' : 'suspended', error: 'This account is restricted.', bannedUntil: user.bannedUntil }); return;
    }
    req.member = user;
    next();
  } catch (error) { next(error); }
}
