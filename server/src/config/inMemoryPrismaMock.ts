import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

export class InMemoryPrismaMock {
  private users = new Map<string, any>();
  private callSessions = new Map<string, any>();
  private callRatings = new Map<string, any>();
  private unblockAppeals = new Map<string, any>();
  private starsTransactions = new Map<string, any>();
  private favoritePartners = new Map<string, any>();

  async $connect() {
    return Promise.resolve();
  }

  async $disconnect() {
    return Promise.resolve();
  }

  user = {
    create: async (args: { data: any }) => {
      const id = args.data.id || crypto.randomUUID();
      const now = new Date();
      const user = {
        id,
        telegramId: args.data.telegramId !== undefined ? BigInt(args.data.telegramId) : BigInt(0),
        alias: args.data.alias || `P2P-Partner-${Math.floor(1000 + Math.random() * 9000)}`,
        subFC: args.data.subFC ?? 6.0,
        subLR: args.data.subLR ?? 6.0,
        subGRA: args.data.subGRA ?? 6.0,
        subP: args.data.subP ?? 6.0,
        band: args.data.band ?? 6.0,
        plan: args.data.plan || 'FREE',
        maxDuration: args.data.maxDuration ?? 15,
        dailyLimit: args.data.dailyLimit ?? 3,
        dailyCallsUsed: args.data.dailyCallsUsed ?? 0,
        lastCallDate: args.data.lastCallDate || null,
        warningCount: args.data.warningCount ?? 0,
        isBanned: args.data.isBanned ?? false,
        bannedUntil: args.data.bannedUntil ? new Date(args.data.bannedUntil) : null,
        isPermanentlyBanned: args.data.isPermanentlyBanned ?? false,
        dnd: args.data.dnd ?? false,
        onboarded: args.data.onboarded ?? false,
        createdAt: args.data.createdAt ? new Date(args.data.createdAt) : now,
        updatedAt: args.data.updatedAt ? new Date(args.data.updatedAt) : now,
      };
      this.users.set(id, user);
      return { ...user };
    },

    upsert: async (args: { where: any; update: any; create: any }) => {
      let existing: any = null;
      if (args.where.telegramId !== undefined) {
        const tid = BigInt(args.where.telegramId);
        existing = Array.from(this.users.values()).find((u) => u.telegramId === tid);
      } else if (args.where.id !== undefined) {
        existing = this.users.get(args.where.id);
      } else if (args.where.alias !== undefined) {
        existing = Array.from(this.users.values()).find((u) => u.alias === args.where.alias);
      }

      if (existing) {
        const updated = {
          ...existing,
          ...args.update,
          updatedAt: new Date(),
        };
        this.users.set(existing.id, updated);
        return { ...updated };
      } else {
        return this.user.create({ data: args.create });
      }
    },

    findUnique: async (args: { where: any }) => {
      let user: any = null;
      if (args.where.id !== undefined) {
        user = this.users.get(args.where.id);
      } else if (args.where.telegramId !== undefined) {
        const tid = BigInt(args.where.telegramId);
        user = Array.from(this.users.values()).find((u) => u.telegramId === tid);
      } else if (args.where.alias !== undefined) {
        user = Array.from(this.users.values()).find((u) => u.alias === args.where.alias);
      }
      return user ? { ...user } : null;
    },

    findMany: async (args?: { where?: any; orderBy?: any; take?: number }) => {
      let list = Array.from(this.users.values());
      if (args?.where) {
        if (args.where.id?.in) {
          const ids = new Set(args.where.id.in);
          list = list.filter((u) => ids.has(u.id));
        }
        if (args.where.updatedAt?.gte) {
          const gte = new Date(args.where.updatedAt.gte).getTime();
          list = list.filter((u) => u.updatedAt.getTime() >= gte);
        }
      }
      if (args?.orderBy?.createdAt === 'desc') {
        list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      }
      if (args?.take) {
        list = list.slice(0, args.take);
      }
      return list.map((u) => ({ ...u }));
    },

    update: async (args: { where: any; data: any }) => {
      let user: any = null;
      if (args.where.id !== undefined) {
        user = this.users.get(args.where.id);
      } else if (args.where.telegramId !== undefined) {
        const tid = BigInt(args.where.telegramId);
        user = Array.from(this.users.values()).find((u) => u.telegramId === tid);
      }
      if (!user) throw new Error(`User not found for update: ${JSON.stringify(args.where)}`);

      const updated = {
        ...user,
        ...args.data,
        updatedAt: new Date(),
      };
      this.users.set(user.id, updated);
      return { ...updated };
    },

    count: async (args?: { where?: any }) => {
      if (!args?.where) return this.users.size;
      let count = 0;
      for (const u of this.users.values()) {
        let match = true;
        if (args.where.updatedAt?.gte) {
          const gte = new Date(args.where.updatedAt.gte).getTime();
          if (u.updatedAt.getTime() < gte) match = false;
        }
        if (match) count++;
      }
      return count;
    },

    deleteMany: async (args?: { where?: any }) => {
      if (!args?.where) {
        const count = this.users.size;
        this.users.clear();
        return { count };
      }
      let deleted = 0;
      if (args.where.id?.in) {
        const ids = new Set(args.where.id.in);
        for (const id of ids) {
          if (this.users.delete(id as string)) deleted++;
        }
      }
      return { count: deleted };
    },
  };

  callSession = {
    create: async (args: { data: any }) => {
      const id = args.data.id || crypto.randomUUID();
      const now = new Date();
      const session = {
        id,
        roomName: args.data.roomName,
        userAId: args.data.userAId,
        userBId: args.data.userBId,
        status: args.data.status || 'ACTIVE',
        egressId: args.data.egressId || null,
        recordingUrl: args.data.recordingUrl || null,
        recordingExpiresAt: args.data.recordingExpiresAt ? new Date(args.data.recordingExpiresAt) : null,
        duration: args.data.duration ?? 0,
        createdAt: args.data.createdAt ? new Date(args.data.createdAt) : now,
        endedAt: args.data.endedAt ? new Date(args.data.endedAt) : null,
      };
      this.callSessions.set(id, session);
      return { ...session };
    },

    findUnique: async (args: { where: any }) => {
      let session: any = null;
      if (args.where.id !== undefined) {
        session = this.callSessions.get(args.where.id);
      } else if (args.where.roomName !== undefined) {
        session = Array.from(this.callSessions.values()).find((s) => s.roomName === args.where.roomName);
      }
      return session ? { ...session } : null;
    },

    findMany: async (args?: { where?: any; orderBy?: any; take?: number }) => {
      let list = Array.from(this.callSessions.values());
      if (args?.where) {
        if (args.where.status) {
          list = list.filter((s) => s.status === args.where.status);
        }
        if (args.where.recordingUrl !== undefined) {
          if (args.where.recordingUrl?.not === null) {
            list = list.filter((s) => s.recordingUrl !== null);
          }
        }
        if (args.where.recordingExpiresAt?.lte) {
          const lte = new Date(args.where.recordingExpiresAt.lte).getTime();
          list = list.filter((s) => s.recordingExpiresAt && s.recordingExpiresAt.getTime() <= lte);
        }
        if (args.where.OR) {
          const orConditions = args.where.OR;
          list = list.filter((s) =>
            orConditions.some((cond: any) => {
              if (cond.userAId && s.userAId === cond.userAId) return true;
              if (cond.userBId && s.userBId === cond.userBId) return true;
              return false;
            })
          );
        }
      }
      if (args?.orderBy?.createdAt === 'desc') {
        list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      }
      if (args?.take) {
        list = list.slice(0, args.take);
      }
      return list.map((s) => ({ ...s }));
    },

    update: async (args: { where: any; data: any }) => {
      const session = this.callSessions.get(args.where.id);
      if (!session) throw new Error(`CallSession not found: ${args.where.id}`);
      const updated = {
        ...session,
        ...args.data,
      };
      this.callSessions.set(session.id, updated);
      return { ...updated };
    },

    count: async (args?: { where?: any }) => {
      if (!args?.where) return this.callSessions.size;
      let count = 0;
      for (const s of this.callSessions.values()) {
        let match = true;
        if (args.where.status && s.status !== args.where.status) match = false;
        if (match) count++;
      }
      return count;
    },

    deleteMany: async (args?: { where?: any }) => {
      if (!args?.where) {
        const count = this.callSessions.size;
        this.callSessions.clear();
        return { count };
      }
      let deleted = 0;
      if (args.where.id) {
        if (this.callSessions.delete(args.where.id)) deleted++;
      }
      return { count: deleted };
    },
  };

  callRating = {
    create: async (args: { data: any }) => {
      const id = args.data.id || crypto.randomUUID();
      const rating = {
        id,
        callId: args.data.callId,
        raterId: args.data.raterId,
        ratedId: args.data.ratedId,
        stars: args.data.stars,
        feedback: args.data.feedback || null,
        reported: args.data.reported ?? false,
        createdAt: new Date(),
      };
      this.callRatings.set(id, rating);
      return { ...rating };
    },

    findFirst: async (args: { where: any }) => {
      for (const r of this.callRatings.values()) {
        let match = true;
        if (args.where.callId && r.callId !== args.where.callId) match = false;
        if (args.where.raterId && r.raterId !== args.where.raterId) match = false;
        if (match) return { ...r };
      }
      return null;
    },

    findMany: async (args?: { where?: any }) => {
      let list = Array.from(this.callRatings.values());
      if (args?.where?.callId) {
        list = list.filter((r) => r.callId === args.where.callId);
      }
      return list.map((r) => ({ ...r }));
    },

    deleteMany: async (args?: { where?: any }) => {
      if (!args?.where) {
        const count = this.callRatings.size;
        this.callRatings.clear();
        return { count };
      }
      let deleted = 0;
      if (args.where.callId) {
        for (const [id, r] of Array.from(this.callRatings.entries())) {
          if (r.callId === args.where.callId) {
            this.callRatings.delete(id);
            deleted++;
          }
        }
      }
      return { count: deleted };
    },
  };

  unblockAppeal = {
    create: async (args: { data: any }) => {
      const id = args.data.id || crypto.randomUUID();
      const appeal = {
        id,
        userId: args.data.userId,
        telegramId: BigInt(args.data.telegramId),
        alias: args.data.alias,
        banReason: args.data.banReason,
        appealText: args.data.appealText,
        status: args.data.status || 'PENDING',
        createdAt: new Date(),
        reviewedAt: null,
      };
      this.unblockAppeals.set(id, appeal);
      return { ...appeal };
    },

    findMany: async (args?: { where?: any; orderBy?: any; include?: any }) => {
      let list = Array.from(this.unblockAppeals.values());
      if (args?.orderBy?.createdAt === 'desc') {
        list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      }
      return list.map((a) => {
        const res = { ...a };
        if (args?.include?.user) {
          res.user = this.users.get(a.userId) || {
            subFC: 6.0,
            subLR: 6.0,
            subGRA: 6.0,
            subP: 6.0,
            band: 6.0,
          };
        }
        return res;
      });
    },

    findUnique: async (args: { where: any }) => {
      const a = this.unblockAppeals.get(args.where.id);
      return a ? { ...a } : null;
    },

    update: async (args: { where: any; data: any }) => {
      const appeal = this.unblockAppeals.get(args.where.id);
      if (!appeal) throw new Error(`Appeal not found: ${args.where.id}`);
      const updated = {
        ...appeal,
        ...args.data,
      };
      this.unblockAppeals.set(appeal.id, updated);
      return { ...updated };
    },
  };

  starsTransaction = {
    create: async (args: { data: any }) => {
      const id = args.data.id || crypto.randomUUID();
      const tx = {
        id,
        userId: args.data.userId,
        telegramPaymentId: args.data.telegramPaymentId,
        starsAmount: args.data.starsAmount,
        planTier: args.data.planTier,
        createdAt: new Date(),
      };
      this.starsTransactions.set(id, tx);
      return { ...tx };
    },

    findMany: async () => {
      return Array.from(this.starsTransactions.values()).map((t) => ({ ...t }));
    },
  };

  favoritePartner = {
    create: async (args: { data: any }) => {
      const id = args.data.id || crypto.randomUUID();
      const fav = {
        id,
        userId: args.data.userId,
        partnerId: args.data.partnerId,
        createdAt: new Date(),
      };
      this.favoritePartners.set(id, fav);
      return { ...fav };
    },

    findMany: async (args?: { where?: any; include?: any }) => {
      let list = Array.from(this.favoritePartners.values());
      if (args?.where?.userId) {
        list = list.filter((f) => f.userId === args.where.userId);
      }
      return list.map((f) => {
        const res = { ...f };
        if (args?.include?.partner) {
          res.partner = this.users.get(f.partnerId);
        }
        return res;
      });
    },

    deleteMany: async (args?: { where?: any }) => {
      if (!args?.where) {
        const count = this.favoritePartners.size;
        this.favoritePartners.clear();
        return { count };
      }
      let deleted = 0;
      if (args.where.userId && args.where.partnerId) {
        for (const [id, f] of Array.from(this.favoritePartners.entries())) {
          if (f.userId === args.where.userId && f.partnerId === args.where.partnerId) {
            this.favoritePartners.delete(id);
            deleted++;
          }
        }
      }
      return { count: deleted };
    },
  };
}
