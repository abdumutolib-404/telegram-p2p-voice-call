import crypto from 'node:crypto';
import type { Transformer } from 'grammy';
import { getRedis } from '../config/redis';
import { logger } from '../utils/logger';
export function abortableDelay(ms: number, signal?: { aborted:boolean; reason?:unknown; addEventListener:AbortSignal['addEventListener']; removeEventListener:AbortSignal['removeEventListener'] }): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(signal.reason); return; }
    const abort = () => { clearTimeout(timer); reject(signal?.reason || new Error('Cancelled')); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, ms);
    signal?.addEventListener('abort', abort, { once: true });
  });
}
export const TELEGRAM_SLOT_SCRIPT = `-- TELEGRAM_SLOT
local t=redis.call('TIME'); local now=t[1]*1000+math.floor(t[2]/1000)
local g=tonumber(redis.call('GET',KEYS[1]) or 0)
local c=tonumber(redis.call('GET',KEYS[2]) or 0)
local pause=tonumber(redis.call('GET',KEYS[3]) or 0)
local wait=math.max(g,c,pause)-now
if wait>0 then return wait end
redis.call('SET',KEYS[1],now+40,'PX',60000)
redis.call('SET',KEYS[2],now+tonumber(ARGV[1]),'PX',60000)
return 0`;
const COOLDOWN_SCRIPT = `-- TELEGRAM_COOLDOWN
local t=redis.call('TIME'); local untilAt=t[1]*1000+math.floor(t[2]/1000)+tonumber(ARGV[1])
local old=tonumber(redis.call('GET',KEYS[1]) or 0)
if untilAt>old then redis.call('SET',KEYS[1],untilAt,'PX',ARGV[1]) end
return 1`;
export function telegramTransport(token: string): Transformer {
  const prefix = 'tg:{' + crypto.createHash('sha256').update(token).digest('hex').slice(0,24) + '}:';
  let pending = 0;
  return async (previous, method, payload, signal) => {
    if (method === 'getUpdates') return previous(method, payload, signal);
    if (pending >= 200) throw new Error('Telegram outbound queue is full');
    pending++;
    const start = Date.now();
    const chat = 'chat_id' in payload ? String(payload.chat_id) : '';
    const message = !!chat && /^(send|copy|forward|editMessage)/.test(method);
    try {
      for (let attempt = 0; attempt <= 3; attempt++) {
        if (message) {
          while (true) {
            const wait = Number(await getRedis().eval(TELEGRAM_SLOT_SCRIPT, 3, prefix+'global', prefix+'chat:'+chat, prefix+'pause', chat.startsWith('-') ? '3000' : '1000'));
            if (wait <= 0) break;
            if (wait > 30000 || Date.now() - start + wait > 45000) throw new Error('Telegram outbound wait exceeded its deadline');
            await abortableDelay(wait, signal);
          }
        }
        // Transformers receive the raw Bot API response; a 429 is not a thrown GrammyError here.
        const response = await previous(method, payload, signal);
        if (!response.ok && response.error_code === 429) {
          const seconds = response.parameters?.retry_after;
          if (!seconds || seconds > 30 || attempt === 3 || Date.now() - start + seconds*1000 > 45000) return response;
          await getRedis().eval(COOLDOWN_SCRIPT, 1, prefix+'pause', String(seconds*1000));
          logger.warn('Telegram rate limit', { service:'bot', method, attempt, retryAfterSeconds:seconds });
          await abortableDelay(seconds*1000, signal); continue;
        }
        if (!response.ok && method === 'editMessageText' && response.description?.includes('message is not modified')) return { ok:true, result:true } as unknown as Awaited<ReturnType<typeof previous>>;
        return response;
      }
      throw new Error('Telegram retry limit exceeded');
    } finally { pending--; logger.debug('Telegram request completed', { service:'bot', method, durationMs:Date.now()-start }); }
  };
}
