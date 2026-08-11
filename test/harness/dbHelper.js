/**
 * test/harness/dbHelper.js
 * Database mock/memory store & Redis bucket queue helper for tests.
 */

let uuidv4;
try {
  uuidv4 = require('uuid').v4;
} catch (_) {
  uuidv4 = () => `uuid_${Math.random().toString(36).substring(2, 11)}`;
}


/**
 * Plan duration limits (in minutes)
 */
const DEFAULT_PLAN_LIMITS = {
  FREE: { maxDuration: 10, dailyLimit: 3, retentionDays: 1, starsPrice: 0 },
  PLUS: { maxDuration: 20, dailyLimit: 10, retentionDays: 7, starsPrice: 250 },
  PRO:  { maxDuration: 30, dailyLimit: 999, retentionDays: 30, starsPrice: 500 }
};

/**
 * In-memory database store
 */
class MemoryDatabase {
  constructor() {
    this.reset();
  }

  reset() {
    this.users = new Map();
    this.callSessions = new Map();
    this.callRatings = new Map();
    this.unblockAppeals = new Map();
    this.starsTransactions = new Map();
    this.favoritePartners = new Map();
    this.planLimits = JSON.parse(JSON.stringify(DEFAULT_PLAN_LIMITS));

    // Redis mock structures
    this.redisBuckets = new Map(); // queueKey -> Array<userPayload>
    this.redisActiveCallLocks = new Map(); // userId -> { roomName, expiresAt }
    this.redisAdminTokens = new Map(); // token -> { telegramId, expiresAt }
  }

  // --- USER HELPERS ---

  seedUser(overrides = {}) {
    const id = overrides.id || `usr_${Math.random().toString(36).substring(2, 9)}`;
    const telegramId = overrides.telegramId || String(Math.floor(100000000 + Math.random() * 900000000));
    const alias = overrides.alias || `IELTS_Partner_${Math.floor(1000 + Math.random() * 9000)}`;

    const user = {
      id,
      telegramId: String(telegramId),
      alias,
      band: overrides.band !== undefined ? overrides.band : 6.5,
      subscores: overrides.subscores || { FC: 6.5, LR: 6.5, GRA: 6.5, P: 6.5 },
      plan: overrides.plan || 'FREE',
      dnd: overrides.dnd || false,
      warningCount: overrides.warningCount || 0,
      isBanned: overrides.isBanned || false,
      bannedUntil: overrides.bannedUntil || null,
      isPermanentBanned: overrides.isPermanentBanned || false,
      createdAt: overrides.createdAt || new Date(),
      updatedAt: overrides.updatedAt || new Date()
    };

    this.users.set(id, user);
    return { ...user };
  }

  getUserById(id) {
    const user = this.users.get(id);
    return user ? { ...user } : null;
  }

  getUserByTelegramId(telegramId) {
    for (const user of this.users.values()) {
      if (String(user.telegramId) === String(telegramId)) {
        return { ...user };
      }
    }
    return null;
  }

  getUserByAlias(alias) {
    for (const user of this.users.values()) {
      if (user.alias === alias) {
        return { ...user };
      }
    }
    return null;
  }

  updateUser(id, updates) {
    const user = this.users.get(id);
    if (!user) return null;
    const updated = { ...user, ...updates, updatedAt: new Date() };
    this.users.set(id, updated);
    return { ...updated };
  }

  // --- CALL SESSION HELPERS ---

  seedCallSession(overrides = {}) {
    const id = overrides.id || `call_${Math.random().toString(36).substring(2, 9)}`;
    const roomName = overrides.roomName || `room_${Math.random().toString(36).substring(2, 9)}`;
    const callerId = overrides.callerId || `usr_caller`;
    const calleeId = overrides.calleeId || `usr_callee`;

    const caller = this.getUserById(callerId);
    const callee = this.getUserById(calleeId);

    const higherPlanTier = overrides.higherPlanTier || resolveHigherPlanTier(
      caller ? caller.plan : 'FREE',
      callee ? callee.plan : 'FREE'
    );

    const maxDurationMinutes = overrides.maxDurationMinutes || 
      this.planLimits[higherPlanTier].maxDuration;

    const startedAt = overrides.startedAt || new Date();

    const session = {
      id,
      roomName,
      callerId,
      calleeId,
      higherPlanTier,
      maxDurationMinutes,
      startedAt,
      endedAt: overrides.endedAt || null,
      status: overrides.status || 'ACTIVE',
      egressId: overrides.egressId || null,
      recordingPath: overrides.recordingPath || null,
      recordingExpiresAt: overrides.recordingExpiresAt || null,
      createdAt: startedAt
    };

    this.callSessions.set(id, session);
    return { ...session };
  }

  getCallSession(idOrRoom) {
    if (this.callSessions.has(idOrRoom)) {
      return { ...this.callSessions.get(idOrRoom) };
    }
    for (const session of this.callSessions.values()) {
      if (session.roomName === idOrRoom) {
        return { ...session };
      }
    }
    return null;
  }

  updateCallSession(id, updates) {
    const session = this.callSessions.get(id);
    if (!session) return null;
    const updated = { ...session, ...updates };
    this.callSessions.set(id, updated);
    return { ...updated };
  }

  // --- CALL RATING & REPORT HELPERS ---

  seedCallRating(overrides = {}) {
    const id = overrides.id || `rate_${Math.random().toString(36).substring(2, 9)}`;
    const rating = {
      id,
      callSessionId: overrides.callSessionId,
      reviewerId: overrides.reviewerId,
      targetUserId: overrides.targetUserId,
      rating: overrides.rating !== undefined ? overrides.rating : 5,
      reported: overrides.reported || false,
      reportReason: overrides.reportReason || null,
      createdAt: overrides.createdAt || new Date()
    };

    this.callRatings.set(id, rating);

    // Trigger moderation penalty if reported
    if (rating.reported && rating.targetUserId) {
      this.applyModerationPenalty(rating.targetUserId, rating.reportReason);
    }

    return { ...rating };
  }

  // --- MODERATION PENALTY LADDER ---

  applyModerationPenalty(userId, reason = 'Bad behavior reported') {
    const user = this.users.get(userId);
    if (!user) return null;

    const warningCount = user.warningCount + 1;
    let updates = { warningCount };

    if (warningCount === 1) {
      // 1st report: Warning
      updates.warningNotice = reason;
    } else if (warningCount === 2) {
      // 2nd report: 6-hour ban
      updates.isBanned = true;
      updates.bannedUntil = new Date(Date.now() + 6 * 3600 * 1000);
    } else if (warningCount >= 3) {
      // 3rd report: Permanent ban
      updates.isBanned = true;
      updates.isPermanentBanned = true;
      updates.bannedUntil = null;
    }

    return this.updateUser(userId, updates);
  }

  // --- UNBLOCK APPEAL HELPERS ---

  seedUnblockAppeal(overrides = {}) {
    const id = overrides.id || `appeal_${Math.random().toString(36).substring(2, 9)}`;
    const appeal = {
      id,
      userId: overrides.userId,
      telegramId: String(overrides.telegramId),
      appealText: overrides.appealText || 'Please unblock me',
      status: overrides.status || 'PENDING',
      reviewedAt: overrides.reviewedAt || null,
      createdAt: overrides.createdAt || new Date()
    };

    this.unblockAppeals.set(id, appeal);
    return { ...appeal };
  }

  getPendingAppeals() {
    const pending = [];
    for (const appeal of this.unblockAppeals.values()) {
      if (appeal.status === 'PENDING') {
        const user = this.getUserById(appeal.userId);
        pending.push({
          ...appeal,
          alias: user ? user.alias : 'Unknown',
          subscores: user ? user.subscores : null
        });
      }
    }
    return pending;
  }

  resolveAppeal(appealId, status) {
    const appeal = this.unblockAppeals.get(appealId);
    if (!appeal) return null;

    const updated = {
      ...appeal,
      status,
      reviewedAt: new Date()
    };
    this.unblockAppeals.set(appealId, updated);

    // If approved, unblock the user
    if (status === 'APPROVED' && appeal.userId) {
      this.updateUser(appeal.userId, {
        isBanned: false,
        isPermanentBanned: false,
        bannedUntil: null,
        warningCount: 0
      });
    }

    return { ...updated };
  }

  // --- STARS TRANSACTIONS ---

  seedStarsTransaction(overrides = {}) {
    const id = overrides.id || `tx_${Math.random().toString(36).substring(2, 9)}`;
    const tx = {
      id,
      telegramId: String(overrides.telegramId),
      planTier: overrides.planTier || 'PLUS',
      starsAmount: overrides.starsAmount || 250,
      telegramPaymentChargeId: overrides.telegramPaymentChargeId || `tg_charge_${Date.now()}`,
      providerPaymentChargeId: overrides.providerPaymentChargeId || `prov_charge_${Date.now()}`,
      createdAt: overrides.createdAt || new Date()
    };

    this.starsTransactions.set(id, tx);

    // Also upgrade target user's plan
    const user = this.getUserByTelegramId(tx.telegramId);
    if (user) {
      this.updateUser(user.id, { plan: tx.planTier });
    }

    return { ...tx };
  }

  // --- STATS OVERVIEW ---

  getStats() {
    const totalUsers = this.users.size;
    let activeCalls = 0;
    for (const session of this.callSessions.values()) {
      if (session.status === 'ACTIVE') activeCalls++;
    }

    let totalStars = 0;
    for (const tx of this.starsTransactions.values()) {
      totalStars += tx.starsAmount;
    }

    return {
      totalUsers,
      mau: Math.ceil(totalUsers * 0.8), // simulated MAU
      dau: Math.ceil(totalUsers * 0.3), // simulated DAU
      activeCalls,
      starsRevenue: {
        totalStars,
        totalUsd: Number((totalStars * 0.013).toFixed(2)), // Approx Telegram Stars value
        monthlyHistory: [
          { month: '2026-08', stars: totalStars, usd: Number((totalStars * 0.013).toFixed(2)) }
        ]
      }
    };
  }

  // --- REDIS BUCKET MATCHMAKING QUEUE MOCK ---

  getQueueKey(band, weakSkill, strongSkill) {
    return `match_queue:${band}:${weakSkill}:${strongSkill}`;
  }

  getComplementaryQueueKey(band, weakSkill, strongSkill) {
    return `match_queue:${band}:${strongSkill}:${weakSkill}`;
  }

  pushToQueue(band, weakSkill, strongSkill, userPayload) {
    const key = this.getQueueKey(band, weakSkill, strongSkill);
    if (!this.redisBuckets.has(key)) {
      this.redisBuckets.set(key, []);
    }
    const queue = this.redisBuckets.get(key);
    // Remove if already in queue
    const filtered = queue.filter(item => item.userId !== userPayload.userId);
    filtered.push({ ...userPayload, joinedAt: Date.now() });
    this.redisBuckets.set(key, filtered);
    return key;
  }

  popComplementaryMatch(band, weakSkill, strongSkill) {
    const compKey = this.getComplementaryQueueKey(band, weakSkill, strongSkill);
    const queue = this.redisBuckets.get(compKey);
    if (queue && queue.length > 0) {
      const matchedUser = queue.shift();
      return matchedUser;
    }
    return null;
  }

  removeFromQueue(userId) {
    let removed = false;
    for (const [key, queue] of this.redisBuckets.entries()) {
      const initialLen = queue.length;
      const filtered = queue.filter(item => item.userId !== userId);
      if (filtered.length < initialLen) {
        this.redisBuckets.set(key, filtered);
        removed = true;
      }
    }
    return removed;
  }

  clearQueue() {
    this.redisBuckets.clear();
  }

  // --- REDIS ACTIVE CALL LOCK & ADMIN TOKEN MOCK ---

  setActiveCallLock(userId, roomName, ttlSeconds = 1800) {
    this.redisActiveCallLocks.set(userId, {
      roomName,
      expiresAt: Date.now() + ttlSeconds * 1000
    });
  }

  hasActiveCallLock(userId) {
    const lock = this.redisActiveCallLocks.get(userId);
    if (!lock) return false;
    if (Date.now() > lock.expiresAt) {
      this.redisActiveCallLocks.delete(userId);
      return false;
    }
    return true;
  }

  clearActiveCallLock(userId) {
    this.redisActiveCallLocks.delete(userId);
  }

  setAdmin2FAToken(token, telegramId, ttlSeconds = 300) {
    this.redisAdminTokens.set(token, {
      telegramId: String(telegramId),
      expiresAt: Date.now() + ttlSeconds * 1000
    });
  }

  getAdmin2FAToken(token) {
    const tokenData = this.redisAdminTokens.get(token);
    if (!tokenData) return null;
    if (Date.now() > tokenData.expiresAt) {
      this.redisAdminTokens.delete(token);
      return null;
    }
    return tokenData;
  }

  consumeAdmin2FAToken(token) {
    const data = this.getAdmin2FAToken(token);
    if (data) {
      this.redisAdminTokens.delete(token);
    }
    return data;
  }

  // --- STORAGE PURGE CRON SIMULATION ---

  purgeExpiredRecordings(nowDate = new Date()) {
    let purgedCount = 0;
    const purgedSessionIds = [];

    for (const session of this.callSessions.values()) {
      if (session.recordingPath && session.recordingExpiresAt) {
        const expires = new Date(session.recordingExpiresAt);
        if (expires <= nowDate) {
          session.recordingPath = null;
          session.purgedAt = nowDate;
          purgedCount++;
          purgedSessionIds.push(session.id);
        }
      }
    }

    return { purgedCount, purgedSessionIds };
  }
}

/**
 * Resolves higher plan tier between two participating users in a call.
 * @param {string} planA - 'FREE' | 'PLUS' | 'PRO'
 * @param {string} planB - 'FREE' | 'PLUS' | 'PRO'
 * @returns {string} Higher plan tier
 */
function resolveHigherPlanTier(planA = 'FREE', planB = 'FREE') {
  const tierRank = { FREE: 1, PLUS: 2, PRO: 3 };
  const rankA = tierRank[planA.toUpperCase()] || 1;
  const rankB = tierRank[planB.toUpperCase()] || 1;
  return rankA >= rankB ? planA.toUpperCase() : planB.toUpperCase();
}

/**
 * Resolves mixed-plan call duration limit based on higher participant plan.
 * @param {string} planA
 * @param {string} planB
 * @param {object} [customLimits]
 * @returns {number} Duration limit in minutes
 */
function resolveMixedPlanDuration(planA = 'FREE', planB = 'FREE', customLimits = DEFAULT_PLAN_LIMITS) {
  const higherTier = resolveHigherPlanTier(planA, planB);
  return customLimits[higherTier] ? customLimits[higherTier].maxDuration : 10;
}

// Global db instance for shared harness access
const db = new MemoryDatabase();

module.exports = {
  MemoryDatabase,
  db,
  DEFAULT_PLAN_LIMITS,
  resolveHigherPlanTier,
  resolveMixedPlanDuration
};
