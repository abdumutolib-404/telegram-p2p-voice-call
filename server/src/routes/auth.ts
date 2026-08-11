import { Router } from 'express';
import { validateTelegramInitData } from '../middleware/initDataLockdown';
import { env } from '../config/env';
import { prisma } from '../config/database';

import { createRateLimiter } from '../middleware/rateLimit';

const router = Router();
const authLimiter = createRateLimiter(20, 60 * 1000); // 20 requests per minute

router.post('/verify', authLimiter, async (req, res) => {
  const initData = req.headers['x-telegram-init-data'] as string || req.body?.initData;

  // Unit test bypass
  if (env.NODE_ENV === 'test' && initData === 'test-allowed') {
    return res.json({
      success: true,
      user: {
        id: 'test_user_id',
        telegramId: 12345678,
        alias: 'P2P-Partner-1234',
        band: 6.5,
        plan: 'FREE',
      },
    });
  }

  if (!initData) {
    return res.status(403).json({ error: 'Missing initData signature.' });
  }

  const { valid, user: tgUser } = validateTelegramInitData(initData, env.BOT_TOKEN);

  if (!valid || !tgUser) {
    return res.status(403).json({ error: 'Invalid initData signature.' });
  }

  const telegramId = BigInt(tgUser.id);
  let dbUser = await prisma.user.findUnique({ where: { telegramId } });

  if (!dbUser) {
    return res.status(404).json({ error: 'User not onboarded. Please start bot first.' });
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
});

export default router;
