import { beforeEach, describe, expect, it, vi } from 'vitest';
import path from 'node:path';

const fixture = vi.hoisted(() => ({
  send: vi.fn(),
  segmentFindMany: vi.fn(),
  segmentUpdateMany: vi.fn(),
  findMany: vi.fn(),
  findUnique: vi.fn(),
  update: vi.fn(),
  existsSync: vi.fn(),
  stat: vi.fn(),
  unlink: vi.fn(),
  env: {
    S3_KEY: 'synthetic-key',
    S3_SECRET: 'synthetic-secret',
    S3_BUCKET: 'synthetic-retention-bucket',
    RECORDINGS_DIR: 'synthetic-retention-recordings',
  },
}));

vi.mock('../config/env', () => ({ env: fixture.env }));
vi.mock('../config/database', () => ({
  prisma: { recordingSegment:{findMany:fixture.segmentFindMany,updateMany:fixture.segmentUpdateMany}, callSession: { findMany: fixture.findMany, findUnique: fixture.findUnique, update: fixture.update },
    $transaction: async (fn: Function) => fn({ callSession: { findUnique: fixture.findUnique, update: fixture.update } }),
  },
}));
vi.mock('../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@aws-sdk/client-s3', () => {
  class Command {
    constructor(public input: { Bucket: string; Key: string }) {}
  }
  return {
    S3Client: class { send = fixture.send; },
    DeleteObjectCommand: Command,
    GetObjectCommand: Command,
    HeadObjectCommand: Command,
  };
});
vi.mock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl: vi.fn() }));
vi.mock('node-cron', () => ({ default: { schedule: vi.fn() } }));
vi.mock('node:fs', () => ({ default: { existsSync: fixture.existsSync } }));
vi.mock('node:fs/promises', () => ({
  default: { stat: fixture.stat, unlink: fixture.unlink },
}));

import { deleteS3Object } from '../services/s3Storage';
import { purgeExpiredRecordings } from '../services/storage';

type Recording = { id: string; recordingUrl: string | null; recordingExpiresAt: Date; recordingKeys?: string[] };
let recordings: Recording[];

function expired(id: string): Recording {
  return { id, recordingUrl: `recordings/${id}.mp3`, recordingExpiresAt: new Date(0) };
}

beforeEach(() => {
  vi.resetAllMocks();
  fixture.segmentFindMany.mockResolvedValue([]);
  fixture.segmentUpdateMany.mockResolvedValue({count:1});
  fixture.env.S3_KEY = 'synthetic-key';
  recordings = [expired('first')];
  fixture.findMany.mockImplementation(async () => recordings
    .filter(recording => recording.recordingUrl !== null || recording.recordingKeys?.length)
    .map(recording => ({ ...recording })));
  fixture.findUnique.mockImplementation(async ({ where }) => recordings.find(row => row.id === where.id));
  fixture.update.mockImplementation(async ({ where, data }) => {
    const recording = recordings.find(recording => recording.id === where.id)!;
    Object.assign(recording, data);
    return { ...recording };
  });
  fixture.send.mockResolvedValue({});
});

describe('recording retention deletion', () => {
  it.each(['AccessDenied', 'TimeoutError'])('propagates %s to the caller', async name => {
    const failure = Object.assign(new Error('Synthetic deletion failure'), { name });
    fixture.send.mockRejectedValueOnce(failure);

    await expect(deleteS3Object('recordings/first.mp3')).rejects.toBe(failure);
    expect(fixture.send).toHaveBeenCalledOnce();
  });

  it.each(['AccessDenied', 'TimeoutError'])('keeps metadata after %s, then retries successfully and stays idempotent', async name => {
    fixture.send.mockRejectedValueOnce(Object.assign(new Error('Synthetic deletion failure'), { name }));

    expect(await purgeExpiredRecordings()).toEqual({ purgedCount: 0, freedSpaceBytes: 0 });
    expect(recordings[0].recordingUrl).toBe('recordings/first.mp3');
    expect(fixture.update).not.toHaveBeenCalled();

    expect(await purgeExpiredRecordings()).toEqual({ purgedCount: 1, freedSpaceBytes: 0 });
    expect(recordings[0].recordingUrl).toBeNull();
    expect(fixture.update).toHaveBeenCalledOnce();
    expect(fixture.send).toHaveBeenCalledTimes(2);
    expect(fixture.send.mock.calls[1][0].input).toEqual({
      Bucket: 'synthetic-retention-bucket', Key: 'recordings/first.mp3',
    });
    expect(fixture.send.mock.calls[1][1].abortSignal).toBeInstanceOf(AbortSignal);

    expect(await purgeExpiredRecordings()).toEqual({ purgedCount: 0, freedSpaceBytes: 0 });
    expect(fixture.send).toHaveBeenCalledTimes(2);
    expect(fixture.update).toHaveBeenCalledOnce();
  });

  it('purges a later expired session while preserving the failed one for retry', async () => {
    recordings.push(expired('second'));
    fixture.send.mockRejectedValueOnce(Object.assign(new Error('Synthetic denial'), { name: 'AccessDenied' }));

    expect(await purgeExpiredRecordings()).toEqual({ purgedCount: 1, freedSpaceBytes: 0 });
    expect(recordings.map(recording => recording.recordingUrl)).toEqual(['recordings/first.mp3', null]);
    expect(fixture.update).toHaveBeenCalledOnce();
    expect(fixture.update).toHaveBeenCalledWith({
      where: { id: 'second' }, data: { recordingUrl: null },
    });

    expect(await purgeExpiredRecordings()).toEqual({ purgedCount: 1, freedSpaceBytes: 0 });
    expect(recordings.every(recording => recording.recordingUrl === null)).toBe(true);
  });

  it('retries deletion if metadata persistence fails after a successful object deletion', async () => {
    fixture.update.mockRejectedValueOnce(new Error('Synthetic metadata failure'));

    await expect(purgeExpiredRecordings()).rejects.toThrow('Synthetic metadata failure');
    expect(recordings[0].recordingUrl).toBe('recordings/first.mp3');
    expect(await purgeExpiredRecordings()).toEqual({ purgedCount: 1, freedSpaceBytes: 0 });
    expect(recordings[0].recordingUrl).toBeNull();
    expect(fixture.send).toHaveBeenCalledTimes(2);
  });

  it('preserves successful local-file deletion and freed-space accounting', async () => {
    fixture.env.S3_KEY = '';
    fixture.existsSync.mockReturnValue(true);
    fixture.stat.mockResolvedValue({ size: 321 });
    fixture.unlink.mockResolvedValue(undefined);

    expect(await purgeExpiredRecordings()).toEqual({ purgedCount: 1, freedSpaceBytes: 321 });
    expect(fixture.unlink).toHaveBeenCalledWith(path.resolve(fixture.env.RECORDINGS_DIR, 'first.mp3'));
    expect(recordings[0].recordingUrl).toBeNull();
    expect(fixture.send).not.toHaveBeenCalled();
  });

  it('clears metadata for an already-absent local file', async () => {
    fixture.env.S3_KEY = '';
    fixture.existsSync.mockReturnValue(false);

    expect(await purgeExpiredRecordings()).toEqual({ purgedCount: 1, freedSpaceBytes: 0 });
    expect(recordings[0].recordingUrl).toBeNull();
    expect(fixture.unlink).not.toHaveBeenCalled();
    expect(fixture.send).not.toHaveBeenCalled();
  });

  it('preserves local metadata after an unlink failure and continues to a later session', async () => {
    fixture.env.S3_KEY = '';
    recordings.push(expired('second'));
    fixture.existsSync.mockReturnValue(true);
    fixture.stat.mockResolvedValue({ size: 321 });
    fixture.unlink.mockRejectedValueOnce(new Error('Synthetic local permission failure'))
      .mockResolvedValueOnce(undefined);

    expect(await purgeExpiredRecordings()).toEqual({ purgedCount: 1, freedSpaceBytes: 321 });
    expect(recordings.map(recording => recording.recordingUrl)).toEqual(['recordings/first.mp3', null]);
    expect(fixture.send).not.toHaveBeenCalled();
  });
  it('purges old and losing segments even with no latest URL, retaining failed keys for retry', async () => {
    recordings = [{ ...expired('history'), recordingUrl: null, recordingKeys: ['recordings/old.mp3','recordings/loser.mp3'] }];
    fixture.send.mockRejectedValueOnce(new Error('Synthetic unavailable object')).mockResolvedValue({});
    expect(await purgeExpiredRecordings()).toEqual({ purgedCount: 1, freedSpaceBytes: 0 });
    expect(recordings[0].recordingKeys).toEqual(['recordings/old.mp3']);
    expect(await purgeExpiredRecordings()).toEqual({ purgedCount: 1, freedSpaceBytes: 0 });
    expect(recordings[0].recordingKeys).toEqual([]);
  });
  it('does not discard a key appended by a late webhook during deletion', async () => {
    recordings[0].recordingKeys = ['recordings/first.mp3'];
    fixture.send.mockImplementationOnce(async () => { recordings[0].recordingKeys!.push('recordings/late.mp3'); });
    await purgeExpiredRecordings();
    expect(recordings[0].recordingKeys).toEqual(['recordings/late.mp3']);
  });
});
