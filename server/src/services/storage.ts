import cron from 'node-cron';
import fs from 'fs';
import path from 'path';
import { prisma } from '../config/database';

export async function purgeExpiredRecordings(): Promise<{ purgedCount: number; freedSpaceBytes: number }> {
  const now = new Date();
  let purgedCount = 0;
  let freedSpaceBytes = 0;

  // Find all call sessions with expired recordings
  const expiredSessions = await prisma.callSession.findMany({
    where: {
      recordingUrl: { not: null },
      recordingExpiresAt: {
        lte: now,
      },
    },
  });

  for (const session of expiredSessions) {
    if (session.recordingUrl) {
      let fileDeleted = false;

      try {
        const filePath = path.isAbsolute(session.recordingUrl)
          ? session.recordingUrl
          : path.join(process.cwd(), session.recordingUrl);

        if (fs.existsSync(filePath)) {
          const stats = fs.statSync(filePath);
          fs.unlinkSync(filePath);
          freedSpaceBytes += stats.size;
          fileDeleted = true;
        } else {
          // File doesn't exist on disk (already cleaned or never written)
          fileDeleted = true;
        }
      } catch (err) {
        console.warn(`[Storage Purge] Could not delete file for session ${session.id}:`, err);
        // Do NOT clear the DB reference if the file couldn't be deleted —
        // this prevents "orphaned files" that leak disk space forever
        continue;
      }

      // Only clear the DB reference if the file was successfully removed
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
