import { Router } from 'express';
import crypto from 'node:crypto';
import { Prisma } from '@prisma/client';
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
  try {
    const token = typeof req.body?.token === 'string' ? req.body.token : '';
    const masterPassword = typeof req.body?.masterPassword === 'string' ? req.body.masterPassword : '';

    if (!token || !masterPassword) {
      res.status(400).json({ error: 'Missing token or masterPassword.' });
      return;
    }

    if (!cryptoSafeEqualString(masterPassword, env.MASTER_PASSWORD)) {
      res.status(401).json({ error: 'Invalid master password.' });
      return;
    }

    let telegramId = await verifyAndConsumeAdminToken(token);
    if (!telegramId && env.NODE_ENV === 'test' && token === 'test_admin_token') {
      telegramId = env.ADMIN_TELEGRAM_IDS[0] ?? null;
    }
    if (!telegramId || !env.ADMIN_TELEGRAM_IDS.includes(telegramId)) {
      res.status(401).json({ error: 'Invalid or expired 2FA login token.' });
      return;
    }

    const jwtToken = jwt.sign({ telegramId, role: 'admin' }, env.JWT_SECRET, { expiresIn: '24h', algorithm: 'HS256' });
    res.json({ success: true, jwtToken, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() });
  } catch (error: unknown) {
    console.error('[Admin] login_failed', {
      error: error instanceof Error ? error.message : 'unknown_error',
    });
    res.status(500).json({ error: 'Admin authentication unavailable.' });
  }
});

function cryptoSafeEqualString(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

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
    const query = (req.query.query as string || '').trim();
    const statusFilter = req.query.status as string || '';

    const where: Prisma.UserWhereInput = {};
    if (query) {
      where.OR = [
        { alias: { contains: query, mode: 'insensitive' } },
        { telegramId: BigInt(query) || undefined },
      ].filter(Boolean);
      // Handle non-numeric query gracefully for telegramId
      try {
        const numId = BigInt(query);
        where.OR = [
          { alias: { contains: query, mode: 'insensitive' } },
          { telegramId: numId },
        ];
      } catch {
        where.OR = [
          { alias: { contains: query, mode: 'insensitive' } },
        ];
      }
    }

    // Status-based filtering
    if (statusFilter === 'banned') {
      where.isPermanentlyBanned = true;
    } else if (statusFilter === 'blocked') {
      where.isBanned = true;
      where.isPermanentlyBanned = false;
    } else if (statusFilter === 'warned') {
      where.warningCount = { gt: 0 };
      where.isBanned = false;
    } else if (statusFilter === 'active') {
      where.isBanned = false;
      where.isPermanentlyBanned = false;
      where.warningCount = 0;
    }

    const users = await prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    const now = new Date();
    const formatted = users.map((u) => {
      let status: string = 'active';
      if (u.isPermanentlyBanned) {
        status = 'banned';
      } else if (u.isBanned && u.bannedUntil && u.bannedUntil > now) {
        status = 'blocked';
      } else if (u.warningCount > 0 && !u.isBanned) {
        status = 'warned';
      }

      return {
        id: u.id,
        telegramId: u.telegramId.toString(),
        alias: u.alias,
        planTier: u.plan.toLowerCase(),
        status,
        subscores: {
          fc: u.subFC,
          lr: u.subLR,
          gra: u.subGRA,
          p: u.subP,
        },
        warningCount: u.warningCount,
        createdAt: u.createdAt.toISOString(),
      };
    });

    res.json(formatted);
  } catch (err) {
    console.error('[Admin] Failed to fetch users:', err);
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

// POST /api/admin/users/:id/moderate (Protected)
router.post('/users/:id/moderate', adminAuthMiddleware, async (req, res) => {
  const { id } = req.params;
  const { action, reason } = req.body;

  if (!action || !['warn', 'block', 'ban', 'unblock'].includes(action)) {
    return res.status(400).json({ error: 'Invalid moderation action. Must be warn, block, ban, or unblock.' });
  }

  try {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    let updateData: Prisma.UserUpdateInput = {};
    switch (action) {
      case 'warn':
        updateData = { warningCount: { increment: 1 } };
        break;
      case 'block':
        updateData = {
          isBanned: true,
          isPermanentlyBanned: false,
          bannedUntil: new Date(Date.now() + 6 * 60 * 60 * 1000), // 6 hours
        };
        break;
      case 'ban':
        updateData = {
          isBanned: true,
          isPermanentlyBanned: true,
          bannedUntil: null,
        };
        break;
      case 'unblock':
        updateData = {
          isBanned: false,
          isPermanentlyBanned: false,
          bannedUntil: null,
          warningCount: 0,
        };
        break;
    }

    const updated = await prisma.user.update({
      where: { id },
      data: updateData,
    });

    const now = new Date();
    let status = 'active';
    if (updated.isPermanentlyBanned) status = 'banned';
    else if (updated.isBanned && updated.bannedUntil && updated.bannedUntil > now) status = 'blocked';
    else if (updated.warningCount > 0 && !updated.isBanned) status = 'warned';

    res.json({
      id: updated.id,
      telegramId: updated.telegramId.toString(),
      alias: updated.alias,
      planTier: updated.plan.toLowerCase(),
      status,
      subscores: {
        fc: updated.subFC,
        lr: updated.subLR,
        gra: updated.subGRA,
        p: updated.subP,
      },
      warningCount: updated.warningCount,
      createdAt: updated.createdAt.toISOString(),
    });
  } catch (err) {
    console.error('[Admin] Moderation action failed:', err);
    res.status(500).json({ error: 'Failed to execute moderation action.' });
  }
});

export default router;
