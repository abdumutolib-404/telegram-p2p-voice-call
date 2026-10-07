import { Router } from 'express';
import { validateTelegramInitData } from '../middleware/initDataLockdown';
import { env } from '../config/env';
import { prisma } from '../config/database';
import { createActionRateLimiter, getClientIp } from '../middleware/rateLimit';
import { hasAcceptedCurrentTerms } from '../services/terms';
import { getEffectiveEntitlement, getPaidUserProfile, getUserCallsUsedThisPeriod, getUserRecordingsUsedThisPeriod } from '../services/plan';
import { getActiveBonusCallsCount } from '../services/referralService';
import { logger } from '../utils/logger';
import { setRequestContextUserId } from '../utils/requestContext';

const router = Router();
const authLimiter = createActionRateLimiter('AUTH_VERIFY', getClientIp);

router.post('/verify', authLimiter, async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
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

    const dbUser = await prisma.user.findUnique({ where: { telegramId: tgUser.id } });
    if (!dbUser) { res.status(403).json({ code: 'registration_required', error: 'Finish registration with /start in the Telegram bot.' }); return; }

    setRequestContextUserId(dbUser.id);

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

    if (dbUser.isBanned && (!dbUser.bannedUntil || new Date(dbUser.bannedUntil) > now)) {
      const remainingSeconds = dbUser.bannedUntil
        ? Math.max(0, Math.ceil((new Date(dbUser.bannedUntil).getTime() - now.getTime()) / 1000))
        : null;
      res.status(403).json({
        error: dbUser.bannedUntil ? 'Account is temporarily suspended.' : 'Account is suspended pending review.',
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

    if (!dbUser.onboarded) { res.status(403).json({ code: 'registration_required', error: 'Finish registration with /start in the Telegram bot.' }); return; }
    if (!hasAcceptedCurrentTerms(dbUser)) { res.status(403).json({ code: 'terms_required', error: 'Read and accept the current Terms of Use with /start in the Telegram bot.' }); return; }

    // The account dashboard remains usable when call allowance is exhausted.
    const callsUsed = await getUserCallsUsedThisPeriod(dbUser.id, dbUser);
    const recUsed = await getUserRecordingsUsedThisPeriod(dbUser.id, dbUser);
    const activeBonusCalls = await getActiveBonusCallsCount(dbUser.id);
    const profile = getPaidUserProfile({
      ...dbUser,
      dailyCallsUsed: callsUsed,
      recordingsUsed: recUsed,
    });

    // Step 4: Quota & Active Session Supervision
    const entitlement = getEffectiveEntitlement(dbUser);
    const effectiveLimit = entitlement.callLimit;
    const isQuotaExhausted =
      !entitlement.isAdmin &&
      callsUsed >= effectiveLimit &&
      activeBonusCalls <= 0;

    const callsRemaining = Math.max(0, effectiveLimit - callsUsed) + activeBonusCalls;
    const accessStatus = 'granted';

    // Step 5: Device-in-call supervision (check for ongoing active session)
    const activeCall = await prisma.callSession.findFirst({
      where: {
        status: 'ACTIVE',
        OR: [{ userAId: dbUser.id }, { userBId: dbUser.id }],
      },
      orderBy: { createdAt: 'desc' },
      include: { userA: true, userB: true },
    });

    const hasActiveCall = Boolean(activeCall);

    // Step 6: Grant Access
    res.json({
      success: true,
      status: accessStatus,
      access: accessStatus,
      canStartCall: !isQuotaExhausted,
      hasActiveCall,
      activeCall: activeCall ? {
        id: activeCall.id,
        roomName: activeCall.roomName,
        partnerAlias: activeCall.userAId === dbUser.id ? activeCall.userB.alias : activeCall.userA.alias,
      } : undefined,
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
        callsRemaining,
        totalCallsLimit: effectiveLimit,
        isBanned: false,
        dnd: dbUser.dnd,
        planExpiresAt: dbUser.subscriptionExpiresAt,
        maxCallDuration: entitlement.maxCallDuration,
        recordingsRemaining: Math.max(0, entitlement.recordingLimit - recUsed),
        recordingsLimit: entitlement.recordingLimit,
        recordingRetentionDays: entitlement.retentionDays,
        profile,
      },
    });
  } catch (error: unknown) {
    logger.error('Auth verification failed', {
      service: 'auth',
      event: 'auth_verify_failed',
    }, error);
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
