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
      try {
        const filePath = path.isAbsolute(session.recordingUrl)
          ? session.recordingUrl
          : path.join(process.cwd(), session.recordingUrl);

        if (fs.existsSync(filePath)) {
          const stats = fs.statSync(filePath);
          freedSpaceBytes += stats.size;
          fs.unlinkSync(filePath);
        }
      } catch (err) {
        console.warn(`[Storage Purge] Could not delete file for session ${session.id}:`, err);
      }
    }

    // Update database record clearing recordingUrl
    await prisma.callSession.update({
      where: { id: session.id },
      data: {
        recordingUrl: null,
      },
    });

    purgedCount++;
  }

  console.log(`[Storage Purge] Completed daily purge: ${purgedCount} files removed, ${freedSpaceBytes} bytes freed.`);
  return { purgedCount, freedSpaceBytes };
}

export function startStoragePurgeCron() {
  // Run daily at midnight UTC: 0 0 * * *
  cron.schedule('0 0 * * *', async () => {
    console.log('[Storage Purge Cron] Running daily audio retention cleanup job...');
    await purgeExpiredRecordings();
  });
  console.log('[Storage Purge Cron] Storage cleanup cron scheduled.');
}
