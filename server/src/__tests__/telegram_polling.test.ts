import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Bot, type ApiClientOptions } from 'grammy';
import { run, type RunnerHandle } from '@grammyjs/runner';
import type { MyContext } from '../bot/types';
import { startTelegramPolling, TELEGRAM_CLIENT_OPTIONS } from '../bot/polling';
import { telegramTransport } from '../bot/telegramTransport';

vi.mock('../config/redis', () => ({ getRedis: vi.fn(() => { throw new Error('Polling must bypass outbound throttling'); }) }));
vi.mock('../utils/logger', () => ({ logger: { debug: vi.fn(), warn: vi.fn() } }));

type Reply = { ok: true; result: unknown } | { ok: false; error_code: number; description: string };
type Request = { method: string; payload: Record<string, unknown>; signal: AbortSignal };
let runner: RunnerHandle | undefined;

function botWithFetch(reply: (request: Request) => Promise<Reply>) {
  const fetch = vi.fn(async (url: string, options: { body: string; signal: AbortSignal }) => {
    const result = await reply({ method: url.split('/').at(-1)!, payload: JSON.parse(options.body), signal: options.signal });
    return { json: async () => result };
  });
  const bot = new Bot<MyContext>('synthetic-token', {
    client: { ...TELEGRAM_CLIENT_OPTIONS, apiRoot: 'https://telegram.invalid', fetch: fetch as unknown as ApiClientOptions['fetch'] },
    botInfo: { id: 1, is_bot: true, first_name: 'Synthetic', username: 'synthetic_bot', can_join_groups: false, can_read_all_group_messages: false, supports_inline_queries: false },
  });
  bot.api.config.use(telegramTransport('synthetic-token'));
  return { bot, fetch };
}

function waitForReply(request: Request, delay: number): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(new Error('Synthetic request cancelled')); };
    const timer = setTimeout(() => {
      request.signal.removeEventListener('abort', abort);
      resolve({ ok: true, result: [] });
    }, delay);
    request.signal.addEventListener('abort', abort, { once: true });
    if (request.signal.aborted) abort();
  });
}

beforeEach(() => vi.useFakeTimers());
afterEach(async () => {
  await runner?.stop();
  runner = undefined;
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('production Telegram polling with the real grammY runner and API client', () => {
  it('reproduces the client abort with the runner default of thirty-second polls', async () => {
    const { bot, fetch } = botWithFetch(request => waitForReply(request, Number(request.payload.timeout) * 1000));
    runner = run(bot, { runner: { silent: true, maxRetryTime: 0 } });
    const outcome = runner.task()!.then(() => null, error => error);
    await vi.advanceTimersByTimeAsync(15000);
    expect((await outcome).error.message).toContain("'getUpdates' timed out after 15 seconds");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(runner.isRunning()).toBe(false);
  });

  it('survives multiple full idle polls plus network overhead within the client deadline', async () => {
    const requests: Request[] = [];
    const { bot, fetch } = botWithFetch(async request => {
      requests.push(request);
      return waitForReply(request, Number(request.payload.timeout) * 1000 + 1000);
    });
    runner = startTelegramPolling(bot);
    const failure = vi.fn();
    runner.task()!.catch(failure);

    await vi.advanceTimersByTimeAsync(33000);

    expect(failure).not.toHaveBeenCalled();
    expect(runner.isRunning()).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(4);
    for (const request of requests) {
      expect(request.method).toBe('getUpdates');
      expect(request.payload.timeout).toBe(10);
      expect(Number(request.payload.timeout) + 1).toBeLessThan(TELEGRAM_CLIENT_OPTIONS.timeoutSeconds);
      expect(request.payload.allowed_updates).toEqual(['message', 'callback_query', 'pre_checkout_query']);
    }
  });

  it('keeps ordinary API requests bounded to fifteen seconds', async () => {
    const { bot, fetch } = botWithFetch(request => waitForReply(request, 60000));
    const outcome = bot.api.getMe().then(() => null, error => error);
    await vi.advanceTimersByTimeAsync(14999);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect((await outcome).error.message).toContain("'getMe' timed out after 15 seconds");
  });

  it('cancels an outstanding poll immediately on shutdown without retrying', async () => {
    const { bot, fetch } = botWithFetch(request => waitForReply(request, 11000));
    runner = startTelegramPolling(bot);
    await vi.advanceTimersByTimeAsync(1);
    const task = runner.task()!;
    await runner.stop();
    await expect(task).resolves.toBeUndefined();
    await vi.advanceTimersByTimeAsync(60000);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(runner.isRunning()).toBe(false);
  });

  it('retries a transient polling network error and continues with healthy polls', async () => {
    let attempts = 0;
    const { bot, fetch } = botWithFetch(request => {
      if (++attempts === 1) return Promise.reject(new Error('Synthetic network interruption'));
      return waitForReply(request, 11000);
    });
    runner = startTelegramPolling(bot);
    const failure = vi.fn();
    runner.task()!.catch(failure);
    await vi.advanceTimersByTimeAsync(22100);
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(failure).not.toHaveBeenCalled();
    expect(runner.isRunning()).toBe(true);
  });

  it('bounds persistent network failures with the existing thirty-second retry budget', async () => {
    const { bot, fetch } = botWithFetch(async () => { throw new Error('Synthetic unavailable endpoint'); });
    runner = startTelegramPolling(bot);
    const outcome = runner.task()!.then(() => null, error => error);
    await vi.advanceTimersByTimeAsync(30000);
    expect((await outcome).error.message).toBe('Synthetic unavailable endpoint');
    expect(fetch.mock.calls.length).toBeGreaterThan(1);
    expect(runner.isRunning()).toBe(false);
  });

  it.each([401, 409])('does not retry a terminal Telegram %i response', async error_code => {
    const { bot, fetch } = botWithFetch(async () => ({ ok: false, error_code, description: 'Synthetic terminal failure' }));
    runner = startTelegramPolling(bot);
    const outcome = runner.task()!.then(() => null, error => error);
    await vi.advanceTimersByTimeAsync(1);
    expect((await outcome).error_code).toBe(error_code);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(runner.isRunning()).toBe(false);
  });
});
