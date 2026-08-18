import crypto from 'node:crypto';

type IdSelector = { id?: string; telegramId?: bigint | string | number; alias?: string };
type DateFilter = { gte?: Date | string; lte?: Date | string; not?: string | null };
type UserWhere = {
  id?: string | { in: string[] };
  telegramId?: bigint | string | number;
  alias?: string;
  plan?: string | { not?: string; in?: string[] };
  subscriptionExpiresAt?: Date | string | null | { lte?: Date | string; gt?: Date | string; gte?: Date | string; not?: null };
  updatedAt?: DateFilter;
  lastCallDate?: string | null | { not?: string };
  dailyCallsUsed?: { lt?: number; gt?: number };
  OR?: UserWhere[];
  isBanned?: boolean;
  isPermanentlyBanned?: boolean;
  warningCount?: { gt?: number };
};
type UserData = Record<string, unknown>;
type CallSessionWhere = {
  id?: string;
  roomName?: string;
  userAId?: string;
  userBId?: string;
  recordedByUserId?: string | null | { contains?: string };
  status?: string | { in?: string[] };
  egressId?: string | null;
  recordingUrl?: string | null | { not?: null };
  recordingExpiresAt?: Date | null | { lte?: Date; gt?: Date };
  createdAt?: Date | { lte?: Date; gte?: Date };
  OR?: Array<CallSessionWhere>;
};
type CallSessionData = Record<string, unknown>;
type RatingWhere = { callId?: string; raterId?: string; ratedId?: string; reported?: boolean };
type AppealWhere = { id?: string };
type FavoriteWhere = { userId?: string; partnerId?: string };

interface UserRow {
  id: string;
  telegramId: bigint;
  alias: string;
  subFC: number;
  subLR: number;
  subGRA: number;
  subP: number;
  band: number;
  plan: string;
  subscriptionStatus: string;
  subscriptionExpiresAt: Date | null;
  customPlanName?: string | null;
  maxDuration: number;
  dailyLimit: number;
  dailyCallsUsed: number;
  retentionOverride?: number | null;
  lastCallDate: string | null;
  warningCount: number;
  isBanned: boolean;
  bannedUntil: Date | null;
  isPermanentlyBanned: boolean;
  dnd: boolean;
  onboarded: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface CallSessionRow {
  id: string;
  roomName: string;
  userAId: string;
  userBId: string;
  status: string;
  egressId: string | null;
  recordingUrl: string | null;
  recordingExpiresAt: Date | null;
  recordedByUserId: string | null;
  duration: number;
  createdAt: Date;
  endedAt: Date | null;
}

interface CallRatingRow {
  id: string;
  callId: string;
  raterId: string;
  ratedId: string;
  stars: number;
  feedback: string | null;
  reported: boolean;
  createdAt: Date;
}

interface AppealRow {
  id: string;
  userId: string;
  telegramId: bigint;
  alias: string;
  banReason: string;
  appealText: string;
  status: string;
  createdAt: Date;
  reviewedAt: Date | null;
}

interface StarsTransactionRow {
  id: string;
  orderNumber?: string | null;
  userId: string;
  telegramPaymentId: string;
  starsAmount: number;
  planTier: string;
  status: string;
  refundReason: string | null;
  refundedAt: Date | null;
  createdAt: Date;
}

interface ManualPaymentRequestRow {
  id: string;
  orderNumber: string;
  userId: string;
  telegramId: bigint;
  alias: string;
  plan: string;
  uzsAmount: number;
  paymentProof: string | null;
  status: string;
  adminNote: string | null;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
}

interface AuditLogRow {
  id: string;
  action: string;
  targetId: string | null;
  adminId: string;
  beforeState: string | null;
  afterState: string | null;
  reason: string | null;
  createdAt: Date;
}

interface FavoriteRow {
  id: string;
  userId: string;
  partnerId: string;
  createdAt: Date;
}

function recordOf(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function dateValue(value: unknown, fallback: Date): Date {
  return value instanceof Date ? value : typeof value === 'string' ? new Date(value) : fallback;
}

function applyIncrement(current: number, value: unknown): number {
  const record = recordOf(value);
  if (typeof record.increment === 'number') return current + record.increment;
  if (typeof record.decrement === 'number') return current - record.decrement;
  return numberValue(value, current);
}

function safeJson(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => typeof item === 'bigint' ? item.toString() : item);
}

export class InMemoryPrismaMock {
  private readonly users = new Map<string, UserRow>();
  private readonly callSessions = new Map<string, CallSessionRow>();
  private readonly callRatings = new Map<string, CallRatingRow>();
  private readonly unblockAppeals = new Map<string, AppealRow>();
  private readonly starsTransactions = new Map<string, StarsTransactionRow>();
  private readonly manualPaymentRequests = new Map<string, ManualPaymentRequestRow>();
  private readonly auditLogs = new Map<string, AuditLogRow>();
  private readonly favoritePartners = new Map<string, FavoriteRow>();

  private txQueue: Promise<unknown> = Promise.resolve();

  async $connect(): Promise<void> {}
  async $disconnect(): Promise<void> {}

  async $transaction<T>(operation: ((tx: InMemoryPrismaMock) => Promise<T>) | Array<Promise<unknown>>): Promise<T> {
    if (Array.isArray(operation)) {
      return (await Promise.all(operation)) as unknown as T;
    }
    const run = async () => {
      return await operation(this);
    };
    const next = this.txQueue.then(run, run);
    this.txQueue = next;
    return (await next) as T;
  }

  user = {
    create: async (args: { data: UserData }): Promise<UserRow> => {
      const id = stringValue(args.data.id, crypto.randomUUID());
      const now = new Date();
      const row: UserRow = {
        id,
        telegramId: args.data.telegramId === undefined ? 0n : BigInt(String(args.data.telegramId)),
        alias: stringValue(args.data.alias, `P2P-Partner-${Math.floor(1000 + Math.random() * 9000)}`),
        subFC: numberValue(args.data.subFC, 6),
        subLR: numberValue(args.data.subLR, 6),
        subGRA: numberValue(args.data.subGRA, 6),
        subP: numberValue(args.data.subP, 6),
        band: numberValue(args.data.band, 6),
        plan: stringValue(args.data.plan, 'FREE'),
        subscriptionStatus: stringValue(args.data.subscriptionStatus, 'NONE'),
        subscriptionExpiresAt: args.data.subscriptionExpiresAt ? dateValue(args.data.subscriptionExpiresAt, now) : null,
        customPlanName: args.data.customPlanName ? String(args.data.customPlanName) : null,
        maxDuration: numberValue(args.data.maxDuration, 15),
        dailyLimit: numberValue(args.data.dailyLimit, 3),
        dailyCallsUsed: numberValue(args.data.dailyCallsUsed, 0),
        retentionOverride: args.data.retentionOverride ? Number(args.data.retentionOverride) : null,
        lastCallDate: args.data.lastCallDate == null ? null : stringValue(args.data.lastCallDate),
        warningCount: numberValue(args.data.warningCount, 0),
        isBanned: booleanValue(args.data.isBanned, false),
        bannedUntil: args.data.bannedUntil ? dateValue(args.data.bannedUntil, now) : null,
        isPermanentlyBanned: booleanValue(args.data.isPermanentlyBanned, false),
        dnd: booleanValue(args.data.dnd, false),
        onboarded: booleanValue(args.data.onboarded, false),
        createdAt: dateValue(args.data.createdAt, now),
        updatedAt: dateValue(args.data.updatedAt, now),
      };
      this.users.set(id, row);
      return { ...row };
    },

    upsert: async (args: { where: IdSelector; update: UserData; create: UserData }): Promise<UserRow> => {
      const existing = this.findUser(args.where);
      if (existing) {
        const updated = this.mergeUser(existing, args.update);
        this.users.set(existing.id, updated);
        return { ...updated };
      }
      return this.user.create({ data: args.create });
    },

    findUnique: async (args: { where: IdSelector }): Promise<UserRow | null> => {
      const user = this.findUser(args.where);
      return user ? { ...user } : null;
    },

    findFirst: async (args?: { where?: UserWhere; select?: Record<string, boolean> }): Promise<UserRow | null> => {
      const list = [...this.users.values()].filter((user) => this.matchesUser(user, args?.where));
      return list.length > 0 ? { ...list[0] } : null;
    },

    findMany: async (args?: { where?: UserWhere; orderBy?: { createdAt?: 'asc' | 'desc' }; take?: number }): Promise<UserRow[]> => {
      let list = [...this.users.values()].filter((user) => this.matchesUser(user, args?.where));
      if (args?.orderBy?.createdAt === 'desc') list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      if (args?.orderBy?.createdAt === 'asc') list.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      if (args?.take !== undefined) list = list.slice(0, args.take);
      return list.map((user) => ({ ...user }));
    },

    update: async (args: { where: IdSelector; data: UserData }): Promise<UserRow> => {
      const user = this.findUser(args.where);
      if (!user) throw new Error(`User not found for update: ${safeJson(args.where)}`);
      const updated = this.mergeUser(user, args.data);
      this.users.set(user.id, updated);
      return { ...updated };
    },

    updateMany: async (args: { where?: UserWhere; data: UserData }): Promise<{ count: number }> => {
      let count = 0;
      for (const [id, user] of this.users) {
        if (!this.matchesUser(user, args.where)) continue;
        const updated = this.mergeUser(user, args.data);
        this.users.set(id, updated);
        count += 1;
      }
      return { count };
    },

    count: async (args?: { where?: UserWhere }): Promise<number> => [...this.users.values()].filter((user) => this.matchesUser(user, args?.where)).length,

    deleteMany: async (args?: { where?: UserWhere }): Promise<{ count: number }> => {
      if (!args?.where) {
        const count = this.users.size;
        this.users.clear();
        return { count };
      }
      let count = 0;
      for (const [id, user] of this.users) {
        if (this.matchesUser(user, args.where)) {
          this.users.delete(id);
          count += 1;
        }
      }
      return { count };
    },
  };

  callSession = {
    create: async (args: { data: CallSessionData }): Promise<CallSessionRow> => {
      const id = stringValue(args.data.id, crypto.randomUUID());
      const now = new Date();
      const row: CallSessionRow = {
        id,
        roomName: stringValue(args.data.roomName, `room_${id}`),
        userAId: stringValue(args.data.userAId),
        userBId: stringValue(args.data.userBId),
        status: stringValue(args.data.status, 'ACTIVE'),
        egressId: args.data.egressId ? stringValue(args.data.egressId) : null,
        recordingUrl: args.data.recordingUrl ? stringValue(args.data.recordingUrl) : null,
        recordingExpiresAt: args.data.recordingExpiresAt ? dateValue(args.data.recordingExpiresAt, now) : null,
        recordedByUserId: args.data.recordedByUserId ? stringValue(args.data.recordedByUserId) : null,
        duration: numberValue(args.data.duration, 0),
        createdAt: dateValue(args.data.createdAt, now),
        endedAt: args.data.endedAt ? dateValue(args.data.endedAt, now) : null,
      };
      this.callSessions.set(id, row);
      return { ...row };
    },

    findUnique: async (args: { where: { id?: string; roomName?: string }; include?: { userA?: boolean; userB?: boolean; ratings?: boolean } }): Promise<any> => {
      let session: CallSessionRow | undefined;
      if (args.where.id) session = this.callSessions.get(args.where.id);
      if (!session && args.where.roomName) {
        session = [...this.callSessions.values()].find((row) => row.roomName === args.where.roomName);
      }
      if (!session) return null;
      return {
        ...session,
        ...(args.include?.userA ? { userA: this.users.get(session.userAId) } : {}),
        ...(args.include?.userB ? { userB: this.users.get(session.userBId) } : {}),
        ...(args.include?.ratings ? { ratings: [...this.callRatings.values()].filter((r) => r.callId === session!.id) } : {}),
      };
    },

    findFirst: async (args?: { where?: CallSessionWhere; orderBy?: { createdAt?: 'asc' | 'desc' }; include?: { userA?: boolean; userB?: boolean } }): Promise<any> => {
      const list = [...this.callSessions.values()].filter((session) => this.matchesCallSession(session, args?.where));
      if (args?.orderBy?.createdAt === 'desc') list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      if (list.length === 0) return null;
      const session = list[0];
      return {
        ...session,
        ...(args?.include?.userA ? { userA: this.users.get(session.userAId) } : {}),
        ...(args?.include?.userB ? { userB: this.users.get(session.userBId) } : {}),
      };
    },

    findMany: async (args?: { where?: CallSessionWhere; orderBy?: { createdAt?: 'asc' | 'desc' }; take?: number; include?: { userA?: boolean; userB?: boolean; ratings?: boolean } }): Promise<any[]> => {
      let list = [...this.callSessions.values()].filter((session) => this.matchesCallSession(session, args?.where));
      if (args?.orderBy?.createdAt === 'desc') list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      if (args?.take !== undefined) list = list.slice(0, args.take);
      return list.map((session) => ({
        ...session,
        ...(args?.include?.userA ? { userA: this.users.get(session.userAId) } : {}),
        ...(args?.include?.userB ? { userB: this.users.get(session.userBId) } : {}),
        ...(args?.include?.ratings ? { ratings: [...this.callRatings.values()].filter((r) => r.callId === session.id) } : {}),
      }));
    },

    update: async (args: { where: { id?: string; roomName?: string }; data: CallSessionData }): Promise<CallSessionRow> => {
      let session: CallSessionRow | undefined;
      if (args.where.id) session = this.callSessions.get(args.where.id);
      if (!session && args.where.roomName) {
        session = [...this.callSessions.values()].find((row) => row.roomName === args.where.roomName);
      }
      if (!session) throw new Error(`CallSession not found for update: ${safeJson(args.where)}`);
      const updated = this.mergeCallSession(session, args.data);
      this.callSessions.set(session.id, updated);
      return { ...updated };
    },

    updateMany: async (args: { where?: CallSessionWhere; data: CallSessionData }): Promise<{ count: number }> => {
      let count = 0;
      for (const [id, session] of this.callSessions) {
        if (!this.matchesCallSession(session, args.where)) continue;
        const updated = this.mergeCallSession(session, args.data);
        this.callSessions.set(id, updated);
        count += 1;
      }
      return { count };
    },

    count: async (args?: { where?: CallSessionWhere }): Promise<number> => [...this.callSessions.values()].filter((session) => this.matchesCallSession(session, args?.where)).length,

    deleteMany: async (args?: { where?: CallSessionWhere }): Promise<{ count: number }> => {
      if (!args?.where) {
        const count = this.callSessions.size;
        this.callSessions.clear();
        return { count };
      }
      let count = 0;
      for (const [id, session] of this.callSessions) {
        if (this.matchesCallSession(session, args.where)) {
          this.callSessions.delete(id);
          count += 1;
        }
      }
      return { count };
    },
  };

  callRating = {
    create: async (args: { data: Record<string, unknown> }): Promise<CallRatingRow> => {
      const id = stringValue(args.data.id, crypto.randomUUID());
      const row: CallRatingRow = {
        id,
        callId: stringValue(args.data.callId),
        raterId: stringValue(args.data.raterId),
        ratedId: stringValue(args.data.ratedId),
        stars: numberValue(args.data.stars, 5),
        feedback: args.data.feedback ? stringValue(args.data.feedback) : null,
        reported: booleanValue(args.data.reported, false),
        createdAt: new Date(),
      };
      this.callRatings.set(id, row);
      return { ...row };
    },
    findFirst: async (args?: { where?: RatingWhere }): Promise<CallRatingRow | null> => {
      for (const rating of this.callRatings.values()) {
        if (args?.where?.callId && rating.callId !== args.where.callId) continue;
        if (args?.where?.raterId && rating.raterId !== args.where.raterId) continue;
        if (args?.where?.ratedId && rating.ratedId !== args.where.ratedId) continue;
        if (args?.where?.reported !== undefined && rating.reported !== args.where.reported) continue;
        return { ...rating };
      }
      return null;
    },
    findMany: async (args?: { where?: RatingWhere }): Promise<CallRatingRow[]> => {
      return [...this.callRatings.values()].filter((rating) => {
        if (args?.where?.callId && rating.callId !== args.where.callId) return false;
        if (args?.where?.raterId && rating.raterId !== args.where.raterId) return false;
        if (args?.where?.ratedId && rating.ratedId !== args.where.ratedId) return false;
        if (args?.where?.reported !== undefined && rating.reported !== args.where.reported) return false;
        return true;
      }).map((row) => ({ ...row }));
    },
    count: async (args?: { where?: RatingWhere }): Promise<number> => {
      return (await this.callRating.findMany(args)).length;
    },
    deleteMany: async (args?: { where?: RatingWhere }): Promise<{ count: number }> => {
      if (!args?.where) {
        const count = this.callRatings.size;
        this.callRatings.clear();
        return { count };
      }
      let count = 0;
      for (const [id, rating] of this.callRatings) {
        if (args.where.callId && rating.callId !== args.where.callId) continue;
        if (args.where.raterId && rating.raterId !== args.where.raterId) continue;
        if (args.where.ratedId && rating.ratedId !== args.where.ratedId) continue;
        if (args.where.reported !== undefined && rating.reported !== args.where.reported) continue;
        this.callRatings.delete(id);
        count += 1;
      }
      return { count };
    },
  };

  unblockAppeal = {
    create: async (args: { data: Record<string, unknown> }): Promise<AppealRow> => {
      const id = stringValue(args.data.id, crypto.randomUUID());
      const row: AppealRow = {
        id,
        userId: stringValue(args.data.userId),
        telegramId: args.data.telegramId === undefined ? 0n : BigInt(String(args.data.telegramId)),
        alias: stringValue(args.data.alias),
        banReason: stringValue(args.data.banReason),
        appealText: stringValue(args.data.appealText),
        status: stringValue(args.data.status, 'PENDING'),
        createdAt: new Date(),
        reviewedAt: null,
      };
      this.unblockAppeals.set(id, row);
      return { ...row };
    },
    findMany: async (args?: { where?: { status?: string }; orderBy?: { createdAt?: 'asc' | 'desc' }; include?: { user?: boolean } }): Promise<Array<AppealRow & { user?: UserRow }>> => {
      let list = [...this.unblockAppeals.values()];
      if (args?.where?.status) list = list.filter((appeal) => appeal.status === args.where!.status);
      if (args?.orderBy?.createdAt === 'desc') list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return list.map((appeal) => ({ ...appeal, ...(args?.include?.user ? { user: this.users.get(appeal.userId) } : {}) }));
    },
    findFirst: async (args?: { where?: { userId?: string; status?: string } }): Promise<AppealRow | null> => {
      for (const appeal of this.unblockAppeals.values()) {
        if (args?.where?.userId && appeal.userId !== args.where.userId) continue;
        if (args?.where?.status && appeal.status !== args.where.status) continue;
        return { ...appeal };
      }
      return null;
    },
    findUnique: async (args: { where: AppealWhere }): Promise<AppealRow | null> => this.unblockAppeals.get(args.where.id ?? '') ?? null,
    update: async (args: { where: AppealWhere; data: Record<string, unknown> }): Promise<AppealRow> => {
      const appeal = this.unblockAppeals.get(args.where.id ?? '');
      if (!appeal) throw new Error(`Appeal not found: ${args.where.id}`);
      const updated = { ...appeal, ...args.data } as AppealRow;
      this.unblockAppeals.set(appeal.id, updated);
      return { ...updated };
    },
    updateMany: async (args: { where: { id?: string; status?: string }; data: Record<string, unknown> }): Promise<{ count: number }> => {
      let count = 0;
      for (const [id, appeal] of this.unblockAppeals) {
        if (args.where.id && id !== args.where.id) continue;
        if (args.where.status && appeal.status !== args.where.status) continue;
        const updated = { ...appeal, ...args.data } as AppealRow;
        this.unblockAppeals.set(id, updated);
        count += 1;
      }
      return { count };
    },
    count: async (args?: { where?: { userId?: string; status?: string } }): Promise<number> => {
      let c = 0;
      for (const appeal of this.unblockAppeals.values()) {
        if (args?.where?.userId && appeal.userId !== args.where.userId) continue;
        if (args?.where?.status && appeal.status !== args.where.status) continue;
        c += 1;
      }
      return c;
    },
    deleteMany: async (args?: { where?: { userId?: string | { in: string[] }; id?: string } }): Promise<{ count: number }> => {
      if (!args?.where) {
        const count = this.unblockAppeals.size;
        this.unblockAppeals.clear();
        return { count };
      }
      let count = 0;
      for (const [id, appeal] of this.unblockAppeals) {
        if (args.where.id && id !== args.where.id) continue;
        if (args.where.userId) {
          if (typeof args.where.userId === 'string' && appeal.userId !== args.where.userId) continue;
          if (typeof args.where.userId === 'object' && 'in' in args.where.userId && !args.where.userId.in.includes(appeal.userId)) continue;
        }
        this.unblockAppeals.delete(id);
        count += 1;
      }
      return { count };
    },
  };

  starsTransaction = {
    create: async (args: { data: Record<string, unknown> }): Promise<StarsTransactionRow> => {
      const id = stringValue(args.data.id, crypto.randomUUID());
      const telegramPaymentId = stringValue(args.data.telegramPaymentId);
      for (const existing of this.starsTransactions.values()) {
        if (existing.telegramPaymentId === telegramPaymentId) {
          throw new Error('Unique constraint failed on the fields: (`telegramPaymentId`)');
        }
      }
      const row: StarsTransactionRow = {
        id,
        orderNumber: args.data.orderNumber ? stringValue(args.data.orderNumber) : null,
        userId: stringValue(args.data.userId),
        telegramPaymentId,
        starsAmount: numberValue(args.data.starsAmount, 0),
        planTier: stringValue(args.data.planTier),
        status: stringValue(args.data.status, 'PAID'),
        refundReason: args.data.refundReason ? stringValue(args.data.refundReason) : null,
        refundedAt: args.data.refundedAt ? dateValue(args.data.refundedAt, new Date()) : null,
        createdAt: new Date(),
      };
      this.starsTransactions.set(id, row);
      return { ...row };
    },
    findUnique: async (args: { where: { telegramPaymentId?: string; id?: string }; include?: { user?: boolean } }): Promise<any> => {
      let found: StarsTransactionRow | undefined;
      if (args.where.id) found = this.starsTransactions.get(args.where.id);
      if (!found && args.where.telegramPaymentId) {
        for (const row of this.starsTransactions.values()) {
          if (row.telegramPaymentId === args.where.telegramPaymentId) {
            found = row;
            break;
          }
        }
      }
      if (!found) return null;
      return {
        ...found,
        ...(args.include?.user ? { user: this.users.get(found.userId) } : {}),
      };
    },
    findMany: async (args?: { where?: { userId?: string; status?: string }; orderBy?: { createdAt?: 'asc' | 'desc' }; include?: { user?: boolean } }): Promise<any[]> => {
      let list = [...this.starsTransactions.values()];
      if (args?.where?.userId) list = list.filter((tx) => tx.userId === args.where!.userId);
      if (args?.where?.status) list = list.filter((tx) => tx.status === args.where!.status);
      if (args?.orderBy?.createdAt === 'desc') list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return list.map((row) => ({
        ...row,
        ...(args?.include?.user ? { user: this.users.get(row.userId) } : {}),
      }));
    },
    update: async (args: { where: { id: string }; data: Record<string, unknown> }): Promise<StarsTransactionRow> => {
      const existing = this.starsTransactions.get(args.where.id);
      if (!existing) throw new Error(`StarsTransaction not found: ${args.where.id}`);
      const updated = { ...existing, ...args.data } as StarsTransactionRow;
      this.starsTransactions.set(existing.id, updated);
      return { ...updated };
    },
  };

  manualPaymentRequest = {
    create: async (args: { data: Record<string, unknown> }): Promise<ManualPaymentRequestRow> => {
      const id = stringValue(args.data.id, crypto.randomUUID());
      const now = new Date();
      const row: ManualPaymentRequestRow = {
        id,
        orderNumber: stringValue(args.data.orderNumber, 'A0'),
        userId: stringValue(args.data.userId),
        telegramId: args.data.telegramId === undefined ? 0n : BigInt(String(args.data.telegramId)),
        alias: stringValue(args.data.alias),
        plan: stringValue(args.data.plan, 'PLUS'),
        uzsAmount: numberValue(args.data.uzsAmount, 0),
        paymentProof: args.data.paymentProof ? stringValue(args.data.paymentProof) : null,
        status: stringValue(args.data.status, 'PENDING'),
        adminNote: args.data.adminNote ? stringValue(args.data.adminNote) : null,
        reviewedBy: args.data.reviewedBy ? stringValue(args.data.reviewedBy) : null,
        reviewedAt: args.data.reviewedAt ? dateValue(args.data.reviewedAt, now) : null,
        createdAt: now,
      };
      this.manualPaymentRequests.set(id, row);
      return { ...row };
    },
    findUnique: async (args: { where: { id: string }; include?: { user?: boolean } }): Promise<any> => {
      const row = this.manualPaymentRequests.get(args.where.id);
      if (!row) return null;
      return {
        ...row,
        ...(args.include?.user ? { user: this.users.get(row.userId) } : {}),
      };
    },
    findFirst: async (args?: { where?: { userId?: string; status?: string } }): Promise<ManualPaymentRequestRow | null> => {
      for (const row of this.manualPaymentRequests.values()) {
        if (args?.where?.userId && row.userId !== args.where.userId) continue;
        if (args?.where?.status && row.status !== args.where.status) continue;
        return { ...row };
      }
      return null;
    },
    findMany: async (args?: { where?: { userId?: string; status?: string }; orderBy?: { createdAt?: 'asc' | 'desc' }; include?: { user?: boolean } }): Promise<any[]> => {
      let list = [...this.manualPaymentRequests.values()];
      if (args?.where?.userId) list = list.filter((r) => r.userId === args.where!.userId);
      if (args?.where?.status) list = list.filter((r) => r.status === args.where!.status);
      if (args?.orderBy?.createdAt === 'desc') list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return list.map((r) => ({
        ...r,
        ...(args?.include?.user ? { user: this.users.get(r.userId) } : {}),
      }));
    },
    update: async (args: { where: { id: string }; data: Record<string, unknown> }): Promise<ManualPaymentRequestRow> => {
      const item = this.manualPaymentRequests.get(args.where.id);
      if (!item) throw new Error(`ManualPaymentRequest not found: ${args.where.id}`);
      const updated = { ...item, ...args.data } as ManualPaymentRequestRow;
      this.manualPaymentRequests.set(item.id, updated);
      return { ...updated };
    },
    updateMany: async (args: { where: { id?: string; telegramId?: bigint; status?: string }; data: Record<string, unknown> }): Promise<{ count: number }> => {
      let count = 0;
      for (const [id, req] of this.manualPaymentRequests) {
        if (args.where.id && id !== args.where.id) continue;
        if (args.where.telegramId !== undefined && req.telegramId !== args.where.telegramId) continue;
        if (args.where.status && req.status !== args.where.status) continue;
        const updated = { ...req, ...args.data } as ManualPaymentRequestRow;
        this.manualPaymentRequests.set(id, updated);
        count += 1;
      }
      return { count };
    },
    count: async (args?: { where?: { userId?: string; status?: string } }): Promise<number> => {
      let c = 0;
      for (const r of this.manualPaymentRequests.values()) {
        if (args?.where?.userId && r.userId !== args.where.userId) continue;
        if (args?.where?.status && r.status !== args.where.status) continue;
        c += 1;
      }
      return c;
    },
    deleteMany: async (args?: { where?: { userId?: string; id?: string } }): Promise<{ count: number }> => {
      if (!args?.where) {
        const count = this.manualPaymentRequests.size;
        this.manualPaymentRequests.clear();
        return { count };
      }
      let count = 0;
      for (const [id, r] of this.manualPaymentRequests) {
        if (args.where.id && id !== args.where.id) continue;
        if (args.where.userId && r.userId !== args.where.userId) continue;
        this.manualPaymentRequests.delete(id);
        count += 1;
      }
      return { count };
    },
  };

  auditLog = {
    create: async (args: { data: Record<string, unknown> }): Promise<AuditLogRow> => {
      const id = stringValue(args.data.id, crypto.randomUUID());
      const row: AuditLogRow = {
        id,
        action: stringValue(args.data.action),
        targetId: args.data.targetId ? stringValue(args.data.targetId) : null,
        adminId: stringValue(args.data.adminId),
        beforeState: args.data.beforeState ? stringValue(args.data.beforeState) : null,
        afterState: args.data.afterState ? stringValue(args.data.afterState) : null,
        reason: args.data.reason ? stringValue(args.data.reason) : null,
        createdAt: new Date(),
      };
      this.auditLogs.set(id, row);
      return { ...row };
    },
    findMany: async (args?: { where?: { targetId?: string; action?: string }; orderBy?: { createdAt?: 'asc' | 'desc' }; take?: number }): Promise<AuditLogRow[]> => {
      let list = [...this.auditLogs.values()];
      if (args?.where?.targetId) list = list.filter((l) => l.targetId === args.where!.targetId);
      if (args?.where?.action) list = list.filter((l) => l.action === args.where!.action);
      if (args?.orderBy?.createdAt === 'desc') list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      if (args?.take !== undefined) list = list.slice(0, args.take);
      return list.map((l) => ({ ...l }));
    },
    count: async (): Promise<number> => this.auditLogs.size,
    deleteMany: async (): Promise<{ count: number }> => {
      const count = this.auditLogs.size;
      this.auditLogs.clear();
      return { count };
    },
  };

  favoritePartner = {
    create: async (args: { data: Record<string, unknown> }): Promise<FavoriteRow> => {
      const id = stringValue(args.data.id, crypto.randomUUID());
      const row: FavoriteRow = {
        id,
        userId: stringValue(args.data.userId),
        partnerId: stringValue(args.data.partnerId),
        createdAt: new Date(),
      };
      this.favoritePartners.set(id, row);
      return { ...row };
    },
    upsert: async (args: { where: { userId_partnerId: { userId: string; partnerId: string } }; update: Record<string, unknown>; create: Record<string, unknown> }): Promise<FavoriteRow> => {
      for (const row of this.favoritePartners.values()) {
        if (row.userId === args.where.userId_partnerId.userId && row.partnerId === args.where.userId_partnerId.partnerId) {
          return { ...row };
        }
      }
      return this.favoritePartner.create({ data: args.create });
    },
    findFirst: async (args: { where: FavoriteWhere }): Promise<FavoriteRow | null> => {
      for (const row of this.favoritePartners.values()) {
        if (args.where.userId && row.userId !== args.where.userId) continue;
        if (args.where.partnerId && row.partnerId !== args.where.partnerId) continue;
        return { ...row };
      }
      return null;
    },
    findUnique: async (args: { where: { userId_partnerId: { userId: string; partnerId: string } } }): Promise<FavoriteRow | null> => {
      for (const row of this.favoritePartners.values()) {
        if (row.userId === args.where.userId_partnerId.userId && row.partnerId === args.where.userId_partnerId.partnerId) {
          return { ...row };
        }
      }
      return null;
    },
    findMany: async (args?: { where?: FavoriteWhere; include?: { partner?: boolean } }): Promise<Array<FavoriteRow & { partner?: UserRow }>> => {
      return [...this.favoritePartners.values()].filter((row) => !args?.where?.userId || row.userId === args.where.userId).map((row) => ({
        ...row,
        ...(args?.include?.partner ? { partner: this.users.get(row.partnerId) } : {}),
      }));
    },
    deleteMany: async (args?: { where?: FavoriteWhere }): Promise<{ count: number }> => {
      if (!args?.where) {
        const count = this.favoritePartners.size;
        this.favoritePartners.clear();
        return { count };
      }
      let count = 0;
      for (const [id, row] of this.favoritePartners) {
        if (args.where.userId && row.userId !== args.where.userId) continue;
        if (args.where.partnerId && row.partnerId !== args.where.partnerId) continue;
        this.favoritePartners.delete(id);
        count += 1;
      }
      return { count };
    },
  };

  private findUser(selector: IdSelector): UserRow | undefined {
    if (selector.id) return this.users.get(selector.id);
    if (selector.alias) return [...this.users.values()].find((user) => user.alias === selector.alias);
    if (selector.telegramId !== undefined) {
      const telegramId = BigInt(String(selector.telegramId));
      return [...this.users.values()].find((user) => user.telegramId === telegramId);
    }
    return undefined;
  }

  private matchesUser(user: UserRow, where?: UserWhere): boolean {
    if (!where) return true;
    if (typeof where.id === 'string' && user.id !== where.id) return false;
    if (typeof where.id === 'object' && !where.id.in.includes(user.id)) return false;
    if (where.telegramId !== undefined && user.telegramId !== BigInt(String(where.telegramId))) return false;
    if (where.alias && user.alias !== where.alias) return false;
    if (where.plan) {
      if (typeof where.plan === 'string' && user.plan !== where.plan) return false;
      if (typeof where.plan === 'object' && 'not' in where.plan && user.plan === (where.plan as { not: string }).not) return false;
      if (typeof where.plan === 'object' && 'in' in where.plan && !((where.plan as { in: string[] }).in).includes(user.plan)) return false;
    }
    if (where.subscriptionExpiresAt !== undefined) {
      if (where.subscriptionExpiresAt === null && user.subscriptionExpiresAt !== null) return false;
      if (where.subscriptionExpiresAt && typeof where.subscriptionExpiresAt === 'object') {
        const filter = where.subscriptionExpiresAt as { lte?: Date | string; gt?: Date | string; gte?: Date | string; not?: null };
        if (filter.not === null && user.subscriptionExpiresAt === null) return false;
        if (filter.lte && (!user.subscriptionExpiresAt || user.subscriptionExpiresAt.getTime() > new Date(filter.lte).getTime())) return false;
        if (filter.gt && (!user.subscriptionExpiresAt || user.subscriptionExpiresAt.getTime() <= new Date(filter.gt).getTime())) return false;
        if (filter.gte && (!user.subscriptionExpiresAt || user.subscriptionExpiresAt.getTime() < new Date(filter.gte).getTime())) return false;
      }
    }
    if (where.updatedAt?.gte && user.updatedAt.getTime() < dateValue(where.updatedAt.gte, user.updatedAt).getTime()) return false;
    if (where.lastCallDate && typeof where.lastCallDate !== 'string' && where.lastCallDate.not !== undefined && user.lastCallDate === where.lastCallDate.not) return false;
    if (where.lastCallDate === null && user.lastCallDate !== null) return false;
    if (where.dailyCallsUsed?.lt !== undefined && user.dailyCallsUsed >= where.dailyCallsUsed.lt) return false;
    if (where.dailyCallsUsed?.gt !== undefined && user.dailyCallsUsed <= where.dailyCallsUsed.gt) return false;
    if (where.isBanned !== undefined && user.isBanned !== where.isBanned) return false;
    if (where.isPermanentlyBanned !== undefined && user.isPermanentlyBanned !== where.isPermanentlyBanned) return false;
    if (where.warningCount?.gt !== undefined && user.warningCount <= where.warningCount.gt) return false;
    if (where.OR && !where.OR.some((condition) => this.matchesUser(user, condition))) return false;
    return true;
  }

  private matchesCallSession(session: CallSessionRow, where?: CallSessionWhere): boolean {
    if (!where) return true;
    if (where.id && session.id !== where.id) return false;
    if (where.roomName && session.roomName !== where.roomName) return false;
    if (where.userAId && session.userAId !== where.userAId) return false;
    if (where.userBId && session.userBId !== where.userBId) return false;
    if (typeof where.status === 'string' && session.status !== where.status) return false;
    if (typeof where.status === 'object' && where.status.in && !where.status.in.includes(session.status)) return false;
    if (where.egressId !== undefined && session.egressId !== where.egressId) return false;
    if (where.recordingUrl === null && session.recordingUrl !== null) return false;
    if (where.recordingUrl && typeof where.recordingUrl === 'object' && where.recordingUrl.not === null && session.recordingUrl === null) return false;
    if (where.recordedByUserId !== undefined) {
      if (typeof where.recordedByUserId === 'object' && where.recordedByUserId !== null && 'contains' in where.recordedByUserId) {
        if (!session.recordedByUserId || !session.recordedByUserId.includes((where.recordedByUserId as { contains: string }).contains)) {
          return false;
        }
      } else if (session.recordedByUserId !== where.recordedByUserId) {
        return false;
      }
    }
    if (where.recordingExpiresAt === null && session.recordingExpiresAt !== null) return false;
    if (where.recordingExpiresAt && !(where.recordingExpiresAt instanceof Date)) {
      const expFilter = where.recordingExpiresAt as { lte?: Date; gt?: Date };
      if (expFilter.lte && (!session.recordingExpiresAt || session.recordingExpiresAt.getTime() > expFilter.lte.getTime())) return false;
      if (expFilter.gt && (!session.recordingExpiresAt || session.recordingExpiresAt.getTime() <= expFilter.gt.getTime())) return false;
    }
    if (where.createdAt && !(where.createdAt instanceof Date)) {
      const filter = where.createdAt as { lte?: Date | string; gte?: Date | string };
      if (filter.lte && session.createdAt.getTime() > new Date(filter.lte).getTime()) return false;
      if (filter.gte && session.createdAt.getTime() < new Date(filter.gte).getTime()) return false;
    }
    if (where.OR && !where.OR.some((condition) => this.matchesCallSession(session, condition))) return false;
    return true;
  }

  private mergeUser(user: UserRow, data: UserData): UserRow {
    const updated: UserRow = { ...user };
    for (const [key, value] of Object.entries(data)) {
      if (key === 'dailyCallsUsed') updated.dailyCallsUsed = applyIncrement(user.dailyCallsUsed, value);
      else if (key === 'telegramId') updated.telegramId = BigInt(String(value));
      else (updated as unknown as Record<string, unknown>)[key] = value;
    }
    updated.updatedAt = new Date();
    return updated;
  }

  private mergeCallSession(session: CallSessionRow, data: CallSessionData): CallSessionRow {
    const updated = { ...session };
    for (const [key, value] of Object.entries(data)) {
      (updated as unknown as Record<string, unknown>)[key] = value;
    }
    return updated;
  }
}
