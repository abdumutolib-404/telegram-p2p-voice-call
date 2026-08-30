import { Bot, session } from 'grammy';
import { MyContext, SessionData } from './types';
import { setupStartCommand } from './commands/start';
import { setupAdminCommand } from './commands/admin';
import { setupMenuHandlers } from './handlers/menu';
import { setupPaymentHandlers } from './handlers/payments';
import { setupRefundHandlers } from './handlers/refund';
import { setupCallbackHandlers } from './handlers/callbacks';
import { setupPostCallCallbackHandlers } from './handlers/postCall';
import { prisma } from '../config/database';
import { checkRateLimit } from '../services/rateLimitMatrix';
import { getRedis } from '../config/redis';
import { env } from '../config/env';

const memorySessions = new Map<string, SessionData>();

function createRedisSessionStorage() {
  return {
    async read(key: string): Promise<SessionData | undefined> {
      try {
        const redis = getRedis();
        const data = await redis.get(`bot:session:${key}`);
        if (data) {
          return JSON.parse(data);
        }
      } catch {
        // Fallback to memory
      }
      return memorySessions.get(key);
    },
    async write(key: string, value: SessionData): Promise<void> {
      memorySessions.set(key, value);
      try {
        const redis = getRedis();
        await redis.set(`bot:session:${key}`, JSON.stringify(value), 'EX', 86400 * 7); // 7 days
      } catch {
        // Fallback to memory
      }
    },
    async delete(key: string): Promise<void> {
      memorySessions.delete(key);
      try {
        const redis = getRedis();
        await redis.del(`bot:session:${key}`);
      } catch {
        // Fallback to memory
      }
    },
  };
}

export function createBot(token: string): Bot<MyContext> {
  const bot = new Bot<MyContext>(token);

  // Global API 429 auto-retry transformer for all outgoing Telegram Bot API requests
  bot.api.config.use(async (prev, method, payload, signal) => {
    const maxRetries = 3;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await prev(method, payload, signal);
      } catch (error: any) {
        if (error?.error_code === 429 && attempt < maxRetries) {
          const retryAfter = (error.parameters?.retry_after || 1) * 1000;
          console.warn(`[Telegram API 429] Method ${method} rate limited. Retrying in ${retryAfter}ms (attempt ${attempt + 1}/${maxRetries})`);
          await new Promise((resolve) => setTimeout(resolve, retryAfter));
          continue;
        }
        throw error;
      }
    }
    return prev(method, payload, signal);
  });

  // Persistent Redis Session middleware (persists across container restarts)
  bot.use(
    session({
      initial: (): SessionData => ({ step: 'idle' }),
      storage: createRedisSessionStorage(),
    })
  );

  // 1. Rate Limiting Middleware (Anti-Spam on Bot Commands & Buttons with 5-minute penalty lockout)
  bot.use(async (ctx, next) => {
    const fromId = ctx.from?.id;
    if (!fromId) return next();

    // Admins are strictly exempt from rate limiting
    if (env.ADMIN_TELEGRAM_IDS.includes(String(fromId))) {
      return next();
    }

    // Active multi-step inputs (e.g. entering card number, appeal text, receipt upload) are exempt from command rate limiting
    if (ctx.session?.step && ctx.session.step !== 'idle') {
      return next();
    }

    const action = ctx.callbackQuery ? 'BOT_BUTTON' : 'BOT_COMMAND';
    const rl = await checkRateLimit(action, String(fromId));

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

    return next();
  });

  // 2. Global Suspension Middleware (Restricts banned/suspended users to Support & Appeal only)
  bot.use(async (ctx, next) => {
    const telegramIdNum = ctx.from?.id;
    if (!telegramIdNum) return next();

    const text = ctx.message?.text || '';
    const callbackData = ctx.callbackQuery?.data || '';

    // Allow Start, Support, and Appeal flows unconditionally
    const isExemptAction =
      text.startsWith('/start') ||
      text.startsWith('/appeal') ||
      text === '💬 Support' ||
      callbackData === 'submit_appeal' ||
      callbackData.startsWith('appeal_');

    if (isExemptAction) {
      return next();
    }

    try {
      const user = await prisma.user.findUnique({
        where: { telegramId: BigInt(telegramIdNum) },
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

          if (ctx.callbackQuery) {
            await ctx.answerCallbackQuery({
              text: `🚫 Account suspended ${banTimeStr}. You can only use Support / Appeals.`,
              show_alert: true,
            });
          } else {
            await ctx.reply(
              `🚫 <b>Account Suspended (${banTimeStr})</b>\n\n` +
                `Your account is currently restricted from matchmaking and practicing.\n\n` +
                `To submit an appeal to our moderation team, please type:\n<code>/appeal &lt;your reason or explanation&gt;</code> or tap <b>💬 Support</b>.`,
              { parse_mode: 'HTML' }
            );
          }
          return;
        }
      }
    } catch (err) {
      console.error('[Bot Auth Check Failed]', err);
    }

    return next();
  });

  // Catch errors to prevent bot crash
  bot.catch((err) => {
    console.error(`[Grammy Bot Error] Update ${err.ctx.update.update_id} failed:`, err.error);
  });

  // Register commands & handlers
  setupStartCommand(bot);
  setupAdminCommand(bot);
  setupMenuHandlers(bot);
  setupPaymentHandlers(bot);
  setupRefundHandlers(bot);
  setupCallbackHandlers(bot);
  setupPostCallCallbackHandlers(bot);

  return bot;
}
