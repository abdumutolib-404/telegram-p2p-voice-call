import Redis from 'ioredis';
import { env } from './env';

class InMemoryRedisMock {
  private sets: Map<string, Set<string>> = new Map();
  private kv: Map<string, { value: string; expiresAt?: number }> = new Map();

  async sadd(key: string, ...members: string[]): Promise<number> {
    if (!this.sets.has(key)) {
      this.sets.set(key, new Set());
    }
    const set = this.sets.get(key)!;
    let added = 0;
    for (const m of members) {
      if (!set.has(m)) {
        set.add(m);
        added++;
      }
    }
    return added;
  }

  async spop(key: string): Promise<string | null> {
    const set = this.sets.get(key);
    if (!set || set.size === 0) return null;
    const item = Array.from(set)[0];
    set.delete(item);
    if (set.size === 0) {
      this.sets.delete(key);
    }
    return item;
  }

  async srem(key: string, ...members: string[]): Promise<number> {
    const set = this.sets.get(key);
    if (!set) return 0;
    let removed = 0;
    for (const m of members) {
      if (set.delete(m)) {
        removed++;
      }
    }
    if (set.size === 0) {
      this.sets.delete(key);
    }
    return removed;
  }

  async smembers(key: string): Promise<string[]> {
    const set = this.sets.get(key);
    return set ? Array.from(set) : [];
  }

  async get(key: string): Promise<string | null> {
    const entry = this.kv.get(key);
    if (!entry) return null;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.kv.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, mode?: string, duration?: number): Promise<'OK'> {
    let expiresAt: number | undefined;
    if (mode === 'EX' && duration) {
      expiresAt = Date.now() + duration * 1000;
    } else if (mode === 'PX' && duration) {
      expiresAt = Date.now() + duration;
    }
    this.kv.set(key, { value, expiresAt });
    return 'OK';
  }

  async del(...keys: string[]): Promise<number> {
    let count = 0;
    for (const key of keys) {
      if (this.kv.delete(key)) count++;
      if (this.sets.delete(key)) count++;
    }
    return count;
  }

  async flushall(): Promise<'OK'> {
    this.sets.clear();
    this.kv.clear();
    return 'OK';
  }

  on(event: string, callback: Function) {
    if (event === 'connect' || event === 'ready') {
      setTimeout(() => callback(), 10);
    }
    return this;
  }
}

export interface RedisClientInterface {
  sadd(key: string, ...members: string[]): Promise<number>;
  spop(key: string): Promise<string | null>;
  srem(key: string, ...members: string[]): Promise<number>;
  smembers(key: string): Promise<string[]>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode?: string, duration?: number): Promise<'OK'>;
  del(...keys: string[]): Promise<number>;
  flushall?(): Promise<'OK'>;
}

export const inMemoryRedis = new InMemoryRedisMock();

let isRealRedisReady = false;
let realRedisInstance: Redis | null = null;

if (process.env.NODE_ENV !== 'test') {
  try {
    realRedisInstance = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
      lazyConnect: true,
    });

    realRedisInstance.on('ready', () => {
      isRealRedisReady = true;
    });

    realRedisInstance.on('error', () => {
      isRealRedisReady = false;
    });
  } catch (e) {
    isRealRedisReady = false;
  }
}

export const getRedis = (): RedisClientInterface => {
  if (isRealRedisReady && realRedisInstance) {
    return realRedisInstance as unknown as RedisClientInterface;
  }
  return inMemoryRedis;
};
