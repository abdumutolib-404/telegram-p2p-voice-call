import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../config/database';
import { env } from '../config/env';
import { initDataLockdownMiddleware, type AuthenticatedTelegramRequest } from '../middleware/initDataLockdown';
import { generateLiveKitToken } from '../config/livekit';
import { calculateMixedPlanDuration, getRetentionDaysForPlan } from '../services/plan';

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

    const requesterIdStr = tgUser.id.toString();
    if (session.userA.telegramId.toString() !== requesterIdStr && session.userB.telegramId.toString() !== requesterIdStr) {
      res.status(403).json({ error: 'Forbidden.' });
      return;
    }

    const requesterUser = session.userA.telegramId.toString() === requesterIdStr ? session.userA : session.userB;
    const allowedRetentionDays = getRetentionDaysForPlan(requesterUser.plan);
    const sessionAgeMs = Date.now() - session.createdAt.getTime();
    if (sessionAgeMs > allowedRetentionDays * 24 * 60 * 60 * 1000) {
      res.status(403).json({ error: 'Recording retention expired for your plan level.' });
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

router.get('/active', initDataLockdownMiddleware, async (req: AuthenticatedTelegramRequest, res) => {
  try {
    const tgUser = req.telegramUser;
    if (!tgUser) {
      res.status(401).json({ error: 'Unauthorized.' });
      return;
    }

    const requesterId = BigInt(tgUser.id);
    const session = await prisma.callSession.findFirst({
      where: {
        status: 'ACTIVE',
        OR: [{ userA: { telegramId: requesterId } }, { userB: { telegramId: requesterId } }],
      },
      include: { userA: true, userB: true },
    });

    if (!session) {
      res.json({ hasActiveCall: false });
      return;
    }

    const isUserA = session.userA.telegramId === requesterId;
    const self = isUserA ? session.userA : session.userB;
    const partner = isUserA ? session.userB : session.userA;

    const callDurationLimitMinutes = calculateMixedPlanDuration(self.plan, partner.plan);
    const callDurationLimitSeconds = callDurationLimitMinutes * 60;
    const elapsedSeconds = Math.floor((Date.now() - session.createdAt.getTime()) / 1000);
    const remainingSeconds = Math.max(1, callDurationLimitSeconds - elapsedSeconds);

    const tokenTtlSeconds = Math.min(3600, Math.max(60, remainingSeconds + 300));
    const livekitToken = await generateLiveKitToken(session.roomName, self.id, self.alias, tokenTtlSeconds);

    res.json({
      hasActiveCall: true,
      roomName: session.roomName,
      livekitToken,
      partnerAlias: partner.alias,
      partnerBand: partner.band,
      callDurationLimit: remainingSeconds, // remaining duration in seconds
    });
  } catch (error: unknown) {
    console.error('[Calls] active_session_lookup_failed', {
      error: error instanceof Error ? error.message : 'unknown_error',
    });
    res.status(500).json({ error: 'Failed to check active call session.' });
  }
});

export default router;
