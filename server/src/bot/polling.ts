import { run, type RunnerHandle } from '@grammyjs/runner';
import type { ApiClientOptions, Bot } from 'grammy';
import type { MyContext } from './types';

export const TELEGRAM_CLIENT_OPTIONS = { timeoutSeconds: 15 } satisfies ApiClientOptions;

export function startTelegramPolling(bot: Bot<MyContext>): RunnerHandle {
  return run(bot, {
    sink: { concurrency: 50 },
    runner: {
      silent: true,
      maxRetryTime: 30000,
      retryInterval: 'exponential',
      fetch: {
        // Leave five seconds for network overhead before the API client aborts.
        timeout: TELEGRAM_CLIENT_OPTIONS.timeoutSeconds - 5,
        allowed_updates: ['message', 'callback_query', 'pre_checkout_query'],
      },
    },
  });
}
