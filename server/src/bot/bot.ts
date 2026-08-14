import { Bot, session } from 'grammy';
import { MyContext, SessionData } from './types';
import { setupStartCommand } from './commands/start';
import { setupAdminCommand } from './commands/admin';
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
          text: `⚠️ Rate limit exceeded. Please wait ${waitTime}s before sending more commands.`,
          show_alert: true,
        }).catch(() => undefined);
      } else {
        await ctx.reply(
          `⚠️ *Rate Limit Exceeded*\n\nPlease slow down. You can send new commands in *${waitTime} seconds*.`,
          { parse_mode: 'Markdown' }
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
              `🚫 *Account Suspended (${banTimeStr})*\n\n` +
                `Your account is currently restricted from matchmaking and practicing.\n\n` +
                `To submit an appeal to our moderation team, please type:\n\`/appeal <your reason or explanation>\` or tap *💬 Support*.`,
              { parse_mode: 'Markdown' }
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
  setupCallbackHandlers(bot);
  setupPostCallCallbackHandlers(bot);

  // Command: /privacy
  bot.command('privacy', async (ctx) => {
    await ctx.reply(
      `🔒 *Privacy Policy Summary*\n\n` +
        `• *Audio Streams*: Real-time voice is routed through encrypted WebRTC SFU servers and never recorded without consent.\n` +
        `• *Recordings*: Stored securely with strict plan-based expiration (1–60 days), accessible only to call participants.\n` +
        `• *Payments*: Telegram Stars payments are processed directly by Telegram. Card receipts are reviewed by admin.\n` +
        `• *Data Deletion*: You can request account deletion anytime via @IELTS_P2P_Admin.\n\n` +
        `_For full policy, see the platform documentation._`,
      { parse_mode: 'Markdown' }
    );
  });

  // Command: /guidelines
  bot.command('guidelines', async (ctx) => {
    await ctx.reply(
      `📖 *Community Guidelines*\n\n` +
        `1. *Respect*: Harassment, abuse, or discrimination is strictly prohibited.\n` +
        `2. *Practice Focus*: Dedicate speaking sessions to English conversation and IELTS topics.\n` +
        `3. *Fair Ratings*: Submit honest, constructive feedback for speaking partners.\n` +
        `4. *Enforcement*: Violations lead to 24h timeouts, 7d suspensions, or permanent unappealable bans.\n\n` +
        `_Happy practicing!_`,
      { parse_mode: 'Markdown' }
    );
  });

  return bot;
}
