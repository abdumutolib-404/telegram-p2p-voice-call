import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  $connect: vi.fn(),
  $disconnect: vi.fn(),
  user: { findFirst: vi.fn() },
  manualPaymentRequest: { findFirst: vi.fn() },
  auditLog: { findFirst: vi.fn() },
  notificationJob: { findFirst: vi.fn() },
  postCallJob: { findFirst: vi.fn() },
}));
vi.mock('@prisma/client', () => ({ PrismaClient: function () { return db; } }));

describe('Persistent database startup diagnostics', () => {
  let output: string[];
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DATABASE_URL', 'postgresql://synthetic:synthetic-password@db.invalid/test');
    db.$connect.mockResolvedValue(undefined);
    db.$disconnect.mockResolvedValue(undefined);
    for (const model of [db.user, db.manualPaymentRequest, db.auditLog, db.notificationJob, db.postCallJob]) {
      model.findFirst.mockResolvedValue(null);
    }
    output = [];
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      output.push(chunk.toString());
      return true;
    });
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('accepts a reachable database with the required schema', async () => {
    const { connectDB } = await import('../config/database');
    await expect(connectDB()).resolves.toBeUndefined();
    expect(db.notificationJob.findFirst).toHaveBeenCalled();
    expect(db.$disconnect).not.toHaveBeenCalled();
    expect(output).toEqual([]);
  });

  it('reports initialization errorCode in the visible message and redacts credentials', async () => {
    const failure = Object.assign(new Error('Cannot connect to postgresql://synthetic:synthetic-password@db.invalid/test'), {
      errorCode: 'P1001',
    });
    db.$connect.mockRejectedValue(failure);
    const { connectDB } = await import('../config/database');
    await expect(connectDB()).rejects.toBe(failure);
    const entry = JSON.parse(output[0]);
    expect(entry.message).toContain('connection readiness failed [P1001]');
    expect(entry.context.stage).toBe('connection');
    expect(entry.context.prismaErrorCode).toBe('P1001');
    expect(output.join('')).not.toContain('synthetic-password');
    expect(db.user.findFirst).not.toHaveBeenCalled();
    expect(db.$disconnect).toHaveBeenCalledOnce();
  });

  it.each(['P2021', 'P2022'])('distinguishes missing schema (%s) and remains unavailable', async (code) => {
    const failure = Object.assign(new Error('Missing schema'), { code });
    db.notificationJob.findFirst.mockRejectedValue(failure);
    const { connectDB } = await import('../config/database');
    await expect(connectDB()).rejects.toBe(failure);
    const entry = JSON.parse(output[0]);
    expect(entry.message).toContain(`schema readiness failed [${code}]`);
    expect(entry.message).toContain('npm run db:deploy');
    expect(entry.context.stage).toBe('schema');
    expect(db.$disconnect).toHaveBeenCalledOnce();
  });

  it('reports a missing backend variable without attempting a connection', async () => {
    vi.stubEnv('DATABASE_URL', '');
    const { connectDB } = await import('../config/database');
    await expect(connectDB()).rejects.toThrow('DATABASE_URL is required');
    expect(JSON.parse(output[0]).message).toContain('configuration readiness failed');
    expect(db.$connect).not.toHaveBeenCalled();
  });

  it('does not interpolate untrusted code properties into log headings', async () => {
    db.$connect.mockRejectedValue(Object.assign(new Error('Unknown failure'), { errorCode: 'secret\nP1001' }));
    const { connectDB } = await import('../config/database');
    await expect(connectDB()).rejects.toThrow('Unknown failure');
    expect(JSON.parse(output[0]).message).toBe(
      'Database connection readiness failed: Expand the structured error.message for details.'
    );
  });
});
