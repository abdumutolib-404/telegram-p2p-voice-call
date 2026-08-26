import crypto from 'node:crypto';
import { getRedis, type RedisClientInterface } from '../config/redis';

export interface UserSkills {
  readonly subFC: number;
  readonly subLR: number;
  readonly subGRA: number;
  readonly subP: number;
}

export type SkillCode = 'FC' | 'LR' | 'GRA' | 'P';

export interface MatchOptions {
  readonly plan?: string;
  readonly warningCount?: number;
}

export interface MatchResult {
  readonly matched: boolean;
  readonly partnerId?: string;
  readonly roomName?: string;
  readonly bucketKey?: string;
  readonly partnerBucketKey?: string;
}

const USER_QUEUE_PREFIX = 'user_queue:';
const MATCH_QUEUE_PREFIX = 'match_queue:';
const QUEUE_TTL_SECONDS = 15 * 60;
const USER_LOCK_PREFIX = 'match_lock:';
const USER_LOCK_TTL_MS = 5000;

const MATCH_QUEUE_CLAIM_SCRIPT = `-- MATCH_QUEUE_CLAIM
local candidate = redis.call('SPOP', KEYS[1])
local scanned = 0
local max_scans = 50
while candidate and scanned < max_scans do
  scanned = scanned + 1
  if candidate ~= ARGV[1] then
    local pointer = redis.call('GET', KEYS[2] .. candidate)
    if pointer then
      redis.call('DEL', KEYS[2] .. candidate)
      redis.call('DEL', KEYS[2] .. ARGV[1])
      return candidate
    end
  end
  candidate = redis.call('SPOP', KEYS[1])
end
return false`;

const LOCK_RELEASE_SCRIPT = `-- LOCK_RELEASE
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0`;

const CANCEL_QUEUE_SCRIPT = `-- CANCEL_QUEUE
local bucket = redis.call('GET', KEYS[1])
if bucket then
  redis.call('SREM', bucket, ARGV[1])
  redis.call('DEL', KEYS[1])
  return 1
end
return 0`;

export function determineWeakAndStrongSkills(skills: UserSkills): { weakSkill: SkillCode; strongSkill: SkillCode } {
  const ranked: ReadonlyArray<readonly [SkillCode, number]> = [
    ['FC', skills.subFC],
    ['LR', skills.subLR],
    ['GRA', skills.subGRA],
    ['P', skills.subP],
  ];

  for (const [, value] of ranked) {
    if (!Number.isFinite(value) || value < 0 || value > 9) {
      throw new RangeError('Skill scores must be finite values between 0 and 9');
    }
  }

  const sorted = [...ranked].sort((a, b) => a[1] - b[1]);
  return {
    weakSkill: sorted[0][0],
    strongSkill: sorted[sorted.length - 1][0],
  };
}

export class MatchmakingService {
  private get redis(): RedisClientInterface {
    return getRedis();
  }

  public getBandKey(band: number): string {
    if (!Number.isFinite(band) || band < 0 || band > 9) {
      throw new RangeError('band must be a finite number between 0 and 9');
    }
    return (Math.round(band * 2) / 2).toFixed(1);
  }

  public getBucketKey(band: number, weakSkill: SkillCode, strongSkill: SkillCode): string {
    return `${MATCH_QUEUE_PREFIX}${this.getBandKey(band)}:${weakSkill}:${strongSkill}`;
  }

  public getBandPoolKey(band: number): string {
    return `${MATCH_QUEUE_PREFIX}band:${this.getBandKey(band)}`;
  }

  public getPriorityPoolKey(tier: string): string {
    return `${MATCH_QUEUE_PREFIX}priority:${tier.toUpperCase()}`;
  }

  public getGlobalPoolKey(): string {
    return `${MATCH_QUEUE_PREFIX}global`;
  }

  public async joinQueue(
    userId: string,
    band: number,
    skills: UserSkills,
    options?: MatchOptions
  ): Promise<MatchResult> {
    this.validateUserId(userId);
    return this.withUserLock(userId, async () => {
      const { weakSkill, strongSkill } = determineWeakAndStrongSkills(skills);
      const ownBucketKey = this.getBucketKey(band, weakSkill, strongSkill);
      const bandPoolKey = this.getBandPoolKey(band);
      const globalPoolKey = this.getGlobalPoolKey();

      const userPlan = (options?.plan || 'FREE').toUpperCase();
      const warningCount = options?.warningCount ?? 0;
      const isPriorityUser = userPlan === 'BOSS' || userPlan === 'PRO' || userPlan === 'PLUS';

      // Progressive Search Priority Rings:
      // 1. Boss / Pro / Plus priority candidate pools
      // 2. Exact complementary skill match at same band (e.g. 7.0:P:FC)
      // 3. Same skill match at same band (e.g. 7.0:FC:P)
      // 4. Same band general pool
      // 5. Adjacent ±0.5 band general pools
      const candidateBuckets: string[] = [
        this.getPriorityPoolKey('BOSS'),
        this.getPriorityPoolKey('PRO'),
        this.getPriorityPoolKey('PLUS'),
        this.getBucketKey(band, strongSkill, weakSkill),
        ownBucketKey,
        bandPoolKey,
      ];

      const deltas = [0.5, -0.5];
      for (const delta of deltas) {
        const targetBand = band + delta;
        if (targetBand >= 4.0 && targetBand <= 9.0) {
          candidateBuckets.push(this.getBandPoolKey(targetBand));
        }
      }

      try {
        await this.cancelQueueUnlocked(userId);

        // Scan candidate buckets in priority order
        for (const bucketKey of candidateBuckets) {
          const claimedPartner = await this.redis.eval(
            MATCH_QUEUE_CLAIM_SCRIPT,
            2,
            bucketKey,
            USER_QUEUE_PREFIX,
            userId
          );

          if (typeof claimedPartner === 'string' && claimedPartner !== userId) {
            // Clean up partner from auxiliary pools
            await Promise.allSettled([
              this.redis.srem(bandPoolKey, claimedPartner),
              this.redis.srem(this.getPriorityPoolKey('BOSS'), claimedPartner),
              this.redis.srem(this.getPriorityPoolKey('PRO'), claimedPartner),
              this.redis.srem(this.getPriorityPoolKey('PLUS'), claimedPartner),
            ]);

            return {
              matched: true,
              partnerId: claimedPartner,
              roomName: `room_${crypto.randomUUID()}`,
              partnerBucketKey: bucketKey,
            };
          }
        }

        // No partner online yet: Register user into priority and standard pools
        const poolsToRegister: string[] = [ownBucketKey, bandPoolKey];
        if (isPriorityUser) {
          poolsToRegister.push(this.getPriorityPoolKey(userPlan));
        }

        try {
          await Promise.all(poolsToRegister.map((k) => this.redis.sadd(k, userId)));
          await Promise.all(poolsToRegister.map((k) => this.redis.expire(k, QUEUE_TTL_SECONDS * 2)));
          await this.redis.set(`${USER_QUEUE_PREFIX}${userId}`, ownBucketKey, 'EX', QUEUE_TTL_SECONDS);
        } catch (error: unknown) {
          await Promise.allSettled(poolsToRegister.map((k) => this.redis.srem(k, userId)));
          throw error;
        }

        return { matched: false, bucketKey: ownBucketKey };
      } catch (error: unknown) {
        console.error('[Matchmaking] join_failed', {
          userId,
          error: error instanceof Error ? error.message : 'unknown_error',
        });
        throw error;
      }
    });
  }

  public async restoreQueue(userId: string, bucketKey: string): Promise<void> {
    this.validateUserId(userId);
    if (!bucketKey.startsWith(MATCH_QUEUE_PREFIX)) throw new TypeError('Invalid queue bucket');

    return this.withUserLock(userId, async () => {
      try {
        const globalPoolKey = this.getGlobalPoolKey();
        await Promise.all([
          this.redis.sadd(bucketKey, userId),
          this.redis.sadd(globalPoolKey, userId),
        ]);
        await Promise.all([
          this.redis.expire(bucketKey, QUEUE_TTL_SECONDS * 2),
          this.redis.expire(globalPoolKey, QUEUE_TTL_SECONDS * 2),
          this.redis.set(`${USER_QUEUE_PREFIX}${userId}`, bucketKey, 'EX', QUEUE_TTL_SECONDS),
        ]);
      } catch (error: unknown) {
        console.error('[Matchmaking] restore_failed', {
          userId,
          error: error instanceof Error ? error.message : 'unknown_error',
        });
        throw error;
      }
    });
  }

  public async cancelQueue(userId: string): Promise<boolean> {
    this.validateUserId(userId);
    return this.withUserLock(userId, async () => {
      try {
        return await this.cancelQueueUnlocked(userId);
      } catch (error: unknown) {
        console.error('[Matchmaking] cancel_failed', {
          userId,
          error: error instanceof Error ? error.message : 'unknown_error',
        });
        throw error;
      }
    });
  }

  private async cancelQueueUnlocked(userId: string): Promise<boolean> {
    const pointerKey = `${USER_QUEUE_PREFIX}${userId}`;
    const result = await this.redis.eval(CANCEL_QUEUE_SCRIPT, 1, pointerKey, userId);
    await Promise.allSettled([
      this.redis.srem(this.getGlobalPoolKey(), userId),
      this.redis.srem(this.getPriorityPoolKey('BOSS'), userId),
      this.redis.srem(this.getPriorityPoolKey('PRO'), userId),
      this.redis.srem(this.getPriorityPoolKey('PLUS'), userId),
    ]);
    return result === 1;
  }

  private async withUserLock<T>(userId: string, operation: () => Promise<T>): Promise<T> {
    const lockKey = `${USER_LOCK_PREFIX}${userId}`;
    const token = crypto.randomUUID();
    const deadline = Date.now() + USER_LOCK_TTL_MS;

    while (Date.now() < deadline) {
      const acquired = await this.redis.set(lockKey, token, 'PX', USER_LOCK_TTL_MS, 'NX');
      if (acquired === 'OK') {
        try {
          return await operation();
        } finally {
          try {
            await this.redis.eval(LOCK_RELEASE_SCRIPT, 1, lockKey, token);
          } catch (error: unknown) {
            console.error('[Matchmaking] lock_release_failed', {
              userId,
              error: error instanceof Error ? error.message : 'unknown_error',
            });
          }
        }
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 25));
    }

    throw new Error('Unable to acquire matchmaking lock');
  }

  private validateUserId(userId: string): void {
    if (!userId || userId.length > 128) throw new TypeError('Invalid userId');
  }
}

export const matchmakingService = new MatchmakingService();
