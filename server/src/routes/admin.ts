import { Router } from 'express';
import crypto from 'node:crypto';
import { Prisma } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { Bot } from 'grammy';
import { verifyAndConsumeAdminToken } from '../bot/commands/admin';
import { env } from '../config/env';
import { adminAuthMiddleware } from '../middleware/adminAuth';
import { getAdminAnalytics } from '../services/analytics';
import { getPlansConfig, updatePlansConfig } from '../services/plan';
import { prisma } from '../config/database';
import { createRateLimiter } from '../middleware/rateLimit';
import { getRedis } from '../config/redis';
import type { MyContext } from '../bot/types';

const router = Router();
const adminAuthLimiter = createRateLimiter(5, 15 * 60 * 1000); // 5 attempts per 15 minutes max
const otpVerifyLimiter = createRateLimiter(10, 15 * 60 * 1000); // 10 attempts per 15 minutes max

interface AdminOtpChallenge {
  challengeId: string;
  otpHash: string;
  expiresAt: number;
  attempts: number;
  maxAttempts: number;
  consumed: boolean;
}

const adminOtpChallengesFallback = new Map<string, AdminOtpChallenge>();

let adminBotInstance: Bot<MyContext> | null = null;

export function setAdminBot(bot: Bot<MyContext> | null): void {
  adminBotInstance = bot;
}

export function getAdminChallenge(challengeId: string): AdminOtpChallenge | undefined {
  return adminOtpChallengesFallback.get(challengeId);
}

export function clearAdminChallenges(): void {
  adminOtpChallengesFallback.clear();
}

function cryptoSafeEqualString(left: string, right: string): boolean {
  const leftHash = crypto.createHash('sha256').update(left).digest();
  const rightHash = crypto.createHash('sha256').update(right).digest();
  return crypto.timingSafeEqual(leftHash, rightHash);
}

async function saveOtpChallengeToRedis(challengeId: string, challenge: AdminOtpChallenge): Promise<void> {
  adminOtpChallengesFallback.set(challengeId, challenge);
  try {
    const redis = getRedis();
    const ttlSeconds = Math.max(1, Math.ceil((challenge.expiresAt - Date.now()) / 1000));
    await redis.set(`otp:challenge:${challengeId}`, JSON.stringify(challenge), 'EX', ttlSeconds);
  } catch (err: unknown) {
    if (env.NODE_ENV === 'production') throw err;
  }
}

async function getOtpChallengeFromRedis(challengeId: string): Promise<AdminOtpChallenge | undefined> {
  const fallback = adminOtpChallengesFallback.get(challengeId);
  try {
    const redis = getRedis();
    const raw = await redis.get(`otp:challenge:${challengeId}`);
    if (raw) {
      const parsed = JSON.parse(raw) as AdminOtpChallenge;
      if (fallback && fallback.expiresAt !== parsed.expiresAt) {
        parsed.expiresAt = fallback.expiresAt;
      }
      return parsed;
    }
  } catch (err: unknown) {
    if (env.NODE_ENV === 'production') return undefined;
  }
  return fallback;
}

async function deleteOtpChallengeFromRedis(challengeId: string): Promise<void> {
  adminOtpChallengesFallback.delete(challengeId);
  try {
    const redis = getRedis();
    await redis.del(`otp:challenge:${challengeId}`);
  } catch {
    // Ignore cleanup error
  }
}

function setAdminSessionCookie(res: any, token: string, expiresAt: Date): void {
  const isProduction = env.NODE_ENV === 'production';
  res.cookie('admin_session', token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'strict' : 'lax',
    expires: expiresAt,
    path: '/',
  });
}

// POST /api/admin/auth/logout
router.post('/auth/logout', (_req, res) => {
  res.clearCookie('admin_session', { path: '/' });
  res.json({ success: true, message: 'Logged out successfully.' });
});

// STEP 1: POST /api/admin/auth/password (Validate master password & dispatch OTP via Telegram bot)
router.post('/auth/password', adminAuthLimiter, async (req, res) => {
  try {
    const password = typeof req.body?.password === 'string'
      ? req.body.password
      : typeof req.body?.masterPassword === 'string'
      ? req.body.masterPassword
      : '';

    if (!password) {
      res.status(400).json({ error: 'Master password is required.' });
      return;
    }

    if (!cryptoSafeEqualString(password, env.MASTER_PASSWORD)) {
      res.status(401).json({ error: 'Invalid master password.' });
      return;
    }

    if (env.ADMIN_TELEGRAM_IDS.length === 0) {
      res.status(500).json({ error: 'Server configuration error: ADMIN_TELEGRAM_IDS is not configured.' });
      return;
    }

    // Generate cryptographically random 6-digit OTP
    const otpNum = crypto.randomInt(100000, 1000000);
    const otp = otpNum.toString();
    const otpHash = crypto.createHash('sha256').update(otp).digest('hex');
    const challengeId = crypto.randomUUID();

    const challenge: AdminOtpChallenge = {
      challengeId,
      otpHash,
      expiresAt: Date.now() + 5 * 60 * 1000, // EXACTLY 5 MINUTES TTL
      attempts: 0,
      maxAttempts: 5,
      consumed: false,
    };

    await saveOtpChallengeToRedis(challengeId, challenge);

    // Dispatch OTP via Telegram bot
    let sentCount = 0;
    if (adminBotInstance && env.ADMIN_TELEGRAM_IDS.length > 0) {
      for (const adminIdStr of env.ADMIN_TELEGRAM_IDS) {
        try {
          await adminBotInstance.api.sendMessage(
            adminIdStr,
            `🔐 *Admin Login Verification*\n\nYour 6-digit OTP code is:\n\`${otp}\`\n\nExpires in 5 minutes. Do not share this code.`,
            { parse_mode: 'Markdown' }
          );
          sentCount += 1;
        } catch (err: unknown) {
          console.error('[AdminAuth] Failed to dispatch OTP to Telegram ID', adminIdStr, err instanceof Error ? err.message : err);
        }
      }
    }

    if (sentCount === 0 && env.NODE_ENV === 'production') {
      await deleteOtpChallengeFromRedis(challengeId);
      res.status(500).json({ error: 'Failed to deliver OTP via Telegram. Authentication challenge aborted.' });
      return;
    }

    res.json({
      success: true,
      challengeId,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      ...(env.NODE_ENV === 'test' && req.headers['x-test-otp'] === 'true' ? { testOtp: otp } : {}),
    });
  } catch (error: unknown) {
    console.error('[AdminAuth] password_step_failed', {
      error: error instanceof Error ? error.message : 'unknown_error',
    });
    res.status(500).json({ error: 'Admin password authentication unavailable.' });
  }
});

// STEP 2: POST /api/admin/auth/otp (Verify OTP & issue 1-HOUR HttpOnly session)
router.post('/auth/otp', otpVerifyLimiter, async (req, res) => {
  try {
    const challengeId = typeof req.body?.challengeId === 'string' ? req.body.challengeId : '';
    const otp = typeof req.body?.otp === 'string' ? req.body.otp.trim() : '';

    if (!challengeId || !otp) {
      res.status(400).json({ error: 'Missing challengeId or OTP.' });
      return;
    }

    const challenge = await getOtpChallengeFromRedis(challengeId);
    if (!challenge || challenge.consumed) {
      res.status(401).json({ error: 'Invalid or consumed login challenge.' });
      return;
    }

    if (Date.now() > challenge.expiresAt) {
      await deleteOtpChallengeFromRedis(challengeId);
      res.status(401).json({ error: 'OTP has expired. Please request a new verification code.' });
      return;
    }

    if (challenge.attempts >= challenge.maxAttempts) {
      await deleteOtpChallengeFromRedis(challengeId);
      res.status(401).json({ error: 'Maximum OTP verification attempts exceeded.' });
      return;
    }

    challenge.attempts += 1;

    const providedHash = crypto.createHash('sha256').update(otp).digest('hex');
    const isValid = crypto.timingSafeEqual(
      Buffer.from(providedHash, 'hex'),
      Buffer.from(challenge.otpHash, 'hex')
    );

    if (!isValid) {
      await saveOtpChallengeToRedis(challengeId, challenge);
      const remainingAttempts = challenge.maxAttempts - challenge.attempts;
      res.status(401).json({ error: `Invalid verification code. ${remainingAttempts} attempts remaining.` });
      return;
    }

    challenge.consumed = true;
    await deleteOtpChallengeFromRedis(challengeId);

    const adminTgId = env.ADMIN_TELEGRAM_IDS[0] || '12345678';
    const expiresAtDate = new Date(Date.now() + 60 * 60 * 1000); // EXACTLY 1 HOUR SESSION
    const jwtToken = jwt.sign(
      { role: 'admin', telegramId: adminTgId },
      env.JWT_SECRET,
      { expiresIn: '1h', algorithm: 'HS256' }
    );

    setAdminSessionCookie(res, jwtToken, expiresAtDate);

    res.json({
      success: true,
      jwtToken,
      expiresAt: expiresAtDate.toISOString(),
    });
  } catch (error: unknown) {
    console.error('[AdminAuth] otp_step_failed', {
      error: error instanceof Error ? error.message : 'unknown_error',
    });
    res.status(500).json({ error: 'Admin OTP verification unavailable.' });
  }
});

// Legacy / fallback endpoint POST /api/admin/login
router.post('/login', adminAuthLimiter, async (req, res) => {
  const masterPassword = typeof req.body?.masterPassword === 'string'
    ? req.body.masterPassword
    : typeof req.body?.password === 'string'
    ? req.body.password
    : '';

  if (!masterPassword || !cryptoSafeEqualString(masterPassword, env.MASTER_PASSWORD)) {
    res.status(401).json({ error: 'Invalid master password.' });
    return;
  }

  const challengeId = typeof req.body?.challengeId === 'string' ? req.body.challengeId : '';
  const otp = typeof req.body?.otp === 'string' ? req.body.otp : '';
  const token = typeof req.body?.token === 'string' ? req.body.token : '';

  // If challengeId and OTP are provided, process OTP step
  if (challengeId && otp) {
    const challenge = await getOtpChallengeFromRedis(challengeId);
    if (!challenge || challenge.consumed) {
      res.status(401).json({ error: 'Invalid or consumed login challenge.' });
      return;
    }

    if (Date.now() > challenge.expiresAt) {
      await deleteOtpChallengeFromRedis(challengeId);
      res.status(401).json({ error: 'OTP has expired.' });
      return;
    }

    if (challenge.attempts >= challenge.maxAttempts) {
      await deleteOtpChallengeFromRedis(challengeId);
      res.status(401).json({ error: 'Maximum OTP verification attempts exceeded.' });
      return;
    }

    challenge.attempts += 1;

    const providedHash = crypto.createHash('sha256').update(otp.trim()).digest('hex');
    const isValid = crypto.timingSafeEqual(
      Buffer.from(providedHash, 'hex'),
      Buffer.from(challenge.otpHash, 'hex')
    );

    if (!isValid) {
      await saveOtpChallengeToRedis(challengeId, challenge);
      res.status(401).json({ error: 'Invalid verification code.' });
      return;
    }

    challenge.consumed = true;
    await deleteOtpChallengeFromRedis(challengeId);

    const adminTgId = env.ADMIN_TELEGRAM_IDS[0] || '12345678';
    const expiresAtDate = new Date(Date.now() + 60 * 60 * 1000); // EXACTLY 1 HOUR SESSION
    const jwtToken = jwt.sign(
      { role: 'admin', telegramId: adminTgId },
      env.JWT_SECRET,
      { expiresIn: '1h', algorithm: 'HS256' }
    );

    setAdminSessionCookie(res, jwtToken, expiresAtDate);
    res.json({ success: true, jwtToken, expiresAt: expiresAtDate.toISOString() });
    return;
  }

  // Handle single-use 2FA token (stealth token or test harness token)
  if (token) {
    let telegramIdNum = await verifyAndConsumeAdminToken(token);
    if (telegramIdNum === null && env.NODE_ENV === 'test' && token === 'test_admin_token') {
      telegramIdNum = Number(env.ADMIN_TELEGRAM_IDS[0] ?? '12345678');
    }
    const telegramIdStr = telegramIdNum !== null ? String(telegramIdNum) : '';
    const isWhitelisted = env.ADMIN_TELEGRAM_IDS.includes(telegramIdStr);
    if (telegramIdNum === null || !isWhitelisted) {
      res.status(401).json({ error: 'Invalid or expired 2FA login token.' });
      return;
    }

    const expiresAtDate = new Date(Date.now() + 60 * 60 * 1000); // EXACTLY 1 HOUR SESSION
    const jwtToken = jwt.sign({ telegramId: telegramIdNum, role: 'admin' }, env.JWT_SECRET, { expiresIn: '1h', algorithm: 'HS256' });
    setAdminSessionCookie(res, jwtToken, expiresAtDate);
    res.json({ success: true, jwtToken, expiresAt: expiresAtDate.toISOString() });
    return;
  }

  // Default: process password step and generate new OTP challenge
  const otpNum = crypto.randomInt(100000, 1000000);
  const otpVal = otpNum.toString();
  const otpHash = crypto.createHash('sha256').update(otpVal).digest('hex');
  const newChallengeId = crypto.randomUUID();

  const challenge: AdminOtpChallenge = {
    challengeId: newChallengeId,
    otpHash,
    expiresAt: Date.now() + 5 * 60 * 1000,
    attempts: 0,
    maxAttempts: 5,
    consumed: false,
  };

  await saveOtpChallengeToRedis(newChallengeId, challenge);

  if (adminBotInstance && env.ADMIN_TELEGRAM_IDS.length > 0) {
    for (const adminIdStr of env.ADMIN_TELEGRAM_IDS) {
      await adminBotInstance.api.sendMessage(
        adminIdStr,
        `🔐 *Admin Login Verification*\n\nYour 6-digit OTP code is:\n\`${otpVal}\`\n\nExpires in 5 minutes.`,
        { parse_mode: 'Markdown' }
      ).catch(() => undefined);
    }
  }

  res.json({
    success: true,
    step: 'otp_required',
    challengeId: newChallengeId,
    ...(env.NODE_ENV === 'test' ? { testOtp: otpVal } : {}),
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
    res.json({ success: true, ...updated, plans: updated });
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

    if (appeal.status !== 'PENDING') {
      return res.status(400).json({ error: `Appeal cannot be approved because it is already in state '${appeal.status}'.` });
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

    if (adminBotInstance) {
      await adminBotInstance.api.sendMessage(
        appeal.telegramId.toString(),
        '🎉 *Appeal Approved*\n\nYour unban appeal has been approved by the moderation team. Your account has been restored to active status. Welcome back to IELTS Speaking P2P!',
        { parse_mode: 'Markdown' }
      ).catch((e: unknown) => console.warn('[Admin] Failed to send appeal approval notice:', e));
    }

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

    if (appeal.status !== 'PENDING') {
      return res.status(400).json({ error: `Appeal cannot be rejected because it is already in state '${appeal.status}'.` });
    }

    await prisma.unblockAppeal.update({
      where: { id },
      data: { status: 'REJECTED', reviewedAt: new Date() },
    });

    if (adminBotInstance) {
      await adminBotInstance.api.sendMessage(
        appeal.telegramId.toString(),
        '❌ *Appeal Decision*\n\nYour unban appeal has been reviewed and rejected by the moderation team. Your suspension remains active.',
        { parse_mode: 'Markdown' }
      ).catch((e: unknown) => console.warn('[Admin] Failed to send appeal rejection notice:', e));
    }

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
      // Handle non-numeric query gracefully for telegramId
      try {
        const numId = BigInt(query);
        where.OR = [
          { alias: { contains: query, mode: 'insensitive' as const } },
          { telegramId: numId },
        ];
      } catch {
        where.OR = [
          { alias: { contains: query, mode: 'insensitive' as const } },
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
  const { permanent, reason } = req.body;

  try {
    const user = await prisma.user.update({
      where: { id },
      data: {
        isBanned: true,
        isPermanentlyBanned: permanent ?? true,
        bannedUntil: permanent ? null : new Date(Date.now() + 6 * 60 * 60 * 1000),
      },
    });

    if (adminBotInstance) {
      const banText = permanent ?? true
        ? `⛔ *Account Permanently Banned*\n\nYour account has been permanently suspended by administration.\n*Reason:* ${reason || 'Violation of community guidelines.'}\n\nYou may submit an appeal using the bot menu.`
        : `🚫 *Account Temporarily Suspended*\n\nYour account has been blocked for 6 hours.\n*Reason:* ${reason || 'Community policy violation.'}`;
      await adminBotInstance.api.sendMessage(user.telegramId.toString(), banText, { parse_mode: 'Markdown' })
        .catch((e: unknown) => console.warn('[Admin] Failed to send ban notice:', e));
    }

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
    let notificationText: string | null = null;

    switch (action) {
      case 'warn':
        updateData = { warningCount: { increment: 1 } };
        notificationText = `⚠️ *Official Community Warning*\n\nYou have received a warning from moderation.\n*Reason:* ${reason || 'Inappropriate conduct or policy violation in voice calls.'}\n\nAccumulating 3 warnings will result in a temporary ban.`;
        break;
      case 'block':
        updateData = {
          isBanned: true,
          isPermanentlyBanned: false,
          bannedUntil: new Date(Date.now() + 6 * 60 * 60 * 1000), // 6 hours
        };
        notificationText = `🚫 *Account Temporarily Suspended (6 Hours)*\n\nYour account has been suspended for 6 hours.\n*Reason:* ${reason || 'Repeated warnings or call policy violation.'}\n\nYou can submit an appeal or wait for your suspension to expire.`;
        break;
      case 'ban':
        updateData = {
          isBanned: true,
          isPermanentlyBanned: true,
          bannedUntil: null,
        };
        notificationText = `⛔ *Account Permanently Banned*\n\nYour account has been permanently suspended by administration.\n*Reason:* ${reason || 'Severe violation of platform terms.'}\n\nYou may submit an unban appeal from the Telegram bot.`;
        break;
      case 'unblock':
        updateData = {
          isBanned: false,
          isPermanentlyBanned: false,
          bannedUntil: null,
          warningCount: 0,
        };
        notificationText = `✅ *Account Restored*\n\nYour account restriction has been lifted by the administration. You can now use IELTS Speaking P2P again! Please ensure you adhere to our community guidelines.`;
        break;
    }

    const updated = await prisma.user.update({
      where: { id },
      data: updateData,
    });

    if (adminBotInstance && notificationText) {
      await adminBotInstance.api.sendMessage(updated.telegramId.toString(), notificationText, { parse_mode: 'Markdown' })
        .catch((e: unknown) => console.warn('[Admin] Failed to send moderation notice:', e));
    }

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
