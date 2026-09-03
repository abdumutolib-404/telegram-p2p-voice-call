import cron from 'node-cron';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { prisma } from '../config/database';
import { env } from '../config/env';
import { isS3Configured, deleteS3Object } from './s3Storage';
import { logger } from '../utils/logger';

const recordingsRoot = path.resolve(env.RECORDINGS_DIR);

function resolveSafeRecordingPath(recordingUrl: string): string | null {
  const normalized = recordingUrl.replace(/^recordings[\\/]/, '');
  const resolved = path.resolve(recordingsRoot, normalized);
  const relative = path.relative(recordingsRoot, resolved);
  if (relative === '' || path.isAbsolute(relative) || relative === '..' || relative.startsWith(`..${path.sep}`)) {
    return null;
  }
  return resolved;
}

export async function purgeExpiredRecordings(): Promise<{ purgedCount: number; freedSpaceBytes: number }> {
  const now = new Date();
  const cutoffDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
  let purgedCount = 0;
  let freedSpaceBytes = 0;

  // Find all call sessions with expired recordings or abandoned sessions older than 24h
  const expiredSessions = await prisma.callSession.findMany({
    where: {
      recordingUrl: { not: null },
      OR: [
        { recordingExpiresAt: { lte: now } },
        { recordingExpiresAt: null, createdAt: { lte: cutoffDate } },
      ],
    },
  });

  for (const session of expiredSessions) {
    if (session.recordingUrl) {
      let fileDeleted = false;

      // 1. If S3 is configured
      if (isS3Configured()) {
        try {
          await deleteS3Object(session.recordingUrl);
          fileDeleted = true;
        } catch (s3Err) {
          logger.warn(`Could not delete S3 object for session ${session.id}`, {
            service: 'storage',
            event: 'storage_purge_s3_failed',
            sessionId: session.id,
          }, s3Err);
        }
      } else {
        // 2. Local filesystem cleanup
        try {
          const filePath = resolveSafeRecordingPath(session.recordingUrl);
          if (!filePath) {
            logger.warn(`Path traversal or invalid recordingUrl for session ${session.id}: ${session.recordingUrl}`, {
              service: 'storage',
              event: 'storage_purge_invalid_path',
              sessionId: session.id,
              recordingUrl: session.recordingUrl,
            });
            await prisma.callSession.update({
              where: { id: session.id },
              data: { recordingUrl: null },
            });
            purgedCount++;
            continue;
          }

          if (fsSync.existsSync(filePath)) {
            const stats = await fs.stat(filePath);
            await fs.unlink(filePath);
            freedSpaceBytes += stats.size;
            fileDeleted = true;
          } else {
            // File does not exist on disk (already cleaned up or never written)
            fileDeleted = true;
          }
        } catch (err) {
          logger.warn(`Could not delete file for session ${session.id}`, {
            service: 'storage',
            event: 'storage_purge_file_failed',
            sessionId: session.id,
          }, err);
          continue;
        }
      }

      if (fileDeleted) {
        await prisma.callSession.update({
          where: { id: session.id },
          data: { recordingUrl: null },
        });
        purgedCount++;
      }
    }
  }

  logger.info(`Completed daily purge: ${purgedCount} files removed, ${freedSpaceBytes} bytes freed.`, {
    service: 'storage',
    event: 'storage_purge_completed',
    purgedCount,
    freedSpaceBytes,
  });
  return { purgedCount, freedSpaceBytes };
}

export function startStoragePurgeCron() {
  // Run daily at midnight UTC: 0 0 * * *
  cron.schedule('0 0 * * *', async () => {
    logger.info('Running daily audio retention cleanup job...', {
      service: 'storage',
      event: 'storage_purge_cron_start',
    });
    try {
      await purgeExpiredRecordings();
    } catch (err) {
      logger.error('Purge job failed', {
        service: 'storage',
        event: 'storage_purge_cron_failed',
      }, err);
    }
  });
  logger.info('Storage cleanup cron scheduled.', {
    service: 'storage',
    event: 'storage_purge_cron_scheduled',
  });
}
