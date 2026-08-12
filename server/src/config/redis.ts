import Redis from 'ioredis';
import { env } from './env';

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

  async eval(script: string, numberOfKeys: number, ...keyArgs: string[]): Promise<string | number | null> {
    const keys = keyArgs.slice(0, numberOfKeys);
    const args = keyArgs.slice(numberOfKeys);
    // This mock implements the atomic primitives used by production matchmaking, admin tokens, and locks.
    if (script.includes('MATCH_QUEUE_CLAIM')) {
      const bucketKey = keys[0];
      const pointerPrefix = keys[1];
      const selfId = args[0];
      const set = this.sets.get(bucketKey);
      if (!set) return null;

      for (const candidate of [...set]) {
        if (candidate === selfId) continue;
        const entry = this.kv.get(`${pointerPrefix}${candidate}`);
        const pointer = entry ? entry.value : null;
        if (pointer !== bucketKey) {
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

    if (script.includes('LOCK_RELEASE')) {
      const key = keys[0];
      const expected = args[0];
      const entry = this.kv.get(key);
      if (entry && entry.value === expected) {
        this.kv.delete(key);
        return 1;
      }
      return 0;
    }

    throw new Error('Unsupported in-memory Redis script');
  }

  async flushall(): Promise<'OK'> {
    this.sets.clear();
    this.kv.clear();
    return 'OK';
  }
}

export interface RedisClientInterface {
  sadd(key: string, ...members: string[]): Promise<number>;
  spop(key: string): Promise<string | null>;
  srem(key: string, ...members: string[]): Promise<number>;
  smembers(key: string): Promise<string[]>;
  get(key: string): Promise<string | null>;
  set(
    key: string,
    value: string,
    mode?: 'EX' | 'PX',
    duration?: number,
    condition?: 'NX',
  ): Promise<string | null>;
  del(...keys: string[]): Promise<number>;
  eval(script: string, numberOfKeys: number, ...keyArgs: string[]): Promise<string | number | null>;
  flushall?(): Promise<'OK'>;
}

export const inMemoryRedis: RedisClientInterface = new InMemoryRedisMock();

let realRedisInstance: Redis | null = null;
let isRealRedisReady = false;

if (env.NODE_ENV !== 'test') {
  realRedisInstance = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
    lazyConnect: true,
  });

  realRedisInstance.on('ready', () => {
    isRealRedisReady = true;
  });
  realRedisInstance.on('end', () => {
    isRealRedisReady = false;
  });
  realRedisInstance.on('error', (error: Error) => {
    isRealRedisReady = false;
    console.error('[Redis] connection_error', { error: error.message });
  });

  void realRedisInstance.connect().catch((error: unknown) => {
    isRealRedisReady = false;
    console.error('[Redis] connection_failed', {
      error: error instanceof Error ? error.message : 'unknown_error',
    });
  });
}

export function getRedis(): RedisClientInterface {
  if (env.NODE_ENV === 'test') return inMemoryRedis;
  if (env.NODE_ENV === 'development' && !isRealRedisReady) return inMemoryRedis;
  if (!realRedisInstance || !isRealRedisReady) {
    throw new Error('Redis is not ready');
  }
  return realRedisInstance;
}
