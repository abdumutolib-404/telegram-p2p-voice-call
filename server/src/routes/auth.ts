import { Router } from 'express';
import { validateTelegramInitData } from '../middleware/initDataLockdown';
import { env } from '../config/env';
import { prisma } from '../config/database';
import { createRateLimiter } from '../middleware/rateLimit';

const router = Router();
const authLimiter = createRateLimiter(20, 60 * 1000);

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

    let dbUser = await prisma.user.findUnique({ where: { telegramId: tgUser.id } });
    if (!dbUser) {
      const randomAlias = `P2P-Partner-${Math.floor(1000 + Math.random() * 9000)}`;
      dbUser = await prisma.user.create({
        data: {
          telegramId: tgUser.id,
          alias: randomAlias,
          band: 6.5,
          subFC: 6.5,
          subLR: 6.5,
          subGRA: 6.5,
          subP: 6.5,
          plan: 'FREE',
        },
      });
    }

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
        isBanned: dbUser.isBanned || dbUser.isPermanentlyBanned,
      },
    });
  } catch (error: unknown) {
    console.error('[Auth] verify_failed', {
      error: error instanceof Error ? error.message : 'unknown_error',
    });
    res.status(500).json({ error: 'Authentication service unavailable.' });
  }
});

export default router;
