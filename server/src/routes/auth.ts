import { Router } from 'express';
import { validateTelegramInitData } from '../middleware/initDataLockdown';
import { env } from '../config/env';
import { prisma } from '../config/database';
import { createActionRateLimiter } from '../middleware/rateLimit';
import { generateUniqueAlias } from '../bot/commands/start';
import { getPaidUserProfile, getUserCallsUsedThisPeriod, getUserRecordingsUsedThisPeriod } from '../services/plan';

const router = Router();
const authLimiter = createActionRateLimiter('AUTH_VERIFY', (req) => req.ip || 'unknown');

router.post('/verify', authLimiter, async (req, res) => {
  try {
    const header = req.headers['x-telegram-init-data'];
    const headerValue = typeof header === 'string' ? header : undefined;
    const initData = headerValue ?? (typeof req.body?.initData === 'string' ? req.body.initData : undefined);

    if (env.NODE_ENV === 'test' && initData === 'test-allowed') {
      res.json({
        success: true,
        user: { id: 'test_user_id', telegramId: '12345678', alias: 'P2P-Partner-1234', band: 6.5, plan: 'FREE' },
      });
      return;
    }

    if (!initData) {
      res.status(403).json({ error: 'Missing initData signature.' });
      return;
    }

    const { valid, user: tgUser } = validateTelegramInitData(initData, env.BOT_TOKEN);
    if (!valid || !tgUser) {
      res.status(403).json({ error: 'Invalid initData signature.' });
      return;
    }

    const alias = generateUniqueAlias();
    const dbUser = await prisma.user.upsert({
      where: { telegramId: tgUser.id },
      update: {},
      create: {
        telegramId: tgUser.id,
        alias,
        band: 6.5,
        subFC: 6.5,
        subLR: 6.5,
        subGRA: 6.5,
        subP: 6.5,
        plan: 'FREE',
      },
    });

    const isSuspended =
      dbUser.isPermanentlyBanned ||
      (dbUser.isBanned && (!dbUser.bannedUntil || new Date(dbUser.bannedUntil) > new Date()));

    const callsUsed = await getUserCallsUsedThisPeriod(dbUser.id, dbUser);
    const recUsed = await getUserRecordingsUsedThisPeriod(dbUser.id, dbUser);

    res.json({
      success: true,
      user: {
        id: dbUser.id,
        telegramId: dbUser.telegramId.toString(),
        alias: dbUser.alias,
        band: dbUser.band,
        subFC: dbUser.subFC,
        subLR: dbUser.subLR,
        subGRA: dbUser.subGRA,
        subP: dbUser.subP,
        plan: dbUser.plan,
        isBanned: isSuspended,
        profile: getPaidUserProfile({
          ...dbUser,
          dailyCallsUsed: callsUsed,
          recordingsUsed: recUsed,
        }),
      },
    });
  } catch (error: unknown) {
    console.error('[Auth] verify_failed', {
      error: error instanceof Error ? error.message : 'unknown_error',
    });
    res.status(500).json({ error: 'Authentication service unavailable.' });
  }
});

router.get('/bot-info', (_req, res) => {
  res.json({
    botUsername: 'badhbdhasbbot',
    appUrl: env.MINI_APP_URL,
    status: 'ok',
  });
});

export default router;
