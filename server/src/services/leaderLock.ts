import crypto from 'node:crypto';
import { getRedis, isRedisReady } from '../config/redis';
import { logger } from '../utils/logger';

export interface LeaderLockOptions {
  lockKey?: string;
  ttlMs?: number;
  heartbeatIntervalMs?: number;
  standbyCheckIntervalMs?: number;
}

export class DistributedLeaderLock {
  private readonly lockKey: string;
  private readonly ttlMs: number;
  private readonly heartbeatIntervalMs: number;
  private readonly standbyCheckIntervalMs: number;
  private readonly instanceId: string;
  private isLeader = false;
  private isRunning = false;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private standbyTimer: NodeJS.Timeout | null = null;
  private generation = 0;

  constructor(options?: LeaderLockOptions) {
    this.lockKey = options?.lockKey ?? 'pairtalk:bot:leader:lock';
    this.ttlMs = options?.ttlMs ?? 15000;
    this.heartbeatIntervalMs = options?.heartbeatIntervalMs ?? 5000;
    this.standbyCheckIntervalMs = options?.standbyCheckIntervalMs ?? 4000;
    this.instanceId = `node_${process.pid}_${crypto.randomUUID().slice(0, 8)}`;
  }

  public getInstanceId(): string {
    return this.instanceId;
  }

  public isCurrentLeader(): boolean {
    return this.isLeader;
  }

  public async acquire(): Promise<boolean> {
    try {
      if (!isRedisReady()) {
        logger.debug(`Redis not ready yet; deferring leader lock acquisition for [${this.lockKey}]`, {
          service: 'leaderLock',
          instanceId: this.instanceId,
        });
        return false;
      }
      const redis = getRedis();
      const res = await redis.set(this.lockKey, this.instanceId, 'PX', this.ttlMs, 'NX');
      if (res === 'OK') {
        this.isLeader = true;
        logger.info(`Leadership acquired for lock [${this.lockKey}] by instance [${this.instanceId}]`, {
          service: 'leaderLock',
          event: 'leadership_acquired',
          instanceId: this.instanceId,
          ttlMs: this.ttlMs,
        });
        return true;
      }
      return false;
    } catch (err: unknown) {
      logger.warn(`Failed attempting to acquire leader lock [${this.lockKey}]`, {
        service: 'leaderLock',
        event: 'acquire_error',
        instanceId: this.instanceId,
      }, err);
      return false;
    }
  }

  public async renew(): Promise<boolean> {
    if (!this.isLeader) return false;
    try {
      if (!isRedisReady()) { this.isLeader = false; return false; }
      const redis = getRedis();
      const script = `
        -- LOCK_RENEW
        if redis.call('GET', KEYS[1]) == ARGV[1] then
          return redis.call('PEXPIRE', KEYS[1], ARGV[2])
        else
          return 0
        end
      `;
      const res = await redis.eval(script, 1, this.lockKey, this.instanceId, String(this.ttlMs));
      if (Number(res) === 1) {
        return true;
      }
      this.isLeader = false;
      logger.warn(`Leadership lost during renewal for lock [${this.lockKey}] by instance [${this.instanceId}]`, {
        service: 'leaderLock',
        event: 'leadership_lost',
        instanceId: this.instanceId,
      });
      return false;
    } catch (err: unknown) {
      this.isLeader = false;
      logger.error(`Error renewing leader lock [${this.lockKey}]`, {
        service: 'leaderLock',
        event: 'renew_error',
        instanceId: this.instanceId,
      }, err);
      return false;
    }
  }

  public async release(): Promise<boolean> {
    if (!this.isLeader) return false;
    try {
      if (!isRedisReady()) {
        this.isLeader = false;
        this.stopTimers();
        return false;
      }
      const redis = getRedis();
      const script = `
        -- LOCK_RELEASE
        if redis.call('GET', KEYS[1]) == ARGV[1] then
          return redis.call('DEL', KEYS[1])
        else
          return 0
        end
      `;
      const res = await redis.eval(script, 1, this.lockKey, this.instanceId);
      this.isLeader = false;
      this.stopTimers();
      logger.info(`Leadership released for lock [${this.lockKey}] by instance [${this.instanceId}]`, {
        service: 'leaderLock',
        event: 'leadership_released',
        instanceId: this.instanceId,
      });
      return Number(res) === 1;
    } catch (err: unknown) {
      logger.error(`Error releasing leader lock [${this.lockKey}]`, {
        service: 'leaderLock',
        event: 'release_error',
        instanceId: this.instanceId,
      }, err);
      this.isLeader = false;
      this.stopTimers();
      return false;
    }
  }

  public startElection(callbacks: {
    onElected: () => Promise<void> | void;
    onLost?: () => Promise<void> | void;
  }): void {
    if (this.isRunning) return;
    this.isRunning = true;
    const generation = ++this.generation;
    let tenure = 0;
    const current = () => this.isRunning && this.generation === generation;
    const standby = () => {
      if (!current()) return;
      this.clearStandbyTimer();
      this.standbyTimer = setTimeout(() => void elect(), this.standbyCheckIntervalMs);
    };
    const lost = async () => {
      if (!current()) return;
      tenure++;
      this.clearHeartbeatTimer();
      this.isLeader = false;
      try { await callbacks.onLost?.(); }
      catch (error) { logger.error('Polling stop failed after leadership loss', { service: 'leaderLock' }, error); }
      standby();
    };
    const heartbeat = async () => {
      if (!current() || !this.isLeader) return;
      if (!await this.renew()) { await lost(); return; }
      if (current()) this.heartbeatTimer = setTimeout(() => void heartbeat(), this.heartbeatIntervalMs);
    };
    const elect = async () => {
      if (!current()) return;
      if (!await this.acquire()) { standby(); return; }
      if (!current()) { await this.release(); return; }
      const electedTenure = ++tenure;
      this.heartbeatTimer = setTimeout(() => void heartbeat(), this.heartbeatIntervalMs);
      // onElected may own a long-lived polling task. Renew while it runs.
      void Promise.resolve().then(callbacks.onElected).catch(async error => {
        logger.error('Polling startup failed', { service: 'leaderLock', event: 'on_elected_error' }, error);
        if (!current() || electedTenure !== tenure) return;
        tenure++;
        this.clearHeartbeatTimer();
        try { await callbacks.onLost?.(); } catch (stopError) { logger.error('Polling stop failed', {service:'leaderLock'}, stopError); }
        await this.release();
        // release cancels election timers; restart a fresh fenced election.
        this.startElection(callbacks);
      });
    };
    void elect();
  }

  private clearHeartbeatTimer(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private clearStandbyTimer(): void {
    if (this.standbyTimer) {
      clearTimeout(this.standbyTimer);
      this.standbyTimer = null;
    }
  }

  public stopTimers(): void {
    this.isRunning = false;
    this.generation++;
    this.clearHeartbeatTimer();
    this.clearStandbyTimer();
  }
}

export const botLeaderLock = new DistributedLeaderLock({
  lockKey: 'pairtalk:bot:' + crypto.createHash('sha256').update(process.env.BOT_TOKEN || 'test').digest('hex').slice(0, 24) + ':leader:lock',
  ttlMs: 15000,
  heartbeatIntervalMs: 5000,
  standbyCheckIntervalMs: 4000,
});
