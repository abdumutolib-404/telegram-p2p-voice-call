import cron from 'node-cron';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { prisma } from '../config/database';
import { env } from '../config/env';

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

      try {
        const filePath = resolveSafeRecordingPath(session.recordingUrl);
        if (!filePath) {
          console.warn(`[Storage Purge] Path traversal or invalid recordingUrl for session ${session.id}: ${session.recordingUrl}`);
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
        console.warn(`[Storage Purge] Could not delete file for session ${session.id}:`, err);
        continue;
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

  console.log(`[Storage Purge] Completed daily purge: ${purgedCount} files removed, ${freedSpaceBytes} bytes freed.`);
  return { purgedCount, freedSpaceBytes };
}

export function startStoragePurgeCron() {
  // Run daily at midnight UTC: 0 0 * * *
  cron.schedule('0 0 * * *', async () => {
    console.log('[Storage Purge Cron] Running daily audio retention cleanup job...');
    try {
      await purgeExpiredRecordings();
    } catch (err) {
      console.error('[Storage Purge Cron] Purge job failed:', err);
    }
  });
  console.log('[Storage Purge Cron] Storage cleanup cron scheduled.');
}
