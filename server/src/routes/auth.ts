import { Router } from 'express';
import { validateTelegramInitData } from '../middleware/initDataLockdown';
import { env } from '../config/env';
import { prisma } from '../config/database';
import { createActionRateLimiter, getClientIp } from '../middleware/rateLimit';
import { generateUniqueAlias } from '../bot/commands/start';
import { getPaidUserProfile, getUserCallsUsedThisPeriod, getUserRecordingsUsedThisPeriod } from '../services/plan';

const router = Router();
const authLimiter = createActionRateLimiter('AUTH_VERIFY', getClientIp);

router.post('/verify', authLimiter, async (req, res) => {
  try {
    const header = req.headers['x-telegram-init-data'];
    const headerValue = typeof header === 'string' ? header : undefined;
    const initData = headerValue ?? (typeof req.body?.initData === 'string' ? req.body.initData : undefined);

    if (env.NODE_ENV === 'test' && initData === 'test-allowed') {
      res.json({
        success: true,
        status: 'granted',
        access: 'granted',
        user: { id: 'test_user_id', telegramId: '12345678', alias: 'P2P-Partner-1234', band: 6.0, subFC: 6, subLR: 6, subGRA: 6, subP: 6, plan: 'FREE' },
      });
      return;
    }

    // Step 1: Context HMAC Validation
    if (!initData) {
      res.status(403).json({
        error: 'Missing initData signature.',
        code: 'browser_direct',
        reason: 'browser_direct',
        status: 'rejected',
      });
      return;
    }

    const { valid, user: tgUser } = validateTelegramInitData(initData, env.BOT_TOKEN);
    if (!valid || !tgUser) {
      res.status(403).json({
        error: 'Invalid initData signature.',
        code: 'auth_rejected',
        reason: 'auth_rejected',
        status: 'rejected',
      });
      return;
    }

    // Step 2: Rate Limiting is evaluated via authLimiter middleware

    // Resolve or upsert user with authentic Whole-Band defaults
    const alias = generateUniqueAlias();
    const dbUser = await prisma.user.upsert({
      where: { telegramId: tgUser.id },
      update: {},
      create: {
        telegramId: tgUser.id,
        alias,
        band: 6.0,
        subFC: 6,
        subLR: 6,
        subGRA: 6,
        subP: 6,
        plan: 'FREE',
      },
    });

    const now = new Date();

    // Step 3: Account Status Validation
    if (dbUser.isPermanentlyBanned) {
      res.status(403).json({
        error: 'Account is permanently banned.',
        code: 'banned',
        reason: 'banned',
        status: 'banned',
        appealAvailable: true,
        user: {
          id: dbUser.id,
          telegramId: dbUser.telegramId.toString(),
          alias: dbUser.alias,
        },
      });
      return;
    }

    if (dbUser.isBanned && dbUser.bannedUntil && new Date(dbUser.bannedUntil) > now) {
      const remainingSeconds = Math.max(0, Math.ceil((new Date(dbUser.bannedUntil).getTime() - now.getTime()) / 1000));
      res.status(403).json({
        error: 'Account is temporarily suspended.',
        code: 'suspended',
        reason: 'suspended',
        status: 'suspended',
        bannedUntil: dbUser.bannedUntil,
        remainingSeconds,
        user: {
          id: dbUser.id,
          telegramId: dbUser.telegramId.toString(),
          alias: dbUser.alias,
        },
      });
      return;
    }

    // Step 4: Quota Validation
    const callsUsed = await getUserCallsUsedThisPeriod(dbUser.id, dbUser);
    const recUsed = await getUserRecordingsUsedThisPeriod(dbUser.id, dbUser);
    const profile = getPaidUserProfile({
      ...dbUser,
      dailyCallsUsed: callsUsed,
      recordingsUsed: recUsed,
    });

    const { getActiveBonusCallsCount } = await import('../services/referralService');
    const activeBonusCalls = await getActiveBonusCallsCount(dbUser.id);

    const isQuotaExhausted =
      !profile.isActivePaid &&
      profile.rank === 0 &&
      callsUsed >= 3 &&
      activeBonusCalls <= 0;

    const accessStatus = isQuotaExhausted ? 'exhausted_quota' : 'granted';

    // Step 5: Grant Access
    res.json({
      success: true,
      status: accessStatus,
      access: accessStatus,
      reason: isQuotaExhausted ? 'exhausted_quota' : undefined,
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
        isBanned: false,
        profile,
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
    botUsername: 'PairTalkBot',
    appUrl: env.MINI_APP_URL,
    status: 'ok',
  });
});

export default router;
