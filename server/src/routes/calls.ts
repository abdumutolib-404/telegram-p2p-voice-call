import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../config/database';
import { env } from '../config/env';
import { initDataLockdownMiddleware, type AuthenticatedTelegramRequest } from '../middleware/initDataLockdown';

const router = Router();
const recordingsRoot = path.resolve(env.RECORDINGS_DIR);

function resolveRecordingPath(recordingUrl: string): string | null {
  const normalized = recordingUrl.replace(/^recordings[\\/]/, '');
  const resolved = path.resolve(recordingsRoot, normalized);
  const relative = path.relative(recordingsRoot, resolved);
  if (relative === '' || path.isAbsolute(relative) || relative === '..' || relative.startsWith(`..${path.sep}`)) return null;
  return resolved;
}

router.get('/recording/:sessionId', initDataLockdownMiddleware, async (req: AuthenticatedTelegramRequest, res) => {
  try {
    const sessionId = req.params.sessionId;
    const tgUser = req.telegramUser;
    if (!sessionId || !tgUser) {
      res.status(401).json({ error: 'Unauthorized.' });
      return;
    }

    const session = await prisma.callSession.findUnique({
      where: { id: sessionId },
      include: { userA: true, userB: true },
    });

    if (!session?.recordingUrl || (session.recordingExpiresAt !== null && session.recordingExpiresAt <= new Date())) {
      res.status(404).json({ error: 'Recording not found or expired.' });
      return;
    }

    if (session.userA.telegramId !== tgUser.id && session.userB.telegramId !== tgUser.id) {
      res.status(403).json({ error: 'Forbidden.' });
      return;
    }

    const filePath = resolveRecordingPath(session.recordingUrl);
    if (!filePath || !fs.existsSync(filePath)) {
      res.status(404).json({ error: 'Recording file missing from server disk.' });
      return;
    }

    res.sendFile(filePath, (error?: Error) => {
      if (!error || res.headersSent) return;
      console.error('[Calls] recording_stream_failed', { sessionId, error: error.message });
    });
  } catch (error: unknown) {
    console.error('[Calls] recording_lookup_failed', {
      sessionId: req.params.sessionId,
      error: error instanceof Error ? error.message : 'unknown_error',
    });
    if (!res.headersSent) res.status(500).json({ error: 'Internal server error.' });
  }
});

export default router;
