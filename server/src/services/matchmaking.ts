import { getRedis, inMemoryRedis } from '../config/redis';

export interface UserSkills {
  subFC: number;
  subLR: number;
  subGRA: number;
  subP: number;
}

export function determineWeakAndStrongSkills(skills: UserSkills): { weakSkill: string; strongSkill: string } {
  const list = [
    { name: 'FC', score: skills.subFC },
    { name: 'LR', score: skills.subLR },
    { name: 'GRA', score: skills.subGRA },
    { name: 'P', score: skills.subP },
  ];
  list.sort((a, b) => a.score - b.score);
  
  const weakSkill = list[0].name;
  const strongSkill = list[list.length - 1].name;
  return { weakSkill, strongSkill };
}

export interface MatchResult {
  matched: boolean;
  partnerId?: string;
  roomName?: string;
  bucketKey?: string;
}

export class MatchmakingService {
  private get redis() {
    try {
      return getRedis();
    } catch {
      return inMemoryRedis;
    }
  }

  public getBandKey(band: number): string {
    const rounded = Math.round(band * 2) / 2;
    return rounded.toFixed(1);
  }

  public getBucketKey(band: number, weakSkill: string, strongSkill: string): string {
    const bandKey = this.getBandKey(band);
    return `match_queue:${bandKey}:${weakSkill}:${strongSkill}`;
  }

  /**
   * Joins matchmaking queue with $O(1)$ SPOP on complementary bucket
   */
  async joinQueue(userId: string, band: number, skills: UserSkills): Promise<MatchResult> {
    const { weakSkill, strongSkill } = determineWeakAndStrongSkills(skills);
    const bandKey = this.getBandKey(band);

    const complementaryKey = `match_queue:${bandKey}:${strongSkill}:${weakSkill}`;
    const ownBucketKey = `match_queue:${bandKey}:${weakSkill}:${strongSkill}`;

    // First ensure user is not already queued elsewhere
    await this.cancelQueue(userId);

    // Try popping a complementary partner (O(1))
    const partnerId = await this.redis.spop(complementaryKey);

    if (partnerId && partnerId !== userId) {
      // Complementary match found!
      await this.redis.del(`user_queue:${partnerId}`);
      await this.redis.del(`user_queue:${userId}`);
      return {
        matched: true,
        partnerId,
        roomName: `room_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      };
    }

    // No partner in complementary bucket, add self to own bucket (O(1))
    await this.redis.sadd(ownBucketKey, userId);
    await this.redis.set(`user_queue:${userId}`, ownBucketKey);

    return {
      matched: false,
      bucketKey: ownBucketKey,
    };
  }

  /**
   * Instant queue cancellation with O(1) SREM
   */
  async cancelQueue(userId: string): Promise<boolean> {
    const bucketKey = await this.redis.get(`user_queue:${userId}`);
    if (bucketKey) {
      await this.redis.srem(bucketKey, userId);
      await this.redis.del(`user_queue:${userId}`);
      return true;
    }
    return false;
  }
}

export const matchmakingService = new MatchmakingService();
