import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { verifyAndConsumeAdminToken } from '../bot/commands/admin';
import { env } from '../config/env';
import { adminAuthMiddleware } from '../middleware/adminAuth';
import { getAdminAnalytics } from '../services/analytics';
import { getPlansConfig, updatePlansConfig } from '../services/plan';
import { prisma } from '../config/database';

import { createRateLimiter } from '../middleware/rateLimit';

const router = Router();
const adminLoginLimiter = createRateLimiter(5, 60 * 1000); // 5 attempts per minute max

// POST /api/admin/login (Stealth 2FA token + Master Password Exchange)
router.post('/login', adminLoginLimiter, async (req, res) => {
  const { token, masterPassword } = req.body;

  if (!token || !masterPassword) {
    return res.status(400).json({ error: 'Missing token or masterPassword.' });
  }

  // Validate master password
  if (masterPassword !== env.MASTER_PASSWORD) {
    return res.status(401).json({ error: 'Invalid master password.' });
  }

  // Validate and consume single-use 2FA token
  let telegramId = await verifyAndConsumeAdminToken(token);

  // In test environment or if explicitly enabled for dev
  if (!telegramId && (env.NODE_ENV === 'test' || process.env.ALLOW_DEV_ADMIN_BYPASS === 'true')) {
    if (token === 'dev_admin_token' || token === 'test_admin_token') {
      telegramId = env.ADMIN_TELEGRAM_IDS[0] || 12345678;
    }
  }

  if (!telegramId) {
    return res.status(401).json({ error: 'Invalid or expired 2FA login token.' });
  }

  const jwtToken = jwt.sign(
    {
      telegramId,
      role: 'admin',
    },
    env.JWT_SECRET,
    { expiresIn: '24h' }
  );

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  res.json({
    success: true,
    jwtToken,
    expiresAt,
  });
});

// GET /api/admin/stats (Protected)
router.get('/stats', adminAuthMiddleware, async (req, res) => {
  try {
    const stats = await getAdminAnalytics();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve analytics stats.' });
  }
});

// GET /api/admin/plans (Protected)
router.get('/plans', adminAuthMiddleware, async (req, res) => {
  res.json(getPlansConfig());
});

// PUT /api/admin/plans (Protected)
router.put('/plans', adminAuthMiddleware, async (req, res) => {
  try {
    const updated = updatePlansConfig(req.body);
    res.json({ success: true, plans: updated });
  } catch (err) {
    res.status(400).json({ error: 'Failed to update plan configurations.' });
  }
});

// GET /api/admin/appeals (Protected)
router.get('/appeals', adminAuthMiddleware, async (req, res) => {
  try {
    const appeals = await prisma.unblockAppeal.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        user: true,
      },
    });

    const formatted = appeals.map((a) => ({
      id: a.id,
      userId: a.userId,
      alias: a.alias,
      telegramId: a.telegramId.toString(),
      banReason: a.banReason,
      appealText: a.appealText,
      status: a.status,
      createdAt: a.createdAt,
      reviewedAt: a.reviewedAt,
      subscores: {
        fc: a.user.subFC,
        lr: a.user.subLR,
        gra: a.user.subGRA,
        p: a.user.subP,
        band: a.user.band,
      },
    }));

    res.json(formatted);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve ban appeals.' });
  }
});

// POST /api/admin/appeals/:id/approve (Protected)
router.post('/appeals/:id/approve', adminAuthMiddleware, async (req, res) => {
  const { id } = req.params;

  try {
    const appeal = await prisma.unblockAppeal.findUnique({ where: { id } });

    if (!appeal) {
      return res.status(404).json({ error: 'Appeal not found.' });
    }

    // Update appeal status
    await prisma.unblockAppeal.update({
      where: { id },
      data: { status: 'APPROVED', reviewedAt: new Date() },
    });

    // Unban user and reset warnings
    await prisma.user.update({
      where: { id: appeal.userId },
      data: {
        isBanned: false,
        isPermanentlyBanned: false,
        bannedUntil: null,
        warningCount: 0,
      },
    });

    res.json({ success: true, message: 'Unblock appeal approved. User unbanned.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to approve appeal.' });
  }
});

// POST /api/admin/appeals/:id/reject (Protected)
router.post('/appeals/:id/reject', adminAuthMiddleware, async (req, res) => {
  const { id } = req.params;

  try {
    const appeal = await prisma.unblockAppeal.findUnique({ where: { id } });

    if (!appeal) {
      return res.status(404).json({ error: 'Appeal not found.' });
    }

    await prisma.unblockAppeal.update({
      where: { id },
      data: { status: 'REJECTED', reviewedAt: new Date() },
    });

    res.json({ success: true, message: 'Unblock appeal rejected.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reject appeal.' });
  }
});

// GET /api/admin/users (Protected)
router.get('/users', adminAuthMiddleware, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    res.json(
      users.map((u) => ({
        ...u,
        telegramId: u.telegramId.toString(),
      }))
    );
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users.' });
  }
});

// POST /api/admin/users/:id/ban (Protected)
router.post('/users/:id/ban', adminAuthMiddleware, async (req, res) => {
  const { id } = req.params;
  const { permanent } = req.body;

  try {
    const user = await prisma.user.update({
      where: { id },
      data: {
        isBanned: true,
        isPermanentlyBanned: permanent ?? true,
        bannedUntil: permanent ? null : new Date(Date.now() + 6 * 60 * 60 * 1000),
      },
    });

    res.json({ success: true, user: { ...user, telegramId: user.telegramId.toString() } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to ban user.' });
  }
});

export default router;
