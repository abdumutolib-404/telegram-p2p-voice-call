import { Bot, session } from 'grammy';
import { MyContext, SessionData } from './types';
import { setupStartCommand } from './commands/start';
import { setupMenuHandlers } from './handlers/menu';
import { setupPaymentHandlers } from './handlers/payments';
import { setupCallbackHandlers } from './handlers/callbacks';
import { setupPostCallCallbackHandlers } from './handlers/postCall';
import { prisma } from '../config/database';
import { checkRateLimit } from '../services/rateLimitMatrix';

export function createBot(token: string): Bot<MyContext> {
  const bot = new Bot<MyContext>(token);

  // Session middleware
  bot.use(
    session({
      initial: (): SessionData => ({ step: 'idle' }),
    })
  );

  // 1. Rate Limiting Middleware (Anti-Spam on Bot Commands & Buttons with 5-minute penalty lockout)
  bot.use(async (ctx, next) => {
    const fromId = ctx.from?.id;
    if (!fromId) return next();

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
  setupMenuHandlers(bot);
  setupPaymentHandlers(bot);
  setupCallbackHandlers(bot);
  setupPostCallCallbackHandlers(bot);

  // Command: /privacy
  bot.command('privacy', async (ctx) => {
    await ctx.reply(
      `🔒 <b>Privacy Policy Summary</b>\n\n` +
        `• <b>Audio Streams</b>: Real-time voice is routed through encrypted audio channels and never recorded without consent.\n` +
        `• <b>Recordings</b>: Stored securely with strict plan-based expiration (1–60 days), accessible only to call participants.\n` +
        `• <b>Payments</b>: Telegram Stars payments are processed directly by Telegram. Card receipts are reviewed by administration.\n` +
        `• <b>Data Deletion</b>: You can request account deletion anytime via support.\n\n` +
        `<i>For full policy, see the platform documentation.</i>`,
      { parse_mode: 'HTML' }
    );
  });

  // Command: /guidelines
  bot.command('guidelines', async (ctx) => {
    await ctx.reply(
      `📖 <b>Community Guidelines</b>\n\n` +
        `1. <b>Respect</b>: Harassment, abuse, or discrimination is strictly prohibited.\n` +
        `2. <b>Practice Focus</b>: Dedicate speaking sessions to English conversation and IELTS topics.\n` +
        `3. <b>Fair Ratings</b>: Submit honest, constructive feedback for speaking partners.\n` +
        `4. <b>Enforcement</b>: Violations lead to timeouts, temporary suspensions, or permanent unappealable bans.\n\n` +
        `<i>Happy practicing!</i>`,
      { parse_mode: 'HTML' }
    );
  });

  return bot;
}
