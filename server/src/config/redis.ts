import Redis from 'ioredis';
import { env } from './env';
import { logger } from '../utils/logger';

class InMemoryRedisMock {
  private readonly sets = new Map<string, Set<string>>();
  private readonly kv = new Map<string, { value: string; expiresAt?: number }>();

  async sadd(key: string, ...members: string[]): Promise<number> {
    const set = this.sets.get(key) ?? new Set<string>();
    this.sets.set(key, set);
    let added = 0;
    for (const member of members) {
      if (!set.has(member)) {
        set.add(member);
        added += 1;
      }
    }
    return added;
  }

  async sismember(key: string, member: string): Promise<number> {
    const set = this.sets.get(key);
    return set && set.has(member) ? 1 : 0;
  }

  async spop(key: string): Promise<string | null> {
    const set = this.sets.get(key);
    if (!set || set.size === 0) return null;
    const value = set.values().next().value;
    if (typeof value !== 'string') return null;
    set.delete(value);
    if (set.size === 0) this.sets.delete(key);
    return value;
  }

  async srem(key: string, ...members: string[]): Promise<number> {
    const set = this.sets.get(key);
    if (!set) return 0;
    let removed = 0;
    for (const member of members) {
      if (set.delete(member)) removed += 1;
    }
    if (set.size === 0) this.sets.delete(key);
    return removed;
  }

  async smembers(key: string): Promise<string[]> {
    return [...(this.sets.get(key) ?? new Set<string>())];
  }

  async get(key: string): Promise<string | null> {
    const entry = this.kv.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== undefined && Date.now() >= entry.expiresAt) {
      this.kv.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(
    key: string,
    value: string,
    mode?: 'EX' | 'PX',
    duration?: number,
    condition?: 'NX',
  ): Promise<string | null> {
    if (condition === 'NX' && (await this.get(key)) !== null) return null;

    let expiresAt: number | undefined;
    if (mode === 'EX' && duration !== undefined) expiresAt = Date.now() + duration * 1000;
    if (mode === 'PX' && duration !== undefined) expiresAt = Date.now() + duration;
    this.kv.set(key, { value, expiresAt });
    return 'OK';
  }

  async del(...keys: string[]): Promise<number> {
    let count = 0;
    for (const key of keys) {
      if (this.kv.delete(key)) count += 1;
      if (this.sets.delete(key)) count += 1;
    }
    return count;
  }

  async eval(script: string, numberOfKeys: number, ...keyArgs: string[]): Promise<any> {
    const keys = keyArgs.slice(0, numberOfKeys);
    const args = keyArgs.slice(numberOfKeys);
    // This mock implements the atomic primitives used by production matchmaking, admin tokens, and locks.
    if (script.includes('MATCH_QUEUE_MULTI_CLAIM')) {
      const pointerPrefix = args[0];
      const selfId = args[1];

      for (const bucketKey of keys) {
        const set = this.sets.get(bucketKey);
        if (!set) continue;

        for (const candidate of [...set]) {
          if (candidate === selfId) {
            set.delete(candidate);
            continue;
          }
          const entry = this.kv.get(`${pointerPrefix}${candidate}`);
          const pointer = entry && (entry.expiresAt === undefined || Date.now() < entry.expiresAt) ? entry.value : null;
          if (!pointer) {
            set.delete(candidate);
            for (const p of ['match_queue:priority:BOSS', 'match_queue:priority:PRO', 'match_queue:priority:PLUS', 'match_queue:global']) {
              const ps = this.sets.get(p);
              if (ps) {
                ps.delete(candidate);
                if (ps.size === 0) this.sets.delete(p);
              }
            }
            continue;
          }

          set.delete(candidate);
          if (set.size === 0) this.sets.delete(bucketKey);
          this.kv.delete(`${pointerPrefix}${candidate}`);
          this.kv.delete(`${pointerPrefix}${selfId}`);

          // Remove candidate from ALL registered sets
          // 1. Candidate's own bucket
          const ownSet = this.sets.get(pointer);
          if (ownSet) {
            ownSet.delete(candidate);
            if (ownSet.size === 0) this.sets.delete(pointer);
          }

          // 2. Candidate's band pool
          const bandMatch = pointer.match(/^match_queue:([^:]+):/);
          if (bandMatch) {
            const bandKey = `match_queue:band:${bandMatch[1]}`;
            const bandSet = this.sets.get(bandKey);
            if (bandSet) {
              bandSet.delete(candidate);
              if (bandSet.size === 0) this.sets.delete(bandKey);
            }
          }

          // 3. All band brackets
          const allBands = ['4.0', '4.5', '5.0', '5.5', '6.0', '6.5', '7.0', '7.5', '8.0', '8.5', '9.0'];
          for (const b of allBands) {
            const bs = this.sets.get(`match_queue:band:${b}`);
            if (bs) {
              bs.delete(candidate);
              if (bs.size === 0) this.sets.delete(`match_queue:band:${b}`);
            }
          }

          // 4. Priority pools & global
          const auxPools = [
            'match_queue:priority:BOSS',
            'match_queue:priority:PRO',
            'match_queue:priority:PLUS',
            'match_queue:global',
          ];
          for (const pool of auxPools) {
            const pSet = this.sets.get(pool);
            if (pSet) {
              pSet.delete(candidate);
              if (pSet.size === 0) this.sets.delete(pool);
            }
          }

          // 5. All candidate bucket keys
          for (const k of keys) {
            const kSet = this.sets.get(k);
            if (kSet) {
              kSet.delete(candidate);
              if (kSet.size === 0) this.sets.delete(k);
            }
          }

          return [candidate, bucketKey];
        }
        if (set.size === 0) this.sets.delete(bucketKey);
      }
      return null;
    }

    if (script.includes('MATCH_QUEUE_CLAIM')) {
      const bucketKey = keys[0];
      const pointerPrefix = keys[1];
      const selfId = args[0];
      const set = this.sets.get(bucketKey);
      if (!set) return null;

      for (const candidate of [...set]) {
        if (candidate === selfId) {
          set.delete(candidate);
          continue;
        }
        const entry = this.kv.get(`${pointerPrefix}${candidate}`);
        const pointer = entry && (entry.expiresAt === undefined || Date.now() < entry.expiresAt) ? entry.value : null;
        if (!pointer) {
          set.delete(candidate);
          continue;
        }
        set.delete(candidate);
        this.kv.delete(`${pointerPrefix}${candidate}`);
        this.kv.delete(`${pointerPrefix}${selfId}`);
        if (set.size === 0) this.sets.delete(bucketKey);
        return candidate;
      }
      if (set.size === 0) this.sets.delete(bucketKey);
      return null;
    }

    if (script.includes('CANCEL_QUEUE')) {
      const pointerKey = keys[0];
      const userId = args[0];
      const entry = this.kv.get(pointerKey);
      if (entry && (entry.expiresAt === undefined || Date.now() < entry.expiresAt)) {
        const bucket = entry.value;
        const set = this.sets.get(bucket);
        if (set) {
          set.delete(userId);
          if (set.size === 0) this.sets.delete(bucket);
        }
        this.kv.delete(pointerKey);
        return 1;
      }
      return 0;
    }

    if (script.includes('ADMIN_TOKEN_CONSUME')) {
      const key = keys[0];
      const entry = this.kv.get(key);
      if (entry) {
        if (entry.expiresAt !== undefined && Date.now() >= entry.expiresAt) {
          this.kv.delete(key);
          return null;
        }
        this.kv.delete(key);
        return entry.value;
      }
      return null;
    }

    if (script.includes('LOCK_RELEASE') || script.includes('ARGV[1] then return redis.call(\'DEL\', KEYS[1])')) {
      const key = keys[0];
      const expected = args[0];
      const entry = this.kv.get(key);
      if (entry && entry.value === expected) {
        this.kv.delete(key);
        return 1;
      }
      return 0;
    }

    if (script.includes('LOCK_RENEW') || script.includes('ARGV[1] then return redis.call(\'PEXPIRE\', KEYS[1]')) {
      const key = keys[0];
      const expected = args[0];
      const ttlMs = Number(args[1]) || 15000;
      const entry = this.kv.get(key);
      if (entry && entry.value === expected) {
        entry.expiresAt = Date.now() + ttlMs;
        return 1;
      }
      return 0;
    }

    if (script.includes('VERIFY_OTP') || script.includes('otpHash') || script.includes('maxAttempts')) {
      const key = keys[0];
      const providedOtpHash = args[0];
      const now = Number(args[1]) || Date.now();
      const entry = this.kv.get(key);
      if (!entry) {
        return JSON.stringify({ status: 'NOT_FOUND' });
      }
      if (entry.expiresAt !== undefined && now >= entry.expiresAt) {
        this.kv.delete(key);
        return JSON.stringify({ status: 'EXPIRED' });
      }
      const challenge = JSON.parse(entry.value);
      if (challenge.expiresAt !== undefined && now >= challenge.expiresAt) {
        this.kv.delete(key);
        return JSON.stringify({ status: 'EXPIRED' });
      }
      if (challenge.consumed) {
        return JSON.stringify({ status: 'CONSUMED' });
      }
      if (challenge.attempts >= challenge.maxAttempts) {
        this.kv.delete(key);
        return JSON.stringify({ status: 'MAX_ATTEMPTS' });
      }
      challenge.attempts += 1;
      if (challenge.otpHash === providedOtpHash) {
        this.kv.delete(key);
        return JSON.stringify({ status: 'SUCCESS', attempts: challenge.attempts });
      }
      if (challenge.attempts >= challenge.maxAttempts) {
        this.kv.delete(key);
        return JSON.stringify({ status: 'MAX_ATTEMPTS_REACHED', attempts: challenge.attempts, remaining: 0 });
      }
      entry.value = JSON.stringify(challenge);
      return JSON.stringify({
        status: 'INVALID_OTP',
        attempts: challenge.attempts,
        remaining: challenge.maxAttempts - challenge.attempts,
      });
    }

    throw new Error('Unsupported in-memory Redis script');
  }

  async expire(key: string, seconds: number): Promise<number> {
    const entry = this.kv.get(key);
    if (entry) {
      entry.expiresAt = Date.now() + seconds * 1000;
      return 1;
    }
    if (this.sets.has(key)) {
      return 1;
    }
    return 0;
  }

  async incr(key: string): Promise<number> {
    const current = this.kv.get(key);
    let val = 0;
    if (current && (current.expiresAt === undefined || Date.now() < current.expiresAt)) {
      val = parseInt(current.value, 10) || 0;
    }
    val += 1;
    this.kv.set(key, { value: val.toString(), expiresAt: current?.expiresAt });
    return val;
  }

  async ttl(key: string): Promise<number> {
    const entry = this.kv.get(key);
    if (!entry) return -2;
    if (entry.expiresAt === undefined) return -1;
    const now = Date.now();
    if (now >= entry.expiresAt) {
      this.kv.delete(key);
      return -2;
    }
    return Math.ceil((entry.expiresAt - now) / 1000);
  }

  async exists(...keys: string[]): Promise<number> {
    let count = 0;
    const now = Date.now();
    for (const key of keys) {
      const entry = this.kv.get(key);
      if (entry) {
        if (entry.expiresAt !== undefined && now >= entry.expiresAt) {
          this.kv.delete(key);
        } else {
          count += 1;
          continue;
        }
      }
      if (this.sets.has(key)) count += 1;
    }
    return count;
  }

  async keys(pattern: string): Promise<string[]> {
    const allKeys = new Set([...this.kv.keys(), ...this.sets.keys()]);
    if (pattern === '*' || !pattern) return [...allKeys];
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    return [...allKeys].filter((k) => regex.test(k));
  }

  async scard(key: string): Promise<number> {
    const set = this.sets.get(key);
    return set ? set.size : 0;
  }

  async flushall(): Promise<'OK'> {
    this.sets.clear();
    this.kv.clear();
    return 'OK';
  }
}

export interface RedisClientInterface {
  sadd(key: string, ...members: string[]): Promise<number>;
  sismember(key: string, member: string): Promise<number>;
  spop(key: string): Promise<string | null>;
  srem(key: string, ...members: string[]): Promise<number>;
  smembers(key: string): Promise<string[]>;
  scard(key: string): Promise<number>;
  get(key: string): Promise<string | null>;
  set(
    key: string,
    value: string,
    mode?: 'EX' | 'PX',
    duration?: number,
    condition?: 'NX',
  ): Promise<string | null>;
  ttl(key: string): Promise<number>;
  exists(...keys: string[]): Promise<number>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  del(...keys: string[]): Promise<number>;
  keys(pattern: string): Promise<string[]>;
  eval(script: string, numberOfKeys: number, ...keyArgs: string[]): Promise<any>;
  flushall?(): Promise<'OK'>;
}

export const inMemoryRedis: RedisClientInterface = new InMemoryRedisMock();

let realRedisInstance: Redis | null = null;
let isRealRedisReady = false;

if (env.NODE_ENV !== 'test') {
  realRedisInstance = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 1,
    retryStrategy: (times) => Math.min(times * 150, 3000),
    lazyConnect: true,
  });

  realRedisInstance.on('ready', () => {
    isRealRedisReady = true;
    logger.info('Redis connection ready', {
      service: 'redis',
      event: 'redis_ready',
    });
  });
  realRedisInstance.on('end', () => {
    isRealRedisReady = false;
  });
  realRedisInstance.on('error', (error: Error) => {
    isRealRedisReady = false;
    logger.error('Redis connection error', {
      service: 'redis',
      event: 'redis_connection_error',
    }, error);
  });

  void realRedisInstance.connect().catch((error: unknown) => {
    isRealRedisReady = false;
    logger.error('Redis initial connection failed', {
      service: 'redis',
      event: 'redis_connect_failed',
    }, error);
  });
}

export let pubClient: Redis | null = null;
export let subClient: Redis | null = null;

if (env.NODE_ENV !== 'test' && realRedisInstance) {
  pubClient = realRedisInstance.duplicate();
  subClient = realRedisInstance.duplicate();

  pubClient.on('error', (error: Error) => {
    logger.error('Redis pubClient error', {
      service: 'redis',
      event: 'redis_pub_error',
    }, error);
  });

  subClient.on('error', (error: Error) => {
    logger.error('Redis subClient error', {
      service: 'redis',
      event: 'redis_sub_error',
    }, error);
  });
}

export function createRedisDuplicates(): { pubClient: Redis; subClient: Redis } | null {
  if (pubClient && subClient) {
    return { pubClient, subClient };
  }
  if (!realRedisInstance) return null;
  return {
    pubClient: realRedisInstance.duplicate(),
    subClient: realRedisInstance.duplicate(),
  };
}

export const getRedisDuplicates = createRedisDuplicates;

export function createRedisSubscriber(): Redis | null {
  if (env.NODE_ENV === 'test' || !realRedisInstance) return null;
  const client = realRedisInstance.duplicate();
  client.on('error', (error: Error) => {
    logger.error('Redis event subscriber client error', {
      service: 'redis',
      event: 'redis_event_sub_error',
    }, error);
  });
  return client;
}

export async function publishGatewayCommand(command: Record<string, unknown>): Promise<void> {
  if (env.NODE_ENV === 'test' || !pubClient) return;
  try {
    const payload = JSON.stringify(command);
    await pubClient.publish('pairtalk:commands', payload);
  } catch (err: unknown) {
    logger.warn('Failed to publish command to Go gateway', {
      service: 'redis',
      event: 'publish_command_failed',
    }, err);
  }
}

export function isRedisReady(): boolean {
  if (env.NODE_ENV === 'test') return true;
  if (env.NODE_ENV === 'development') return true;
  return Boolean(realRedisInstance && isRealRedisReady);
}

export async function connectRedis(timeoutMs = 15000): Promise<boolean> {
  if (env.NODE_ENV === 'test') return true;
  if (!realRedisInstance) return false;
  if (pubClient && pubClient.status === 'wait') {
    void pubClient.connect().catch(() => undefined);
  }
  if (subClient && subClient.status === 'wait') {
    void subClient.connect().catch(() => undefined);
  }
  if (isRealRedisReady) return true;

  return new Promise<boolean>((resolve) => {
    if (isRealRedisReady) {
      resolve(true);
      return;
    }

    let resolved = false;
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        logger.warn('Redis initial connection wait timed out, continuing startup with degraded lock...', {
          service: 'redis',
          event: 'redis_connect_timeout',
        });
        resolve(false);
      }
    }, timeoutMs);

    realRedisInstance.once('ready', () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        resolve(true);
      }
    });
  });
}

export function getRedis(): RedisClientInterface {
  if (env.NODE_ENV === 'test') return inMemoryRedis;
  if (env.NODE_ENV === 'development' && !isRealRedisReady) return inMemoryRedis;
  if (!realRedisInstance || !isRealRedisReady) {
    throw new Error('Redis is not ready');
  }
  return realRedisInstance as unknown as RedisClientInterface;
}
