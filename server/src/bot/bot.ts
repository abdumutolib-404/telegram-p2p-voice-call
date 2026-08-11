import { Bot, session } from 'grammy';
import { MyContext, SessionData } from './types';
import { setupStartCommand } from './commands/start';
import { setupAdminCommand } from './commands/admin';
import { setupMenuHandlers } from './handlers/menu';
import { setupPaymentHandlers } from './handlers/payments';
import { setupCallbackHandlers } from './handlers/callbacks';
import { setupPostCallCallbackHandlers } from './handlers/postCall';

export function createBot(token: string): Bot<MyContext> {
  const bot = new Bot<MyContext>(token);

  // Session middleware
  bot.use(
    session({
      initial: (): SessionData => ({ step: 'idle' }),
    })
  );

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
