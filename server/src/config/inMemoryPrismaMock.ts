import crypto from 'node:crypto';

type IdSelector = { id?: string; telegramId?: bigint | string | number; alias?: string };
type DateFilter = { gte?: Date | string; lte?: Date | string; not?: string | null };
type UserWhere = {
  id?: string | { in: string[] };
  telegramId?: bigint | string | number;
  alias?: string;
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
  status?: string | { in?: string[] };
  egressId?: string | null;
  recordingUrl?: string | null | { not?: null };
  recordingExpiresAt?: Date | null | { lte?: Date };
  createdAt?: Date | { lte?: Date };
  OR?: Array<CallSessionWhere>;
};
type CallSessionData = Record<string, unknown>;
type RatingWhere = { callId?: string; raterId?: string; reported?: boolean };
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
  maxDuration: number;
  dailyLimit: number;
  dailyCallsUsed: number;
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
  userId: string;
  telegramPaymentId: string;
  starsAmount: number;
  planTier: string;
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
  private readonly favoritePartners = new Map<string, FavoriteRow>();

  async $connect(): Promise<void> {}
  async $disconnect(): Promise<void> {}
  async $transaction<T>(operation: (tx: InMemoryPrismaMock) => Promise<T>): Promise<T> {
    return operation(this);
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
        maxDuration: numberValue(args.data.maxDuration, 15),
        dailyLimit: numberValue(args.data.dailyLimit, 3),
        dailyCallsUsed: numberValue(args.data.dailyCallsUsed, 0),
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
        roomName: stringValue(args.data.roomName),
        userAId: stringValue(args.data.userAId),
        userBId: stringValue(args.data.userBId),
        status: stringValue(args.data.status, 'ACTIVE'),
        egressId: args.data.egressId == null ? null : stringValue(args.data.egressId),
        recordingUrl: args.data.recordingUrl == null ? null : stringValue(args.data.recordingUrl),
        recordingExpiresAt: args.data.recordingExpiresAt ? dateValue(args.data.recordingExpiresAt, now) : null,
        duration: numberValue(args.data.duration, 0),
        createdAt: dateValue(args.data.createdAt, now),
        endedAt: args.data.endedAt ? dateValue(args.data.endedAt, now) : null,
      };
      this.callSessions.set(id, row);
      return { ...row };
    },

    findUnique: async (args: { where: { id?: string; roomName?: string } }): Promise<CallSessionRow | null> => {
      const row = args.where.id ? this.callSessions.get(args.where.id) : [...this.callSessions.values()].find((session) => session.roomName === args.where.roomName);
      return row ? { ...row } : null;
    },

    findFirst: async (args: { where?: CallSessionWhere }): Promise<CallSessionRow | null> => {
      return [...this.callSessions.values()].find((session) => this.matchesCallSession(session, args.where)) ?? null;
    },

    findMany: async (args?: { where?: CallSessionWhere; orderBy?: { createdAt?: 'asc' | 'desc' }; take?: number }): Promise<CallSessionRow[]> => {
      let list = [...this.callSessions.values()].filter((session) => this.matchesCallSession(session, args?.where));
      if (args?.orderBy?.createdAt === 'desc') list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      if (args?.take !== undefined) list = list.slice(0, args.take);
      return list.map((session) => ({ ...session }));
    },

    update: async (args: { where: { id: string }; data: CallSessionData }): Promise<CallSessionRow> => {
      const session = this.callSessions.get(args.where.id);
      if (!session) throw new Error(`CallSession not found: ${args.where.id}`);
      const updated = this.mergeCallSession(session, args.data);
      this.callSessions.set(session.id, updated);
      return { ...updated };
    },

    updateMany: async (args: { where?: CallSessionWhere; data: CallSessionData }): Promise<{ count: number }> => {
      let count = 0;
      for (const [id, session] of this.callSessions) {
        if (!this.matchesCallSession(session, args.where)) continue;
        this.callSessions.set(id, this.mergeCallSession(session, args.data));
        count += 1;
      }
      return { count };
    },

    count: async (args?: { where?: CallSessionWhere }): Promise<number> => [...this.callSessions.values()].filter((session) => this.matchesCallSession(session, args?.where)).length,

    deleteMany: async (args?: { where?: { id?: string } }): Promise<{ count: number }> => {
      if (!args?.where) {
        const count = this.callSessions.size;
        this.callSessions.clear();
        return { count };
      }
      return { count: this.callSessions.delete(args.where.id ?? '') ? 1 : 0 };
    },
  };

  callRating = {
    create: async (args: { data: CallRatingRow }): Promise<CallRatingRow> => {
      const row = { ...args.data, id: args.data.id || crypto.randomUUID(), createdAt: args.data.createdAt ?? new Date() };
      this.callRatings.set(row.id, row);
      return { ...row };
    },

    findFirst: async (args: { where: RatingWhere }): Promise<CallRatingRow | null> => {
      return [...this.callRatings.values()].find((rating) =>
        (args.where.callId === undefined || rating.callId === args.where.callId) &&
        (args.where.raterId === undefined || rating.raterId === args.where.raterId) &&
        (args.where.reported === undefined || rating.reported === args.where.reported),
      ) ?? null;
    },

    findMany: async (args?: { where?: RatingWhere }): Promise<CallRatingRow[]> => {
      return [...this.callRatings.values()].filter((rating) =>
        !args?.where?.callId || rating.callId === args.where.callId,
      ).map((rating) => ({ ...rating }));
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
        telegramId: BigInt(String(args.data.telegramId)),
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
    findMany: async (args?: { orderBy?: { createdAt?: 'asc' | 'desc' }; include?: { user?: boolean } }): Promise<Array<AppealRow & { user?: UserRow }>> => {
      let list = [...this.unblockAppeals.values()];
      if (args?.orderBy?.createdAt === 'desc') list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return list.map((appeal) => ({ ...appeal, ...(args?.include?.user ? { user: this.users.get(appeal.userId) } : {}) }));
    },
    findUnique: async (args: { where: AppealWhere }): Promise<AppealRow | null> => this.unblockAppeals.get(args.where.id ?? '') ?? null,
    update: async (args: { where: AppealWhere; data: Record<string, unknown> }): Promise<AppealRow> => {
      const appeal = this.unblockAppeals.get(args.where.id ?? '');
      if (!appeal) throw new Error(`Appeal not found: ${args.where.id}`);
      const updated = { ...appeal, ...args.data } as AppealRow;
      this.unblockAppeals.set(appeal.id, updated);
      return { ...updated };
    },
  };

  starsTransaction = {
    create: async (args: { data: Record<string, unknown> }): Promise<StarsTransactionRow> => {
      const id = stringValue(args.data.id, crypto.randomUUID());
      const row: StarsTransactionRow = {
        id,
        userId: stringValue(args.data.userId),
        telegramPaymentId: stringValue(args.data.telegramPaymentId),
        starsAmount: numberValue(args.data.starsAmount, 0),
        planTier: stringValue(args.data.planTier),
        createdAt: new Date(),
      };
      this.starsTransactions.set(id, row);
      return { ...row };
    },
    findMany: async (): Promise<StarsTransactionRow[]> => [...this.starsTransactions.values()].map((row) => ({ ...row })),
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
    if (typeof where.status === 'string' && session.status !== where.status) return false;
    if (typeof where.status === 'object' && where.status.in && !where.status.in.includes(session.status)) return false;
    if (where.egressId !== undefined && session.egressId !== where.egressId) return false;
    if (where.recordingUrl === null && session.recordingUrl !== null) return false;
    if (where.recordingUrl && typeof where.recordingUrl === 'object' && where.recordingUrl.not === null && session.recordingUrl === null) return false;
    if (where.recordingExpiresAt === null && session.recordingExpiresAt !== null) return false;
    if (where.recordingExpiresAt && !(where.recordingExpiresAt instanceof Date) && 'lte' in where.recordingExpiresAt && where.recordingExpiresAt.lte) {
      if (!session.recordingExpiresAt || session.recordingExpiresAt.getTime() > where.recordingExpiresAt.lte.getTime()) return false;
    }
    if (where.createdAt && !(where.createdAt instanceof Date) && 'lte' in where.createdAt && where.createdAt.lte) {
      if (session.createdAt.getTime() > where.createdAt.lte.getTime()) return false;
    }
    if (where.OR && !where.OR.some((condition) => this.matchesCallSession(session, condition))) return false;
    return true;
  }

  private mergeUser(user: UserRow, data: UserData): UserRow {
    const updated: UserRow = { ...user };
    for (const [key, value] of Object.entries(data)) {
      if (key === 'dailyCallsUsed') updated.dailyCallsUsed = applyIncrement(user.dailyCallsUsed, value);
      else if (key === 'telegramId') updated.telegramId = BigInt(String(value));
      else if (key in updated) (updated as unknown as Record<string, unknown>)[key] = value;
    }
    updated.updatedAt = new Date();
    return updated;
  }

  private mergeCallSession(session: CallSessionRow, data: CallSessionData): CallSessionRow {
    const updated = { ...session };
    for (const [key, value] of Object.entries(data)) {
      if (key in updated) (updated as unknown as Record<string, unknown>)[key] = value;
    }
    return updated;
  }
}
