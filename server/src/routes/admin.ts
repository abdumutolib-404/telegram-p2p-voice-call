import { Router, type Response } from 'express';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import jwt from 'jsonwebtoken';
import { Prisma } from '@prisma/client';
import { Bot, InputFile } from 'grammy';
import { verifyAndConsumeAdminToken } from '../bot/commands/admin';
import { env } from '../config/env';
import { adminAuthMiddleware, type AdminAuthenticatedRequest } from '../middleware/adminAuth';
import { getAdminAnalytics } from '../services/analytics';
import { escapeHtml, isSafeStorageUrl } from '../utils/sanitize';
import {
  getPlansConfig,
  getPurchasablePlansConfig,
  updatePlansConfig,
  getDailyLimitForPlan,
  getMaxDurationForPlan,
  getRetentionDaysForPlan,
  approveManualPaymentRequest,
  rejectManualPaymentRequest,
  refundManualPaymentRequest,
  rejectManualPaymentRefund,
  revokePlanOnRefund,
} from '../services/plan';
import { moderationService } from '../services/moderation';
import { prisma } from '../config/database';
import { createActionRateLimiter, getClientIp } from '../middleware/rateLimit';
import { getRedis } from '../config/redis';
import type { MyContext } from '../bot/types';
import { logger, getRecentErrors } from '../utils/logger';
import { setRequestContextUserId } from '../utils/requestContext';
import adminTelemetryRouter from './adminTelemetry';
import adminIeltsRouter from './adminIelts';

const router = Router();
const adminAuthLimiter = createActionRateLimiter('ADMIN_LOGIN', getClientIp);
const otpVerifyLimiter = createActionRateLimiter('ADMIN_OTP', getClientIp);

// Mount Telemetry Sub-Router (Protected under /api/admin/telemetry/*)
router.use('/telemetry', adminAuthMiddleware, adminTelemetryRouter);
// Mount IELTS Sub-Router (Protected under /api/admin/ielts/*)
router.use('/ielts', adminAuthMiddleware, adminIeltsRouter);

export interface AdminOtpMessageRef {
  chatId: string;
  messageId: number;
}

interface AdminOtpChallenge {
  challengeId: string;
  otpHash: string;
  expiresAt: number;
  attempts: number;
  maxAttempts: number;
  consumed: boolean;
  telegramMessages?: AdminOtpMessageRef[];
}

const adminOtpChallengesFallback = new Map<string, AdminOtpChallenge>();

let adminBotInstance: Bot<MyContext> | null = null;

export function setAdminBot(bot: Bot<MyContext> | null): void {
  adminBotInstance = bot;
}

export function getAdminBot(): Bot<MyContext> | null {
  return adminBotInstance;
}

export async function cleanupAdminOtpMessages(
  challengeId: string,
  botToUse?: Bot<MyContext> | null
): Promise<void> {
  const bot = botToUse || adminBotInstance || (env.BOT_TOKEN && env.BOT_TOKEN !== 'mock_bot_token' ? new Bot<MyContext>(env.BOT_TOKEN) : null);
  if (!bot) return;

  const challenge = await getOtpChallengeFromRedis(challengeId);
  const messages = challenge?.telegramMessages || [];
  if (messages.length === 0) return;

  logger.info('Purging sensitive admin OTP messages from Telegram', {
    service: 'adminAuth',
    event: 'otp_messages_cleanup',
    challengeId,
    count: messages.length,
  });

  for (const { chatId, messageId } of messages) {
    try {
      await bot.api.deleteMessage(chatId, messageId);
    } catch {
      try {
        await bot.api.editMessageText(chatId, messageId, '🔐 *Admin Login Verification*\n\n_This verification code has expired or was already consumed._', {
          parse_mode: 'Markdown',
        });
      } catch {
        // Benign ignore if message already deleted
      }
    }
  }
}

export async function recordAdminAuditLog(params: {
  action: string;
  targetId?: string | null;
  adminId: string;
  beforeState?: unknown;
  afterState?: unknown;
  reason?: string | null;
  tx?: Prisma.TransactionClient;
}): Promise<void> {
  const db = params.tx || prisma;
  try {
    await db.auditLog.create({
      data: {
        action: params.action,
        targetId: params.targetId || null,
        adminId: params.adminId,
        beforeState: params.beforeState ? JSON.stringify(params.beforeState) : null,
        afterState: params.afterState ? JSON.stringify(params.afterState) : null,
        reason: params.reason || null,
      },
    });
  } catch (error: unknown) {
    logger.error('Failed to write admin audit log', {
      service: 'admin',
      event: 'audit_log_write_failed',
      action: params.action,
      targetId: params.targetId,
      adminId: params.adminId,
    }, error);
  }
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

const VERIFY_OTP_LUA_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then
  return cjson.encode({ status = 'NOT_FOUND' })
end

local challenge = cjson.decode(raw)

if challenge.consumed then
  return cjson.encode({ status = 'CONSUMED' })
end

if tonumber(ARGV[2]) > tonumber(challenge.expiresAt) then
  redis.call('DEL', KEYS[1])
  return cjson.encode({ status = 'EXPIRED' })
end

if tonumber(challenge.attempts) >= tonumber(challenge.maxAttempts) then
  redis.call('DEL', KEYS[1])
  return cjson.encode({ status = 'MAX_ATTEMPTS' })
end

challenge.attempts = tonumber(challenge.attempts) + 1

if challenge.otpHash == ARGV[1] then
  redis.call('DEL', KEYS[1])
  return cjson.encode({ status = 'SUCCESS', attempts = challenge.attempts })
else
  if challenge.attempts >= tonumber(challenge.maxAttempts) then
    redis.call('DEL', KEYS[1])
    return cjson.encode({ status = 'MAX_ATTEMPTS_REACHED', attempts = challenge.attempts, remaining = 0 })
  else
    local ttl = redis.call('TTL', KEYS[1])
    if ttl > 0 then
      redis.call('SET', KEYS[1], cjson.encode(challenge), 'EX', ttl)
    else
      redis.call('DEL', KEYS[1])
    end
    return cjson.encode({
      status = 'INVALID_OTP',
      attempts = challenge.attempts,
      remaining = tonumber(challenge.maxAttempts) - challenge.attempts
    })
  end
end
`;

async function verifyOtpChallengeAtomic(
  challengeId: string,
  providedOtp: string
): Promise<{ success: boolean; error?: string; remainingAttempts?: number }> {
  const providedHash = crypto.createHash('sha256').update(providedOtp.trim()).digest('hex');
  const now = Date.now();

  try {
    const redis = getRedis();
    const resultRaw = await redis.eval(
      VERIFY_OTP_LUA_SCRIPT,
      1,
      `otp:challenge:${challengeId}`,
      providedHash,
      String(now)
    );

    if (typeof resultRaw === 'string') {
      const result = JSON.parse(resultRaw) as {
        status: string;
        attempts?: number;
        remaining?: number;
      };

      if (result.status === 'SUCCESS') {
        adminOtpChallengesFallback.delete(challengeId);
        return { success: true };
      }
      if (result.status === 'EXPIRED') {
        adminOtpChallengesFallback.delete(challengeId);
        return { success: false, error: 'OTP has expired. Please request a new verification code.' };
      }
      if (result.status === 'MAX_ATTEMPTS' || result.status === 'MAX_ATTEMPTS_REACHED') {
        adminOtpChallengesFallback.delete(challengeId);
        return { success: false, error: 'Maximum OTP verification attempts exceeded.' };
      }
      if (result.status === 'INVALID_OTP') {
        return {
          success: false,
          error: `Invalid verification code. ${result.remaining} attempts remaining.`,
          remainingAttempts: result.remaining,
        };
      }
    }
  } catch (err) {
    logger.warn('Redis OTP eval error, checking memory fallback', {
      service: 'adminAuth',
      event: 'otp_eval_error',
    }, err);
  }

  // Memory fallback (if Redis was unavailable or key not found)
  const challenge = adminOtpChallengesFallback.get(challengeId);
  if (!challenge || challenge.consumed) {
    return { success: false, error: 'Invalid or consumed login challenge.' };
  }
  if (now > challenge.expiresAt) {
    adminOtpChallengesFallback.delete(challengeId);
    return { success: false, error: 'OTP has expired. Please request a new verification code.' };
  }
  if (challenge.attempts >= challenge.maxAttempts) {
    adminOtpChallengesFallback.delete(challengeId);
    return { success: false, error: 'Maximum OTP verification attempts exceeded.' };
  }

  challenge.attempts += 1;
  const isValid = crypto.timingSafeEqual(
    Buffer.from(providedHash, 'hex'),
    Buffer.from(challenge.otpHash, 'hex')
  );

  if (!isValid) {
    if (challenge.attempts >= challenge.maxAttempts) {
      adminOtpChallengesFallback.delete(challengeId);
      return { success: false, error: 'Maximum OTP verification attempts exceeded.' };
    }
    const remaining = challenge.maxAttempts - challenge.attempts;
    return { success: false, error: `Invalid verification code. ${remaining} attempts remaining.`, remainingAttempts: remaining };
  }

  challenge.consumed = true;
  adminOtpChallengesFallback.delete(challengeId);
  return { success: true };
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

function setAdminSessionCookie(res: Response, token: string, expiresAt: Date): void {
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
  const isProduction = env.NODE_ENV === 'production';
  res.clearCookie('admin_session', {
    path: '/',
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'strict' : 'lax',
  });
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

    challenge.telegramMessages = [];
    await saveOtpChallengeToRedis(challengeId, challenge);

    // Dispatch OTP via Telegram bot
    let sentCount = 0;
    const botToUse = adminBotInstance || (env.BOT_TOKEN && env.BOT_TOKEN !== 'mock_bot_token' ? new Bot<MyContext>(env.BOT_TOKEN) : null);
    const dispatchedMessages: AdminOtpMessageRef[] = [];

    if (botToUse && env.ADMIN_TELEGRAM_IDS.length > 0) {
      for (const adminIdStr of env.ADMIN_TELEGRAM_IDS) {
        try {
          logger.info('Dispatching OTP to Telegram ID', {
            service: 'adminAuth',
            event: 'otp_dispatch_started',
            adminId: adminIdStr,
          });
          const sent = await botToUse.api.sendMessage(
            adminIdStr,
            `🔐 *Admin Login Verification*\n\nYour 6-digit OTP code is:\n\`${otp}\`\n\nExpires in 5 minutes. Do not share this code.`,
            { parse_mode: 'Markdown' }
          );
          sentCount += 1;
          dispatchedMessages.push({ chatId: adminIdStr, messageId: sent.message_id });
          logger.info('OTP successfully dispatched', {
            service: 'adminAuth',
            event: 'otp_dispatched',
            adminId: adminIdStr,
          });
        } catch (err: unknown) {
          logger.error('Failed to dispatch OTP to Telegram ID', {
            service: 'adminAuth',
            event: 'otp_dispatch_failed',
            adminId: adminIdStr,
          }, err);
        }
      }
    } else {
      logger.warn('No active bot instance or empty ADMIN_TELEGRAM_IDS', {
        service: 'adminAuth',
        event: 'otp_bot_unavailable',
        hasBot: Boolean(botToUse),
        adminCount: env.ADMIN_TELEGRAM_IDS.length,
      });
    }

    if (dispatchedMessages.length > 0) {
      challenge.telegramMessages = dispatchedMessages;
      await saveOtpChallengeToRedis(challengeId, challenge);
      // Automatically purge ephemeral OTP messages after 5-minute expiry
      setTimeout(() => {
        void cleanupAdminOtpMessages(challengeId, botToUse);
      }, 5 * 60 * 1000);
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
    logger.error('Admin password step failed', {
      service: 'adminAuth',
      event: 'password_step_failed',
    }, error);
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

    const verification = await verifyOtpChallengeAtomic(challengeId, otp);
    if (!verification.success) {
      if (verification.error?.includes('Maximum OTP verification attempts exceeded')) {
        void cleanupAdminOtpMessages(challengeId);
      }
      res.status(401).json({ error: verification.error || 'Invalid verification code.' });
      return;
    }

    void cleanupAdminOtpMessages(challengeId);

    const adminTgId = env.ADMIN_TELEGRAM_IDS[0];
    if (!adminTgId) {
      res.status(500).json({ error: 'Server misconfiguration: No admin ID configured in ADMIN_TELEGRAM_IDS.' });
      return;
    }
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
    logger.error('Admin OTP step failed', {
      service: 'adminAuth',
      event: 'otp_step_failed',
    }, error);
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

  // If challengeId and OTP are provided, process OTP step atomically
  if (challengeId && otp) {
    const verification = await verifyOtpChallengeAtomic(challengeId, otp);
    if (!verification.success) {
      if (verification.error?.includes('Maximum OTP verification attempts exceeded')) {
        void cleanupAdminOtpMessages(challengeId);
      }
      res.status(401).json({ error: verification.error || 'Invalid verification code.' });
      return;
    }

    void cleanupAdminOtpMessages(challengeId);

    const adminTgId = env.ADMIN_TELEGRAM_IDS[0];
    if (!adminTgId) {
      res.status(500).json({ error: 'Server misconfiguration: No admin ID configured in ADMIN_TELEGRAM_IDS.' });
      return;
    }
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
      telegramIdNum = Number(env.ADMIN_TELEGRAM_IDS[0]);
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

// GET /api/admin/plans/purchasable (Protected - Paid Tiers Only)
router.get('/plans/purchasable', adminAuthMiddleware, async (req, res) => {
  res.json(getPurchasablePlansConfig());
});

// PUT /api/admin/plans (Protected)
router.put('/plans', adminAuthMiddleware, async (req, res) => {
  try {
    const beforeState = getPlansConfig();
    const updated = updatePlansConfig(req.body);
    const adminId = (req as any).adminUser?.telegramId ? String((req as any).adminUser.telegramId) : 'admin';
    await recordAdminAuditLog({
      action: 'GLOBAL_PLANS_UPDATE',
      targetId: 'plans_config',
      adminId,
      beforeState,
      afterState: updated,
      reason: 'Admin updated global plan tier parameters',
    });
    res.json({ success: true, ...updated, plans: updated });
  } catch (err) {
    res.status(400).json({ error: 'Failed to update plan configurations.' });
  }
});

// GET /api/admin/payments/manual (Protected)
router.get('/payments/manual', adminAuthMiddleware, async (req, res) => {
  try {
    const tab = typeof req.query.tab === 'string' ? req.query.tab : undefined;
    const statusQuery = typeof req.query.status === 'string' ? req.query.status : undefined;
    const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';

    let whereClause: any = {};
    if (tab === 'queue' || statusQuery === 'PENDING') {
      whereClause.status = 'PENDING';
    } else if (tab === 'refunds' || statusQuery === 'REFUND_PENDING') {
      whereClause.status = 'REFUND_PENDING';
    } else if (tab === 'history') {
      whereClause.status = { in: ['APPROVED', 'REJECTED', 'REFUNDED'] };
    } else if (statusQuery) {
      whereClause.status = statusQuery;
    }

    const requests = await prisma.manualPaymentRequest.findMany({
      where: Object.keys(whereClause).length > 0 ? whereClause : undefined,
      orderBy: { createdAt: 'desc' },
      include: { user: true },
    });

    let formatted = requests.map((r: any) => ({
      id: r.id,
      orderNumber: r.orderNumber || `A${r.id.slice(0, 4)}`,
      userId: r.userId,
      alias: r.alias,
      telegramId: r.telegramId ? r.telegramId.toString() : '',
      planTier: r.plan,
      amountUzs: r.uzsAmount,
      status: r.status,
      paymentProof: r.paymentProof,
      refundCardNumber: r.refundCardNumber,
      refundProof: r.refundProof,
      refundReason: r.refundReason,
      adminNote: r.adminNote,
      reviewedBy: r.reviewedBy,
      reviewedAt: r.reviewedAt ? new Date(r.reviewedAt).toISOString() : null,
      createdAt: new Date(r.createdAt).toISOString(),
      user: r.user
        ? {
            band: r.user.band,
            currentPlan: r.user.plan,
            isBanned: r.user.isBanned || r.user.isPermanentlyBanned,
            dailyCallsUsed: r.user.dailyCallsUsed,
            dailyLimit: r.user.dailyLimit,
          }
        : undefined,
    }));

    if (search) {
      formatted = formatted.filter((item: any) => {
        return (
          item.orderNumber.toLowerCase().includes(search) ||
          item.alias.toLowerCase().includes(search) ||
          item.telegramId.toLowerCase().includes(search) ||
          item.planTier.toLowerCase().includes(search) ||
          (item.refundCardNumber && item.refundCardNumber.toLowerCase().includes(search)) ||
          (item.adminNote && item.adminNote.toLowerCase().includes(search))
        );
      });
    }

    res.json(formatted);
  } catch (err) {
    logger.error('Failed to fetch manual payments', {
      service: 'admin',
      event: 'fetch_manual_payments_failed',
    }, err);
    res.status(500).json({ error: 'Failed to retrieve manual payment requests.' });
  }
});

// GET /api/admin/payments/manual/:id/receipt (Protected)
router.get('/payments/manual/:id/receipt', adminAuthMiddleware, async (req: AdminAuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  try {
    const paymentReq = await prisma.manualPaymentRequest.findUnique({
      where: { id },
    });

    if (!paymentReq || !paymentReq.paymentProof) {
      res.status(404).send('Receipt not found');
      return;
    }

    const rawProof = paymentReq.paymentProof.trim();

    // 1. Direct HTTP/HTTPS URL (Must strictly pass isSafeStorageUrl)
    if (rawProof.startsWith('http://') || rawProof.startsWith('https://')) {
      if (!isSafeStorageUrl(rawProof)) {
        logger.warn('SSRF / open redirect blocked on receipt retrieval', {
          service: 'admin',
          event: 'receipt_unsafe_redirect_blocked',
          url: rawProof,
          requestId: id,
        });
        res.status(400).send('Unsafe receipt storage URL blocked');
        return;
      }
      res.redirect(rawProof);
      return;
    }

    // 2. Base64 Data URL (Strict Image MIME Whitelist to prevent Stored XSS)
    if (rawProof.startsWith('data:')) {
      const matches = rawProof.match(/^data:([A-Za-z0-9-+/]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        const mimeType = matches[1].toLowerCase().trim();
        const allowedImageMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
        if (!allowedImageMimes.includes(mimeType)) {
          logger.warn('Blocked unsafe receipt MIME type in data URL', {
            service: 'admin',
            event: 'receipt_unsafe_mime_blocked',
            mimeType,
            requestId: id,
          });
          res.status(400).send('Receipt format is not an allowed image format');
          return;
        }

        const buffer = Buffer.from(matches[2], 'base64');
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Content-Length', buffer.length);
        res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.end(buffer);
        return;
      }
      res.status(400).send('Invalid data URL format for receipt');
      return;
    }

    // 3. Parsed JSON metadata containing Telegram fileId
    let fileId: string | undefined;
    let mimeType = 'image/jpeg';

    try {
      const parsed = JSON.parse(rawProof);
      fileId = parsed.fileId;
      if (parsed.mimeType) mimeType = parsed.mimeType.toLowerCase().trim();
    } catch {
      if (/^[A-Za-z0-9_-]{20,}$/.test(rawProof)) {
        fileId = rawProof;
      }
    }

    if (!fileId) {
      res.status(400).send('Receipt file reference is unavailable');
      return;
    }

    // Sanitize mimeType for Telegram streamed files too
    const allowedStreamMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg', 'application/pdf'];
    if (!allowedStreamMimes.includes(mimeType)) {
      mimeType = 'image/jpeg';
    }

    const botToUse = adminBotInstance || (env.BOT_TOKEN && env.BOT_TOKEN !== 'mock_bot_token' ? new Bot<MyContext>(env.BOT_TOKEN) : null);
    if (!botToUse) {
      res.status(503).send('Telegram bot service is not connected to stream receipts');
      return;
    }

    const fileInfo = await botToUse.api.getFile(fileId);
    if (!fileInfo.file_path) {
      res.status(404).send('Receipt file path could not be resolved from Telegram');
      return;
    }

    const telegramFileUrl = `https://api.telegram.org/file/bot${env.BOT_TOKEN}/${fileInfo.file_path}`;
    const upstreamRes = await fetch(telegramFileUrl);

    if (!upstreamRes.ok || !upstreamRes.body) {
      res.status(upstreamRes.status).send('Failed to fetch receipt from Telegram servers');
      return;
    }

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');

    Readable.fromWeb(upstreamRes.body as any).pipe(res);
  } catch (err) {
    logger.error('Failed to stream manual payment receipt', {
      service: 'admin',
      event: 'stream_manual_receipt_failed',
      requestId: id,
    }, err);
    res.status(500).send('Internal error while streaming receipt');
  }
});

// POST /api/admin/payments/manual/:id/approve (Protected)
router.post('/payments/manual/:id/approve', adminAuthMiddleware, async (req: AdminAuthenticatedRequest, res) => {
  const { id } = req.params;
  const { note } = req.body;
  const adminId = req.adminUser?.telegramId || 'admin';

  try {
    const result = await approveManualPaymentRequest({
      requestId: id,
      adminId,
      note,
    });

    if (adminBotInstance && result.user) {
      const plans = getPlansConfig();
      const tier = (result.user.plan.toUpperCase() as keyof typeof plans) in plans
        ? (result.user.plan.toUpperCase() as keyof typeof plans)
        : 'PLUS';
      const config = plans[tier] || plans.PLUS;

      await adminBotInstance.api.sendMessage(
        result.user.telegramId.toString(),
        `🎉 <b>Payment Verified & Approved!</b>\n\n` +
          `Your <b>${escapeHtml(result.user.plan)} Plan</b> has been activated.\n` +
          `• Max Call Duration: ${config.maxDuration >= 999 ? 'Unlimited' : `${config.maxDuration} minutes`}\n` +
          `• Monthly Calls: ${config.dailyLimit >= 999 ? 'Unlimited' : `${config.dailyLimit} calls/month`}\n` +
          `• Recording Retention: ${config.retentionDays} days\n\n` +
          `Happy practicing!`,
        { parse_mode: 'HTML' }
      ).catch(() => undefined);
    }

    res.json({
      success: true,
      message: 'Payment approved and plan activated.',
      request: {
        ...result.request,
        telegramId: result.request.telegramId ? result.request.telegramId.toString() : '',
      },
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to approve payment.';
    logger.error('Failed to approve manual payment', {
      service: 'admin',
      event: 'approve_manual_payment_failed',
      requestId: id,
    }, err);
    res.status(400).json({ error: errorMsg });
  }
});

// POST /api/admin/payments/manual/:id/reject (Protected)
router.post('/payments/manual/:id/reject', adminAuthMiddleware, async (req: AdminAuthenticatedRequest, res) => {
  const { id } = req.params;
  const { note } = req.body;
  const adminId = req.adminUser?.telegramId || 'admin';

  try {
    const result = await rejectManualPaymentRequest({
      requestId: id,
      adminId,
      note,
    });

    if (adminBotInstance && result.request?.telegramId) {
      const orderNum = result.request.orderNumber || `A${result.request.id.slice(0, 4)}`;
      const reasonText = note ? `<b>Reason:</b>\n${escapeHtml(note)}\n\n` : '';
      const supportContact = env.MANUAL_PAYMENT_ADMIN_USERNAME ? `@${env.MANUAL_PAYMENT_ADMIN_USERNAME.replace(/^@/, '')}` : '@PairTalkSupport';

      await adminBotInstance.api.sendMessage(
        result.request.telegramId.toString(),
        `❌ <b>Payment Request Rejected</b>\n\n` +
          `<b>Order:</b> <code>${escapeHtml(orderNum)}</code>\n` +
          `<b>Plan:</b> ${escapeHtml(result.request.plan)}\n\n` +
          `${reasonText}` +
          `Your account has not been upgraded.\n\n` +
          `Contact ${escapeHtml(supportContact)} if you believe this decision was incorrect.`,
        { parse_mode: 'HTML' }
      ).catch((err: unknown) => {
        logger.warn('Failed to send payment rejection notification to user', {
          service: 'admin',
          event: 'reject_payment_notification_failed',
          requestId: id,
        }, err);
      });
    }

    res.json({
      success: true,
      message: 'Payment request rejected.',
      request: {
        ...result.request,
        telegramId: result.request.telegramId ? result.request.telegramId.toString() : '',
      },
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to reject payment.';
    logger.error('Failed to reject manual payment', {
      service: 'admin',
      event: 'reject_manual_payment_failed',
      requestId: id,
    }, err);
    res.status(400).json({ error: errorMsg });
  }
});

// POST /api/admin/payments/manual/:id/refund (Protected - Process UZS Refund with Transfer Bill)
router.post('/payments/manual/:id/refund', adminAuthMiddleware, async (req: AdminAuthenticatedRequest, res) => {
  const { id } = req.params;
  const { refundProof, note } = req.body;
  const adminId = req.adminUser?.telegramId || 'admin';

  if (!refundProof || typeof refundProof !== 'string' || !refundProof.trim()) {
    res.status(400).json({ error: 'Bank transfer bill / proof image is strictly required to approve a refund.' });
    return;
  }

  try {
    const result = await refundManualPaymentRequest({
      requestId: id,
      adminId,
      refundProof: refundProof.trim(),
      note,
    });

    if (adminBotInstance && result.user?.telegramId) {
      const orderNum = result.request.orderNumber || `A${result.request.id.slice(0, 4)}`;
      const cardDisplay = result.request.refundCardNumber || 'your registered card';
      const caption =
        `🎉 <b>Refund Approved & Money Sent!</b>\n\n` +
        `Your refund of <b>${result.request.uzsAmount.toLocaleString()} UZS</b> for Order #<code>${escapeHtml(orderNum)}</code> has been transferred to your card:\n` +
        `💳 <code>${escapeHtml(cardDisplay)}</code>\n\n` +
        `📎 <i>The official bank transfer bill is attached above.</i>\n\n` +
        `Your account has been reverted to the <b>FREE Plan</b>. Thank you for using PairTalk!`;

      // Try sending with photo if refundProof is a valid base64 data URI or validated safe HTTPS URL
      let sent = false;
      const targetTgId = result.user.telegramId.toString();

      if (refundProof.startsWith('data:')) {
        try {
          const match = refundProof.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
          const base64Data = match ? match[2] : refundProof.split(',')[1];
          const mime = match ? match[1] : 'image/jpeg';
          const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';

          if (base64Data) {
            const buffer = Buffer.from(base64Data, 'base64');
            const file = new InputFile(buffer, `refund_bill_${orderNum}.${ext}`);
            await adminBotInstance.api.sendPhoto(targetTgId, file, {
              caption,
              parse_mode: 'HTML',
            });
            sent = true;
            logger.info('Refund bill photo successfully dispatched via base64 buffer', {
              service: 'admin',
              event: 'refund_photo_base64_dispatched',
              targetTgId,
            });
          }
        } catch (photoErr) {
          logger.warn('Failed to dispatch base64 refund photo, attempting fallback', {
            service: 'admin',
            event: 'refund_photo_base64_failed',
            targetTgId,
          }, photoErr);
        }
      } else if (isSafeStorageUrl(refundProof)) {
        try {
          await adminBotInstance.api.sendPhoto(targetTgId, refundProof, {
            caption,
            parse_mode: 'HTML',
          });
          sent = true;
          logger.info('Refund bill photo successfully dispatched via URL', {
            service: 'admin',
            event: 'refund_photo_url_dispatched',
            targetTgId,
          });
        } catch (photoUrlErr) {
          logger.warn('Failed to dispatch URL refund photo, attempting fallback', {
            service: 'admin',
            event: 'refund_photo_url_failed',
            targetTgId,
          }, photoUrlErr);
        }
      } else {
        logger.warn('SSRF protection: refundProof URL is not an approved safe HTTPS storage domain', {
          service: 'admin',
          event: 'refund_proof_ssrf_blocked',
          refundProof,
        });
      }

      if (!sent) {
        await adminBotInstance.api.sendMessage(
          targetTgId,
          caption,
          { parse_mode: 'HTML' }
        ).catch(() => undefined);
      }
    }

    res.json({
      success: true,
      message: 'Payment refund approved and bill dispatched.',
      request: {
        ...result.request,
        telegramId: result.request.telegramId ? result.request.telegramId.toString() : '',
      },
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to refund payment.';
    logger.error('Failed to refund manual payment', {
      service: 'admin',
      event: 'refund_manual_payment_failed',
      requestId: id,
    }, err);
    res.status(400).json({ error: errorMsg });
  }
});

// POST /api/admin/payments/manual/:id/reject-refund (Protected - Reject UZS Refund with Mandatory Reason)
router.post('/payments/manual/:id/reject-refund', adminAuthMiddleware, async (req: AdminAuthenticatedRequest, res) => {
  const { id } = req.params;
  const { reason, note } = req.body;
  const adminId = req.adminUser?.telegramId || 'admin';
  const rejectionReason = (typeof reason === 'string' && reason.trim()) || (typeof note === 'string' && note.trim());

  if (!rejectionReason) {
    res.status(400).json({ error: 'Rejection reason is strictly required to reject a refund request.' });
    return;
  }

  try {
    const result = await rejectManualPaymentRefund({
      requestId: id,
      adminId,
      reason: rejectionReason,
      note: rejectionReason,
    });

    if (adminBotInstance && result.request?.telegramId) {
      const orderNum = result.request.orderNumber || `A${result.request.id.slice(0, 4)}`;
      const supportContact = env.MANUAL_PAYMENT_ADMIN_USERNAME ? `@${env.MANUAL_PAYMENT_ADMIN_USERNAME.replace(/^@/, '')}` : '@PairTalkSupport';
      await adminBotInstance.api.sendMessage(
        result.request.telegramId.toString(),
        `❌ <b>Refund Request Rejected</b>\n\n` +
          `Your refund request for Order #<code>${escapeHtml(orderNum)}</code> was reviewed by administration and not approved.\n\n` +
          `<b>Reason:</b>\n${escapeHtml(rejectionReason)}\n\n` +
          `Your <b>${escapeHtml(result.request.plan)} Plan</b> remains active.\n\n` +
          `If you have questions, please contact ${escapeHtml(supportContact)}.`,
        { parse_mode: 'HTML' }
      ).catch(() => undefined);
    }

    res.json({
      success: true,
      message: 'Refund request rejected.',
      request: {
        ...result.request,
        telegramId: result.request.telegramId ? result.request.telegramId.toString() : '',
      },
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to reject refund.';
    logger.error('Failed to reject refund', {
      service: 'admin',
      event: 'reject_refund_failed',
      requestId: id,
    }, err);
    res.status(400).json({ error: errorMsg });
  }
});

// GET /api/admin/payments/stars (Protected)
router.get('/payments/stars', adminAuthMiddleware, async (_req, res) => {
  try {
    const transactions = await prisma.starsTransaction.findMany({
      orderBy: { createdAt: 'desc' },
      include: { user: true },
    });

    const formatted = transactions.map((t: any) => ({
      id: t.id,
      userId: t.userId,
      alias: t.user?.alias || 'Unknown',
      telegramId: t.user?.telegramId ? t.user.telegramId.toString() : '',
      telegramPaymentId: t.telegramPaymentId,
      starsAmount: t.starsAmount,
      planTier: t.planTier,
      status: t.status,
      refundReason: t.refundReason,
      refundedAt: t.refundedAt ? new Date(t.refundedAt).toISOString() : null,
      createdAt: new Date(t.createdAt).toISOString(),
    }));

    res.json(formatted);
  } catch (err) {
    logger.error('Failed to fetch stars transactions', {
      service: 'admin',
      event: 'fetch_stars_transactions_failed',
    }, err);
    res.status(500).json({ error: 'Failed to retrieve stars transactions.' });
  }
});

// POST /api/admin/payments/stars/:id/refund (Protected)
router.post('/payments/stars/:id/refund', adminAuthMiddleware, async (req: AdminAuthenticatedRequest, res) => {
  const { id } = req.params;
  const { reason } = req.body;
  const adminId = req.adminUser?.telegramId || 'admin';

  try {
    const result = await revokePlanOnRefund({
      transactionId: id,
      adminId,
      reason,
    });

    if (adminBotInstance && result.user) {
      await adminBotInstance.api.sendMessage(
        result.user.telegramId.toString(),
        `ℹ️ *Telegram Stars Payment Refunded*\n\n` +
          `• Amount: *${result.transaction.starsAmount} Stars*\n` +
          `• Reason: ${reason || 'Administrator refund'}\n\n` +
          `Your subscription has been reverted to the *FREE Plan*.`,
        { parse_mode: 'Markdown' }
      ).catch(() => undefined);
    }

    res.json({ success: true, message: 'Stars payment refunded and plan revoked.', transaction: result.transaction });
  } catch (err: any) {
    logger.error('Failed to refund stars transaction', {
      service: 'admin',
      event: 'refund_stars_transaction_failed',
      transactionId: id,
    }, err);
    res.status(400).json({ error: err.message || 'Failed to refund transaction.' });
  }
});

// GET /api/admin/audit-logs (Protected)
router.get('/audit-logs', adminAuthMiddleware, async (_req, res) => {
  try {
    const logs = await prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json(logs);
  } catch (err) {
    logger.error('Failed to fetch audit logs', {
      service: 'admin',
      event: 'fetch_audit_logs_failed',
    }, err);
    res.status(500).json({ error: 'Failed to retrieve audit logs.' });
  }
});

// GET /api/admin/appeals (Protected)
router.get('/appeals', adminAuthMiddleware, async (req, res) => {
  try {
    const appeals = await prisma.unblockAppeal.findMany({
      where: { status: 'PENDING' },
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
      subscores: a.user
        ? {
            fc: a.user.subFC,
            lr: a.user.subLR,
            gra: a.user.subGRA,
            p: a.user.subP,
            band: a.user.band,
          }
        : null,
    }));

    res.json(formatted);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve ban appeals.' });
  }
});

// POST /api/admin/appeals/:id/approve (Protected)
router.post('/appeals/:id/approve', adminAuthMiddleware, async (req, res) => {
  const { id } = req.params;
  const adminId = (req as any).adminUser?.telegramId ? String((req as any).adminUser.telegramId) : 'admin';

  try {
    const appeal = await prisma.unblockAppeal.findUnique({ where: { id } });
    if (!appeal) {
      return res.status(404).json({ error: 'Appeal not found.' });
    }

    try {
      await prisma.$transaction(async (tx) => {
        const updated = await tx.unblockAppeal.updateMany({
          where: { id, status: 'PENDING' },
          data: { status: 'APPROVED', reviewedAt: new Date() },
        });

        if (updated.count !== 1) {
          throw new Error('ALREADY_PROCESSED');
        }

        await tx.user.update({
          where: { id: appeal.userId },
          data: {
            isBanned: false,
            isPermanentlyBanned: false,
            bannedUntil: null,
            warningCount: 0,
          },
        });

        await tx.auditLog.create({
          data: {
            action: 'APPEAL_APPROVED',
            targetId: id,
            adminId,
            beforeState: JSON.stringify({ appealStatus: appeal.status, userBanned: true, userId: appeal.userId }),
            afterState: JSON.stringify({ appealStatus: 'APPROVED', userBanned: false, userId: appeal.userId }),
            reason: 'Admin approved candidate unblock appeal',
          },
        });
      });
    } catch (txErr: any) {
      if (txErr.message === 'ALREADY_PROCESSED') {
        return res.status(400).json({ error: `Appeal cannot be approved because it is already in state '${appeal.status}'.` });
      }
      throw txErr;
    }

    await moderationService.invalidateBanCache(appeal.telegramId);

    if (adminBotInstance) {
      await adminBotInstance.api.sendMessage(
        appeal.telegramId.toString(),
        '🎉 *Appeal Approved*\n\nYour unban appeal has been approved by the moderation team. Your account has been restored to active status. Welcome back to PairTalk!',
        { parse_mode: 'Markdown' }
      ).catch((e: unknown) => {
        logger.warn('Failed to send appeal approval notice', {
          service: 'admin',
          event: 'appeal_approval_notice_failed',
          appealId: id,
        }, e);
      });
    }

    res.json({ success: true, message: 'Unblock appeal approved. User unbanned.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to approve appeal.' });
  }
});

// POST /api/admin/appeals/:id/reject (Protected)
router.post('/appeals/:id/reject', adminAuthMiddleware, async (req, res) => {
  const { id } = req.params;
  const adminId = (req as any).adminUser?.telegramId ? String((req as any).adminUser.telegramId) : 'admin';

  try {
    const appeal = await prisma.unblockAppeal.findUnique({ where: { id } });
    if (!appeal) {
      return res.status(404).json({ error: 'Appeal not found.' });
    }

    try {
      await prisma.$transaction(async (tx) => {
        const updated = await tx.unblockAppeal.updateMany({
          where: { id, status: 'PENDING' },
          data: { status: 'REJECTED', reviewedAt: new Date() },
        });

        if (updated.count !== 1) {
          throw new Error('ALREADY_PROCESSED');
        }

        await tx.auditLog.create({
          data: {
            action: 'APPEAL_REJECTED',
            targetId: id,
            adminId,
            beforeState: JSON.stringify({ appealStatus: appeal.status, userId: appeal.userId }),
            afterState: JSON.stringify({ appealStatus: 'REJECTED', userId: appeal.userId }),
            reason: 'Admin rejected candidate unblock appeal',
          },
        });
      });
    } catch (txErr: any) {
      if (txErr.message === 'ALREADY_PROCESSED') {
        return res.status(400).json({ error: `Appeal cannot be rejected because it is already in state '${appeal.status}'.` });
      }
      throw txErr;
    }

    await moderationService.invalidateBanCache(appeal.telegramId);

    if (adminBotInstance) {
      await adminBotInstance.api.sendMessage(
        appeal.telegramId.toString(),
        '❌ *Appeal Decision*\n\nYour unban appeal has been reviewed and rejected by the moderation team. Your suspension remains active.',
        { parse_mode: 'Markdown' }
      ).catch((e: unknown) => {
        logger.warn('Failed to send appeal rejection notice', {
          service: 'admin',
          event: 'appeal_rejection_notice_failed',
          appealId: id,
        }, e);
      });
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
        customPlanName: u.customPlanName || null,
        status,
        subscores: {
          fc: u.subFC,
          lr: u.subLR,
          gra: u.subGRA,
          p: u.subP,
          band: u.band,
        },
        dailyLimit: u.dailyLimit,
        dailyCallsUsed: u.dailyCallsUsed,
        maxDuration: u.maxDuration,
        retentionOverride: u.retentionOverride || null,
        recordingLimitOverride: u.recordingLimitOverride || null,
        warningCount: u.warningCount,
        isPermanentlyBanned: u.isPermanentlyBanned,
        bannedUntil: u.bannedUntil ? u.bannedUntil.toISOString() : null,
        createdAt: u.createdAt.toISOString(),
      };
    });

    res.json(formatted);
  } catch (err) {
    logger.error('Failed to fetch users', {
      service: 'admin',
      event: 'fetch_users_failed',
    }, err);
    res.status(500).json({ error: 'Failed to fetch users.' });
  }
});

// PATCH /api/admin/users/:id/plan (Protected - Manual Plan & Limit Updates)
router.patch('/users/:id/plan', adminAuthMiddleware, async (req, res) => {
  const { id } = req.params;
  const { plan, dailyLimit, maxDuration, retentionOverride, recordingLimit, recordingLimitOverride, customPlanName, durationDays, resetDailyCalls } = req.body;

  try {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const beforeState = {
      plan: user.plan,
      customPlanName: user.customPlanName,
      dailyLimit: user.dailyLimit,
      dailyCallsUsed: user.dailyCallsUsed,
      maxDuration: user.maxDuration,
      retentionOverride: user.retentionOverride,
      recordingLimitOverride: user.recordingLimitOverride,
      subscriptionStatus: user.subscriptionStatus,
      subscriptionExpiresAt: user.subscriptionExpiresAt,
    };

    const updateData: Prisma.UserUpdateInput = {};

    if (plan && ['FREE', 'PLUS', 'PRO', 'BOSS'].includes(String(plan).toUpperCase())) {
      const normalizedPlan = String(plan).toUpperCase();
      updateData.plan = normalizedPlan;
      if (normalizedPlan === 'FREE') {
        updateData.subscriptionStatus = 'NONE';
        updateData.subscriptionExpiresAt = null;
      } else {
        updateData.subscriptionStatus = 'ACTIVE';
        const days = typeof durationDays === 'number' && durationDays > 0 ? durationDays : 30;
        updateData.subscriptionExpiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
      }
      if (dailyLimit === undefined) {
        updateData.dailyLimit = getDailyLimitForPlan(normalizedPlan);
      }
      if (maxDuration === undefined) {
        updateData.maxDuration = getMaxDurationForPlan(normalizedPlan);
      }
    }

    if (dailyLimit !== undefined && typeof dailyLimit === 'number' && dailyLimit >= 0) {
      updateData.dailyLimit = dailyLimit;
    }

    if (maxDuration !== undefined && typeof maxDuration === 'number' && maxDuration > 0) {
      updateData.maxDuration = maxDuration;
    }

    if (retentionOverride !== undefined) {
      updateData.retentionOverride = typeof retentionOverride === 'number' && retentionOverride > 0 ? retentionOverride : null;
    }

    if (recordingLimit !== undefined || recordingLimitOverride !== undefined) {
      const rec = recordingLimit !== undefined ? recordingLimit : recordingLimitOverride;
      updateData.recordingLimitOverride = typeof rec === 'number' && rec > 0 ? rec : null;
    }

    if (customPlanName !== undefined) {
      updateData.customPlanName = typeof customPlanName === 'string' && customPlanName.trim().length > 0 ? customPlanName.trim() : null;
      if (updateData.customPlanName) {
        updateData.subscriptionStatus = 'ACTIVE';
        if (durationDays && typeof durationDays === 'number' && durationDays > 0) {
          updateData.subscriptionExpiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);
        } else if (!user.subscriptionExpiresAt || user.subscriptionExpiresAt <= new Date()) {
          updateData.subscriptionExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        }
      }
    }

    if (durationDays !== undefined && typeof durationDays === 'number' && durationDays > 0) {
      updateData.subscriptionStatus = 'ACTIVE';
      updateData.subscriptionExpiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);
    }

    if (resetDailyCalls === true) {
      updateData.dailyCallsUsed = 0;
      updateData.lastCallDate = new Date().toISOString().slice(0, 7);
      const effectivePlan = updateData.plan ? String(updateData.plan) : user.plan;
      if (effectivePlan !== 'FREE' || updateData.customPlanName || user.customPlanName) {
        updateData.subscriptionStatus = 'ACTIVE';
        if (!updateData.subscriptionExpiresAt) {
          updateData.subscriptionExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        }
      }
    }

    const updated = await prisma.user.update({
      where: { id },
      data: updateData,
    });

    const afterState = {
      plan: updated.plan,
      customPlanName: updated.customPlanName,
      dailyLimit: updated.dailyLimit,
      dailyCallsUsed: updated.dailyCallsUsed,
      maxDuration: updated.maxDuration,
      retentionOverride: updated.retentionOverride,
      recordingLimitOverride: updated.recordingLimitOverride,
      subscriptionStatus: updated.subscriptionStatus,
      subscriptionExpiresAt: updated.subscriptionExpiresAt,
    };

    const adminId = (req as any).adminUser?.telegramId ? String((req as any).adminUser.telegramId) : 'admin';
    await recordAdminAuditLog({
      action: 'USER_PLAN_UPDATE',
      targetId: id,
      adminId,
      beforeState,
      afterState,
      reason: typeof req.body?.reason === 'string' ? req.body.reason : 'Admin updated candidate plan and limits',
    });

    if (adminBotInstance && (plan || resetDailyCalls || dailyLimit !== undefined || retentionOverride !== undefined)) {
      const planName = updated.customPlanName || updated.plan;
      const limitText = updated.dailyLimit >= 999 ? 'Unlimited' : `${updated.dailyLimit} calls/month`;
      const durText = `${updated.maxDuration} minutes`;
      const retentionText = updated.retentionOverride ? `${updated.retentionOverride} days (Custom)` : `${getRetentionDaysForPlan(updated.plan)} days`;
      const expiresLine = updated.subscriptionExpiresAt
        ? `• <b>Valid Until</b>: ${updated.subscriptionExpiresAt.toISOString().replace('T', ' ').substring(0, 16)} UTC\n`
        : '';
      const msg =
        `⭐ <b>Account Plan Updated by Administrator</b>\n\n` +
        `Your PairTalk limits have been updated:\n` +
        `• <b>Plan Tier</b>: <b>${escapeHtml(planName)}</b>\n` +
        `• <b>Monthly Call Limit</b>: ${escapeHtml(limitText)}\n` +
        `• <b>Max Call Duration</b>: ${escapeHtml(durText)}\n` +
        `• <b>Recording Retention</b>: ${escapeHtml(retentionText)}\n` +
        expiresLine +
        (resetDailyCalls ? `• <b>Calls Used This Month</b>: Reset to 0\n` : '') +
        `\nEnjoy practicing!`;
      await adminBotInstance.api.sendMessage(updated.telegramId.toString(), msg, { parse_mode: 'HTML' })
        .catch((e: unknown) => {
          logger.warn('User notification skipped for user plan update', {
            service: 'admin',
            event: 'user_plan_notification_failed',
            telegramId: updated.telegramId.toString(),
          }, e);
        });
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
      customPlanName: updated.customPlanName || null,
      status,
      subscores: {
        fc: updated.subFC,
        lr: updated.subLR,
        gra: updated.subGRA,
        p: updated.subP,
      },
      dailyLimit: updated.dailyLimit,
      dailyCallsUsed: updated.dailyCallsUsed,
      maxDuration: updated.maxDuration,
      retentionOverride: updated.retentionOverride || null,
      warningCount: updated.warningCount,
      createdAt: updated.createdAt.toISOString(),
    });
  } catch (err) {
    logger.error('Failed to update user plan', {
      service: 'admin',
      event: 'update_user_plan_failed',
      userId: id,
    }, err);
    res.status(500).json({ error: 'Failed to update user plan.' });
  }
});

// POST /api/admin/users/:id/ban (Protected)
router.post('/users/:id/ban', adminAuthMiddleware, async (req, res) => {
  const { id } = req.params;
  const { permanent, reason } = req.body;
  const adminId = (req as any).adminUser?.telegramId ? String((req as any).adminUser.telegramId) : 'admin';

  try {
    const userBefore = await prisma.user.findUnique({ where: { id } });
    const user = await prisma.user.update({
      where: { id },
      data: {
        isBanned: true,
        isPermanentlyBanned: permanent ?? true,
        bannedUntil: permanent ? null : new Date(Date.now() + 6 * 60 * 60 * 1000),
      },
    });

    await moderationService.invalidateBanCache(user.telegramId);

    await recordAdminAuditLog({
      action: 'USER_BAN',
      targetId: id,
      adminId,
      beforeState: userBefore ? {
        isBanned: userBefore.isBanned,
        isPermanentlyBanned: userBefore.isPermanentlyBanned,
        bannedUntil: userBefore.bannedUntil,
      } : null,
      afterState: {
        isBanned: user.isBanned,
        isPermanentlyBanned: user.isPermanentlyBanned,
        bannedUntil: user.bannedUntil,
      },
      reason: reason || (permanent ? 'Permanent suspension' : 'Temporary 6h suspension'),
    });

    if (adminBotInstance) {
      const banText = permanent ?? true
        ? `⛔ *Account Permanently Banned*\n\nYour account has been permanently suspended by administration.\n*Reason:* ${reason || 'Violation of community guidelines.'}\n\nYou may submit an appeal using the bot menu.`
        : `🚫 *Account Temporarily Suspended*\n\nYour account has been blocked for 6 hours.\n*Reason:* ${reason || 'Community policy violation.'}`;
      await adminBotInstance.api.sendMessage(user.telegramId.toString(), banText, { parse_mode: 'Markdown' })
        .catch((e: unknown) => {
          logger.warn('Failed to send ban notice', {
            service: 'admin',
            event: 'ban_notice_failed',
            userId: id,
          }, e);
        });
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
  const adminId = (req as any).adminUser?.telegramId ? String((req as any).adminUser.telegramId) : 'admin';

  if (!action || !['warn', 'block', 'ban', 'unblock', 'reset-calls', 'reset-score'].includes(action)) {
    return res.status(400).json({ error: 'Invalid moderation action. Must be warn, block, ban, unblock, reset-calls, or reset-score.' });
  }

  try {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    let updateData: Prisma.UserUpdateInput = {};
    let notificationText: string | null = null;

    switch (action) {
      case 'warn': {
        const escalation = await moderationService.escalateUserWarning(id, reason);
        await recordAdminAuditLog({
          action: 'USER_MODERATION',
          targetId: id,
          adminId,
          beforeState: {
            action: 'warn',
            warningCount: user.warningCount,
            isBanned: user.isBanned,
          },
          afterState: {
            action: 'warn',
            penaltyLevel: escalation.penaltyLevel,
            warningCount: escalation.warningCount,
            isBanned: escalation.user.isBanned,
          },
          reason: reason || 'Warning issued',
        });
        if (adminBotInstance) {
          await adminBotInstance.api.sendMessage(escalation.user.telegramId.toString(), escalation.notificationText, { parse_mode: 'Markdown' })
            .catch((e: unknown) => {
              logger.warn('Failed to send warn notice', {
                service: 'admin',
                event: 'warn_notice_failed',
                userId: id,
              }, e);
            });
        }
        return res.json({
          success: true,
          user: { ...escalation.user, telegramId: escalation.user.telegramId.toString() },
          penaltyLevel: escalation.penaltyLevel,
          warningCount: escalation.warningCount,
        });
      }
      case 'block':
        updateData = {
          isBanned: true,
          isPermanentlyBanned: false,
          bannedUntil: new Date(Date.now() + 6 * 60 * 60 * 1000), // 6 hours
        };
        notificationText = `🚫 *Account Temporarily Suspended (6 Hours)*\n\nYour account has been suspended for 6 hours.\n*Reason:* ${reason || 'Repeated warnings or call policy violation.'}\n\nYour suspension will expire automatically in 6 hours.`;
        break;
      case 'ban':
        updateData = {
          isBanned: true,
          isPermanentlyBanned: true,
          bannedUntil: null,
        };
        notificationText = `⛔ *Account Permanently Banned*\n\nYour account has been permanently suspended by administration.\n*Reason:* ${reason || 'Severe violation of platform terms.'}\n\nYou may submit an unban appeal from the Telegram bot with /appeal.`;
        break;
      case 'unblock':
        updateData = {
          isBanned: false,
          isPermanentlyBanned: false,
          bannedUntil: null,
          warningCount: 0,
        };
        notificationText = `✅ *Account Restored*\n\nYour account restriction has been lifted by the administration. You can now use PairTalk again! Please ensure you adhere to our community guidelines.`;
        break;
      case 'reset-calls':
        updateData = {
          dailyCallsUsed: 0,
          lastCallDate: new Date().toISOString().slice(0, 7),
        };
        notificationText = `🔄 *Monthly Practice Calls Counter Reset*\n\nYour used calls counter has been reset to 0 by an administrator. You can now enjoy full practice calling allowances!`;
        break;
      case 'reset-score':
        updateData = {
          subFC: 6,
          subLR: 6,
          subGRA: 6,
          subP: 6,
          band: 6.0,
        };
        notificationText = `📊 *Band Score Recalibrated*\n\nYour IELTS band scores have been recalibrated to baseline by an administrator.`;
        break;
    }

    const updated = await prisma.user.update({
      where: { id },
      data: updateData,
    });

    if (['block', 'ban', 'unblock'].includes(action)) {
      await moderationService.invalidateBanCache(updated.telegramId);
    }

    await recordAdminAuditLog({
      action: 'USER_MODERATION',
      targetId: id,
      adminId,
      beforeState: {
        action,
        warningCount: user.warningCount,
        isBanned: user.isBanned,
        isPermanentlyBanned: user.isPermanentlyBanned,
        bannedUntil: user.bannedUntil,
        dailyCallsUsed: user.dailyCallsUsed,
        subFC: user.subFC,
        subLR: user.subLR,
        subGRA: user.subGRA,
        subP: user.subP,
        band: user.band,
      },
      afterState: {
        action,
        warningCount: updated.warningCount,
        isBanned: updated.isBanned,
        isPermanentlyBanned: updated.isPermanentlyBanned,
        bannedUntil: updated.bannedUntil,
        dailyCallsUsed: updated.dailyCallsUsed,
        subFC: updated.subFC,
        subLR: updated.subLR,
        subGRA: updated.subGRA,
        subP: updated.subP,
        band: updated.band,
      },
      reason: reason || `Moderation action: ${action}`,
    });

    if (adminBotInstance && notificationText) {
      await adminBotInstance.api.sendMessage(updated.telegramId.toString(), notificationText, { parse_mode: 'Markdown' })
        .catch((e: unknown) => {
          logger.warn('Failed to send moderation notice', {
            service: 'admin',
            event: 'moderation_notice_failed',
            userId: id,
          }, e);
        });
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
      customPlanName: updated.customPlanName || null,
      status,
      subscores: {
        fc: updated.subFC,
        lr: updated.subLR,
        gra: updated.subGRA,
        p: updated.subP,
        band: updated.band,
      },
      dailyLimit: updated.dailyLimit,
      dailyCallsUsed: updated.dailyCallsUsed,
      maxDuration: updated.maxDuration,
      retentionOverride: updated.retentionOverride || null,
      warningCount: updated.warningCount,
      isPermanentlyBanned: updated.isPermanentlyBanned,
      bannedUntil: updated.bannedUntil ? updated.bannedUntil.toISOString() : null,
      createdAt: updated.createdAt.toISOString(),
    });
  } catch (err) {
    logger.error('Moderation action failed', {
      service: 'admin',
      event: 'moderation_action_failed',
      userId: id,
    }, err);
    res.status(500).json({ error: 'Failed to execute moderation action.' });
  }
});

// GET /api/admin/contest (Protected - Get Contest & Leaderboard)
router.get('/contest', adminAuthMiddleware, async (_req, res) => {
  try {
    const { getContestStatus } = await import('../services/referralService');
    const contestStatus = await getContestStatus();
    const allContests = await prisma.contest.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    const totalReferrals = await prisma.referralReward.count();
    const activeBonusCalls = await prisma.referralReward.count({
      where: { status: 'AVAILABLE', expiresAt: { gt: new Date() } },
    });

    res.json({
      ...contestStatus,
      totalReferrals,
      activeBonusCalls,
      history: allContests,
    });
  } catch (err) {
    logger.error('Failed to fetch contest status', {
      service: 'admin',
      event: 'fetch_contest_failed',
    }, err);
    res.status(500).json({ error: 'Failed to fetch contest status.' });
  }
});

// POST /api/admin/contest (Protected - Create/Launch/Update Contest 4-Step Flow)
router.post('/contest', adminAuthMiddleware, async (req, res) => {
  try {
    const { title, description, prizes, isActive, endsAt, durationDays } = req.body;

    const calculatedEndsAt = typeof durationDays === 'number' && durationDays > 0
      ? new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000)
      : (endsAt ? new Date(endsAt) : null);

    const existingActive = await prisma.contest.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
    });

    let contest;
    if (existingActive) {
      contest = await prisma.contest.update({
        where: { id: existingActive.id },
        data: {
          title: title || existingActive.title,
          description: description || existingActive.description,
          prizes: prizes || existingActive.prizes,
          isActive: isActive !== undefined ? Boolean(isActive) : existingActive.isActive,
          endsAt: calculatedEndsAt || existingActive.endsAt,
        },
      });
    } else {
      contest = await prisma.contest.create({
        data: {
          title: title || 'IELTS Speaking Referral Championship',
          description: description || 'Invite friends to practice speaking and win exclusive prizes!',
          prizes: prizes || '🥇 1st: 60-Day BOSS Plan\n🥈 2nd: 30-Day BOSS Plan\n🥉 3rd: 14-Day PRO Plan',
          isActive: isActive !== undefined ? Boolean(isActive) : true,
          endsAt: calculatedEndsAt,
        },
      });
    }

    const adminId = (req as any).adminUser?.telegramId ? String((req as any).adminUser.telegramId) : 'admin';
    await recordAdminAuditLog({
      action: 'CONTEST_MUTATION',
      targetId: contest.id,
      adminId,
      beforeState: existingActive ? {
        id: existingActive.id,
        title: existingActive.title,
        description: existingActive.description,
        prizes: existingActive.prizes,
        isActive: existingActive.isActive,
        endsAt: existingActive.endsAt,
      } : null,
      afterState: {
        id: contest.id,
        title: contest.title,
        description: contest.description,
        prizes: contest.prizes,
        isActive: contest.isActive,
        endsAt: contest.endsAt,
      },
      reason: 'Admin configured or launched referral championship',
    });

    // Broadcast championship start announcement with Redis deduplication lock
    if (contest.isActive && adminBotInstance) {
      try {
        const redis = getRedis();
        const startLockKey = `champ:broadcast:start:${contest.id}`;
        const acquired = await redis.set(startLockKey, '1', 'EX', 86400 * 30, 'NX');
        if (acquired === 'OK') {
          const { executeAnnouncementBroadcast } = await import('../services/announcement');
          const startAnnouncement =
            `🏆 <b>New Championship Launched!</b>\n\n` +
            `<b>${contest.title}</b>\n\n` +
            `📝 ${contest.description}\n\n` +
            `🎁 <b>Prizes:</b>\n${contest.prizes}\n\n` +
            `Invite your friends using <b>👥 Invite Friends</b> to practice speaking and climb the leaderboard! 🚀`;
          executeAnnouncementBroadcast(
            adminBotInstance.api,
            { type: 'text', text: startAnnouncement },
            'admin'
          ).catch((e: unknown) => {
            logger.warn('Contest start broadcast notice failed', {
              service: 'admin',
              event: 'contest_start_broadcast_failed',
              contestId: contest.id,
            }, e);
          });
        }
      } catch (e: unknown) {
        logger.warn('Failed to trigger contest start broadcast', {
          service: 'admin',
          event: 'contest_start_broadcast_trigger_failed',
          contestId: contest.id,
        }, e);
      }
    }

    res.json({ success: true, contest });
  } catch (err) {
    logger.error('Failed to save contest', {
      service: 'admin',
      event: 'save_contest_failed',
    }, err);
    res.status(500).json({ error: 'Failed to save contest.' });
  }
});

// POST /api/admin/contest/conclude (Protected - Conclude & Distribute Prizes Idempotently)
router.post('/contest/conclude', adminAuthMiddleware, async (req, res) => {
  try {
    const { contestId } = req.body;
    const { concludeContestAndDistributePrizes } = await import('../services/referralService');
    const distribution = await concludeContestAndDistributePrizes(contestId, adminBotInstance || undefined);

    // Broadcast conclusion announcement with Redis deduplication lock
    if (adminBotInstance && !distribution.alreadyAwarded) {
      try {
        const redis = getRedis();
        const endLockKey = `champ:broadcast:end:${distribution.contestId}`;
        const acquired = await redis.set(endLockKey, '1', 'EX', 86400 * 30, 'NX');
        if (acquired === 'OK') {
          const contest = await prisma.contest.findUnique({ where: { id: distribution.contestId } });
          const { executeAnnouncementBroadcast } = await import('../services/announcement');
          const endAnnouncement =
            `🏁 <b>Championship Concluded!</b>\n\n` +
            `The <b>${contest?.title || 'Referral Championship'}</b> has officially ended.\n\n` +
            `Congratulations to all our winners! Winner plans and prizes have been automatically granted. Check the Hall of Fame in the bot menu! 🏆`;
          executeAnnouncementBroadcast(
            adminBotInstance.api,
            { type: 'text', text: endAnnouncement },
            'admin'
          ).catch((e: unknown) => {
            logger.warn('Contest end broadcast notice failed', {
              service: 'admin',
              event: 'contest_end_broadcast_failed',
              contestId: distribution.contestId,
            }, e);
          });
        }
      } catch (e: unknown) {
        logger.warn('Failed to trigger contest end broadcast', {
          service: 'admin',
          event: 'contest_end_broadcast_trigger_failed',
        }, e);
      }
    }

    res.json({ ...distribution });
  } catch (err: any) {
    logger.error('Failed to conclude contest', {
      service: 'admin',
      event: 'conclude_contest_failed',
    }, err);
    res.status(400).json({ error: err.message || 'Failed to conclude contest.' });
  }
});

// POST /api/admin/contest/toggle (Protected - 3-State Toggle: Activate or Conclude)
router.post('/contest/toggle', adminAuthMiddleware, async (req, res) => {
  try {
    const { isActive } = req.body;
    const targetState = Boolean(isActive);
    const adminId = (req as any).adminUser?.telegramId ? String((req as any).adminUser.telegramId) : 'admin';

    if (!targetState) {
      // Conclude contest and execute atomic idempotent prize distribution
      const { concludeContestAndDistributePrizes } = await import('../services/referralService');
      const distribution = await concludeContestAndDistributePrizes(undefined, adminBotInstance || undefined);
      const contest = await prisma.contest.findUnique({ where: { id: distribution.contestId } });

      await recordAdminAuditLog({
        action: 'CONTEST_TOGGLE',
        targetId: distribution.contestId,
        adminId,
        beforeState: { isActive: true },
        afterState: { isActive: false },
        reason: 'Admin concluded championship via toggle',
      });

      res.json({ success: true, contest, distribution });
      return;
    }

    const latest = await prisma.contest.findFirst({
      orderBy: { createdAt: 'desc' },
    });

    if (!latest) {
      const created = await prisma.contest.create({
        data: {
          title: 'IELTS Speaking Referral Championship',
          description: 'Invite your friends to practice IELTS speaking! Top referrers win exclusive custom plans and prizes.',
          prizes: '🥇 1st: 60-Day BOSS Plan\n🥈 2nd: 30-Day BOSS Plan\n🥉 3rd: 14-Day PRO Plan',
          isActive: true,
        },
      });

      await recordAdminAuditLog({
        action: 'CONTEST_TOGGLE',
        targetId: created.id,
        adminId,
        beforeState: null,
        afterState: { isActive: true, title: created.title },
        reason: 'Admin created & activated new championship via toggle',
      });

      res.json({ success: true, contest: created });
      return;
    }

    const updated = await prisma.contest.update({
      where: { id: latest.id },
      data: { isActive: true },
    });

    await recordAdminAuditLog({
      action: 'CONTEST_TOGGLE',
      targetId: updated.id,
      adminId,
      beforeState: { isActive: latest.isActive },
      afterState: { isActive: true },
      reason: 'Admin activated championship via toggle',
    });

    res.json({ success: true, contest: updated });
  } catch (err: any) {
    logger.error('Failed to toggle contest', {
      service: 'admin',
      event: 'toggle_contest_failed',
    }, err);
    res.status(400).json({ error: err.message || 'Failed to toggle contest.' });
  }
});

export default router;

