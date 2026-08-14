import { Bot, session } from 'grammy';
import { MyContext, SessionData } from './types';
import { setupStartCommand } from './commands/start';
import { setupAdminCommand } from './commands/admin';
import { setupMenuHandlers } from './handlers/menu';
import { setupPaymentHandlers } from './handlers/payments';
import { setupCallbackHandlers } from './handlers/callbacks';
import { setupPostCallCallbackHandlers } from './handlers/postCall';
import { prisma } from '../config/database';

const userActionTimestamps = new Map<number, number[]>();

export function createBot(token: string): Bot<MyContext> {
  const bot = new Bot<MyContext>(token);

  // Session middleware
  bot.use(
    session({
      initial: (): SessionData => ({ step: 'idle' }),
    })
  );

  // 1. Rate Limiting Middleware (Anti-Spam on Bot Commands & Buttons)
  bot.use(async (ctx, next) => {
    const fromId = ctx.from?.id;
    if (!fromId) return next();

    const now = Date.now();
    const timestamps = (userActionTimestamps.get(fromId) || []).filter((t) => now - t < 2000);
    if (timestamps.length >= 4) {
      if (ctx.callbackQuery) {
        await ctx.answerCallbackQuery({ text: '⚠️ Please slow down! Too many requests.', show_alert: true }).catch(() => undefined);
      }
      return;
    }
    timestamps.push(now);
    userActionTimestamps.set(fromId, timestamps);

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
      callbackData.startsWith('appeal_') ||
      text.startsWith('/admin') ||
      callbackData.startsWith('buy_plan');

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

  return bot;
}
