import crypto from 'node:crypto';
import { telegramTransport } from './telegramTransport';
import { TELEGRAM_CLIENT_OPTIONS } from './polling';
import { Bot, session } from 'grammy';
import { sequentialize } from '@grammyjs/runner';
import { MyContext, SessionData } from './types';
import { setupStartCommand } from './commands/start';
import { setupTermsHandlers } from './handlers/terms';
import { setupAdminCommand } from './commands/admin';
import { setupMenuHandlers } from './handlers/menu';
import { setupPaymentHandlers } from './handlers/payments';
import { setupRefundHandlers } from './handlers/refund';
import { setupCallbackHandlers } from './handlers/callbacks';
import { setupDashboardNavigation } from './handlers/dashboardNavigation';
import { prisma } from '../config/database';
import { checkRateLimit } from '../services/rateLimitMatrix';
import { getRedis } from '../config/redis';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { hasAcceptedCurrentTerms } from '../services/terms';
import { offerTerms } from './handlers/terms';

interface MemorySessionEntry {
  data: SessionData;
  updatedAt: number;
}

const MAX_MEMORY_SESSIONS = 5000;
const MEMORY_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const memorySessions = new Map<string, MemorySessionEntry>();

function pruneMemorySessions(): void {
  const now = Date.now();
  for (const [k, v] of memorySessions.entries()) {
    if (now - v.updatedAt > MEMORY_SESSION_TTL_MS) {
      memorySessions.delete(k);
    }
  }
  if (memorySessions.size > MAX_MEMORY_SESSIONS) {
    const sorted = [...memorySessions.entries()].sort((a, b) => a[1].updatedAt - b[1].updatedAt);
    const toRemove = sorted.slice(0, memorySessions.size - MAX_MEMORY_SESSIONS);
    for (const [k] of toRemove) {
      memorySessions.delete(k);
    }
  }
}

const HOT_SESSION_TTL_MS = 60 * 1000; // 60 seconds hot cache

function createRedisSessionStorage(namespace: string) {
  return {
    async read(key: string): Promise<SessionData | undefined> {
      const entry = memorySessions.get(key);
      if (env.NODE_ENV === 'test' && entry && Date.now() - entry.updatedAt < HOT_SESSION_TTL_MS) {
        entry.updatedAt = Date.now();
        return entry.data;
      }
      try {
        const redis = getRedis();
        const data = await redis.get(`bot:session:${namespace}:${key}`);
        if (data) {
          const parsed = JSON.parse(data);
          memorySessions.set(key, { data: parsed, updatedAt: Date.now() });
          return parsed;
        }
      } catch (error) {
        if (env.NODE_ENV !== 'test') throw error;
      }
      if (!entry) return undefined;
      if (Date.now() - entry.updatedAt > MEMORY_SESSION_TTL_MS) {
        memorySessions.delete(key);
        return undefined;
      }
      entry.updatedAt = Date.now();
      return entry.data;
    },
    async write(key: string, value: SessionData): Promise<void> {
      memorySessions.set(key, { data: value, updatedAt: Date.now() });
      if (memorySessions.size > MAX_MEMORY_SESSIONS) {
        pruneMemorySessions();
      }
      try {
        const redis = getRedis();
        await redis.set(`bot:session:${namespace}:${key}`, JSON.stringify(value), 'EX', 86400 * 7); // 7 days
      } catch (error) {
        if (env.NODE_ENV !== 'test') throw error;
      }
    },
    async delete(key: string): Promise<void> {
      memorySessions.delete(key);
      try {
        const redis = getRedis();
        await redis.del(`bot:session:${namespace}:${key}`);
      } catch (error) {
        if (env.NODE_ENV !== 'test') throw error;
      }
    },
  };
}

export function isModalAlertCallback(data: string | undefined): boolean {
  if (!data) return false;
  return (
    data === 'mute_surge_alerts' ||
    data.startsWith('direct_call:') ||
    data.startsWith('call_favorite:') ||
    data.startsWith('accept_direct:') ||
    data.startsWith('decline_direct:') ||
    data.startsWith('cancel_direct:') ||
    data.startsWith('favorite_partner:') ||
    data.startsWith('remove_favorite:') ||
    data.startsWith('rate_call:') ||
    data.startsWith('report_partner:') ||
    data.startsWith('play_rec:') ||
    data.startsWith('play_rec_') ||
    data.startsWith('play_recording:') ||
    data.startsWith('play_recording_') ||
    data.startsWith('plan:') ||
    data.startsWith('buy_plan:') ||
    data.startsWith('manual_pay:') ||
    data.startsWith('select_plan:') ||
    data.startsWith('pay_stars:') ||
    data.startsWith('pay_card:') ||
    data.startsWith('pay_click:') ||
    data.startsWith('pay_payme:') ||
    data.startsWith('pay_uzcard:') ||
    data.startsWith('cancel_pay:') ||
    data.startsWith('cancel_manual_pay:') ||
    data === 'request_refund' ||
    data.startsWith('exec_stars_refund:') ||
    data.startsWith('submit_uzs_refund:') ||
    data === 'cancel_refund'
  );
}

export function isStandardNavigationCallback(data: string | undefined): boolean {
  if (!data) return false;
  return !isModalAlertCallback(data);
}

export function createBot(token: string): Bot<MyContext> {
  const bot = new Bot<MyContext>(token, { client: TELEGRAM_CLIENT_OPTIONS });
  const namespace = crypto.createHash('sha256').update(token).digest('hex').slice(0,24);

  bot.api.config.use(telegramTransport(token));

  // Early Fast-ACK Middleware: immediately acknowledge inline button clicks for standard navigation & non-alert actions (<30ms)
  bot.use(async (ctx, next) => {
    if (ctx.callbackQuery && isStandardNavigationCallback(ctx.callbackQuery.data)) {
      const acknowledge = ctx.answerCallbackQuery.bind(ctx);
      const acknowledgement = acknowledge().catch(() => true as const);
      ctx.answerCallbackQuery = () => acknowledgement;
    }
    return next();
  });

  bot.use(async (ctx, next) => {
    if (ctx.update.update_id === undefined) return next();
    const redis = getRedis(), key = 'bot:update:' + namespace + ':' + ctx.update.update_id;
    if (await redis.set(key, 'PROCESSING', 'EX', 86400, 'NX') !== 'OK') return;
    const started = Date.now();
    try { await next(); await redis.set(key, 'DONE', 'EX', 86400); }
    catch (error) { await redis.set(key, 'REVIEW_REQUIRED', 'EX', 86400).catch(() => undefined); throw error; }
    finally { logger.debug('Bot update completed', { service:'bot', updateId:ctx.update.update_id, durationMs:Date.now()-started }); }
  });
  bot.use(sequentialize(ctx => ctx.chat?.id.toString()));

  // Persistent Redis Session middleware (persists across container restarts)
  bot.use(
    session({
      initial: (): SessionData => ({ step: 'idle' }),
      storage: createRedisSessionStorage(namespace),
    })
  );

  // Consolidated Middleware: Parallel Rate Limiting and Ban Check
  bot.use(async (ctx, next) => {
    // Immediate guard clause: never drop or delay payment webhooks
    if (ctx.preCheckoutQuery || ctx.message?.successful_payment) {
      return next();
    }

    const fromId = ctx.from?.id;
    if (!fromId) return next();

    const text = ctx.message?.text || '';
    const callbackData = ctx.callbackQuery?.data || '';

    // Determine exemptions: Only whitelisted administrators are rate-limit exempt
    const isAdmin = env.ADMIN_TELEGRAM_IDS.includes(String(fromId));
    const isRateLimitExempt = isAdmin;
    const isBanExempt =
      text.startsWith('/start') || text.startsWith('/terms') || text.startsWith('/refund') || text.startsWith('/paysupport') || callbackData.startsWith('terms_') ||
      text.startsWith('/appeal') ||
      text === '💬 Support' ||
      callbackData === 'submit_appeal' ||
      callbackData.startsWith('appeal_');

    const action = ctx.callbackQuery ? 'BOT_BUTTON' : 'BOT_COMMAND';
    const redis = getRedis();
    const banCacheKey = `bot:ban_check:${fromId}`;

    // Consolidate Redis lookups concurrently (1 roundtrip instead of sequential roundtrips)
    const [rl, cachedBan] = await Promise.all([
      isRateLimitExempt
        ? Promise.resolve<{ allowed: boolean; retryAfterSeconds?: number; remaining?: number }>({ allowed: true, remaining: 999 })
        : checkRateLimit(action, String(fromId)),
      isBanExempt ? Promise.resolve('CLEAN') : redis.get(banCacheKey).catch(() => null),
    ]);

    // Check rate limit failure (preserves show_alert: true modal popup for button taps)
    if (!rl.allowed) {
      const waitTime = rl.retryAfterSeconds || 300;
      if (ctx.callbackQuery) {
        await ctx.answerCallbackQuery({
          text: `⚠️ Rate limit reached. Please wait ${waitTime}s before sending more requests.`,
          show_alert: true,
        }).catch(() => undefined);
      } else {
        await ctx.reply(
          `⚠️ <b>Rate Limit Reached</b>\n\nPlease slow down. You can send new requests in <b>${waitTime} seconds</b>.`,
          { parse_mode: 'HTML' }
        ).catch(() => undefined);
      }
      return;
    }

    // Check suspension if not exempt (preserves show_alert: true modal popup)
    if (!isBanExempt) {
      if (cachedBan && cachedBan !== 'CLEAN') {
        try {
          const banInfo = JSON.parse(cachedBan);
          const banTimeStr = banInfo.banTimeStr || 'temporarily';
          if (ctx.callbackQuery) {
            await ctx.answerCallbackQuery({
              text: `🚫 Account suspended ${banTimeStr}. You can only use Support / Appeals.`,
              show_alert: true,
            }).catch(() => undefined);
          } else {
            await ctx.reply(
              `🚫 <b>Account Suspended (${banTimeStr})</b>\n\n` +
                `Your account is currently restricted from matchmaking and practicing.\n\n` +
                `To submit an appeal to our moderation team, please type:\n<code>/appeal &lt;your reason or explanation&gt;</code> or tap <b>💬 Support</b>.`,
              { parse_mode: 'HTML' }
            ).catch(() => undefined);
          }
          return;
        } catch {
          // parse error, fallback to DB
        }
      }

      if (!cachedBan) {
        try {
          const user = await prisma.user.findUnique({
            where: { telegramId: BigInt(fromId) },
          });

          if (user) {
            const isSuspended =
              user.isBanned ||
              user.isPermanentlyBanned ||
              Boolean(user.bannedUntil && new Date(user.bannedUntil) > new Date());

            if (isSuspended) {
              const banTimeStr = user.bannedUntil
                ? `until ${new Date(user.bannedUntil).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} UTC`
                : 'permanently';

              await redis.set(banCacheKey, JSON.stringify({ isSuspended: true, banTimeStr }), 'EX', 60).catch(() => undefined);

              if (ctx.callbackQuery) {
                await ctx.answerCallbackQuery({
                  text: `🚫 Account suspended ${banTimeStr}. You can only use Support / Appeals.`,
                  show_alert: true,
                }).catch(() => undefined);
              } else {
                await ctx.reply(
                  `🚫 <b>Account Suspended (${banTimeStr})</b>\n\n` +
                    `Your account is currently restricted from matchmaking and practicing.\n\n` +
                    `To submit an appeal to our moderation team, please type:\n<code>/appeal &lt;your reason or explanation&gt;</code> or tap <b>💬 Support</b>.`,
                  { parse_mode: 'HTML' }
                ).catch(() => undefined);
              }
              return;
            }
          }

          // User is clean: cache for 600s (10 minutes)
          await redis.set(banCacheKey, 'CLEAN', 'EX', 600).catch(() => undefined);
        } catch (err) {
          logger.error('Bot auth suspension check failed', {
            service: 'bot',
            event: 'bot_suspension_check_failed',
          }, err);
        }
      }
    }

    return next();
  });

  // Catch errors to prevent bot crash
  bot.catch((err) => {
    const errorObj = err.error as any;
    const errorMsg = String(errorObj?.message || errorObj?.description || errorObj || '');
    if (
      errorMsg.includes('message is not modified') ||
      errorMsg.includes('query is too old') ||
      errorMsg.includes('message to edit not found')
    ) {
      return; // Ignore benign duplicate button clicks
    }
    logger.error(`Grammy bot update ${err.ctx.update.update_id} failed: ${errorMsg}`, {
      service: 'bot',
      event: 'bot_update_error',
      updateId: err.ctx.update.update_id,
      errorName: errorObj?.name,
      errorMessage: errorMsg,
      errorStack: errorObj?.stack,
    }, err.error);
  });

  // Register commands & handlers
  bot.use(async (ctx, next) => {
    // Settled payments, refunds and support must not depend on renewed consent.
    if (ctx.preCheckoutQuery || ctx.message?.successful_payment) return next();
    const data = ctx.callbackQuery?.data || '';
    const text = ctx.message?.text || '';
    const buying = /^(?:select_plan|buy_plan|manual_pay):/.test(data) || /^(?:\/plans(?:\s|$)|⭐ (?:Upgrade|Subscription|Plans))/.test(text) || ctx.session.step === 'awaiting_receipt';
    if (buying && ctx.from) {
      const user = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from.id) } });
      if (!user?.onboarded || !hasAcceptedCurrentTerms(user)) { await offerTerms(ctx); return; }
    }
    return next();
  });
  setupStartCommand(bot);
  setupTermsHandlers(bot);
  setupAdminCommand(bot);
  setupMenuHandlers(bot);
  setupDashboardNavigation(bot);
  setupPaymentHandlers(bot);
  setupRefundHandlers(bot);
  setupCallbackHandlers(bot);

  return bot;
}
