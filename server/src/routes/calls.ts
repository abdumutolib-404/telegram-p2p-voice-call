import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../config/database';
import { env } from '../config/env';
import { initDataLockdownMiddleware, type AuthenticatedTelegramRequest } from '../middleware/initDataLockdown';
import { generateLiveKitToken } from '../config/livekit';
import { getEffectiveEntitlement, calculateEffectiveCallDuration } from '../services/plan';
import { createCanonicalError } from '../types/canonical';
import { isS3Configured, generatePresignedDownloadUrl, checkS3ObjectExists } from '../services/s3Storage';

const router = Router();
const recordingsRoot = path.resolve(env.RECORDINGS_DIR);

function resolveRecordingPath(recordingUrl: string): string | null {
  const normalized = recordingUrl.replace(/^recordings[\\/]/, '');
  const resolved = path.resolve(recordingsRoot, normalized);
  const relative = path.relative(recordingsRoot, resolved);
  if (relative === '' || path.isAbsolute(relative) || relative === '..' || relative.startsWith(`..${path.sep}`)) return null;
  return resolved;
}

const handleRecordingRetrieval = async (req: AuthenticatedTelegramRequest, res: any) => {
  try {
    const sessionId = req.params.sessionId;
    const tgUser = req.telegramUser;
    if (!sessionId || !tgUser) {
      res.status(401).json(createCanonicalError('UNAUTHORIZED', 'Authentication required to access recordings.'));
      return;
    }

    const session = await prisma.callSession.findUnique({
      where: { id: sessionId },
      include: { userA: true, userB: true },
    });

    if (!session?.recordingUrl || (session.recordingExpiresAt !== null && session.recordingExpiresAt <= new Date())) {
      res.status(404).json(createCanonicalError('RECORDING_UNAVAILABLE', 'Recording not found or expired.'));
      return;
    }

    const requesterIdStr = tgUser.id.toString();
    if (session.userA.telegramId.toString() !== requesterIdStr && session.userB.telegramId.toString() !== requesterIdStr) {
      res.status(403).json(createCanonicalError('CALL_UNAUTHORIZED', 'Access denied to this recording.'));
      return;
    }

    const requesterUser = session.userA.telegramId.toString() === requesterIdStr ? session.userA : session.userB;
    const allowedRetentionDays = getEffectiveEntitlement(requesterUser).retentionDays;
    const sessionAgeMs = Date.now() - session.createdAt.getTime();
    if (sessionAgeMs > allowedRetentionDays * 24 * 60 * 60 * 1000) {
      res.status(403).json(createCanonicalError('RECORDING_UNAVAILABLE', 'Recording retention expired for your plan level.'));
      return;
    }

    // 1. S3 Cloud Storage Retrieval
    if (isS3Configured()) {
      const existsInfo = await checkS3ObjectExists(session.recordingUrl);
      if (!existsInfo.exists) {
        res.status(404).json(createCanonicalError('RECORDING_UNAVAILABLE', 'Audio recording is not yet ready or unavailable in storage.'));
        return;
      }

      const presignedUrl = await generatePresignedDownloadUrl(session.recordingUrl, 3600);
      if (req.query.format === 'json' || req.headers.accept?.includes('application/json')) {
        res.json({
          url: presignedUrl,
          size: existsInfo.size,
          contentType: existsInfo.contentType || 'audio/mpeg',
          expiresInSeconds: 3600,
        });
        return;
      }

      res.redirect(302, presignedUrl);
      return;
    }

    // 2. Local Filesystem Retrieval (Fallback for self-hosted)
    const filePath = resolveRecordingPath(session.recordingUrl);
    if (!filePath || !fs.existsSync(filePath)) {
      res.status(404).json(createCanonicalError('RECORDING_UNAVAILABLE', 'Audio recording is no longer available.'));
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
    if (!res.headersSent) {
      res.status(500).json(createCanonicalError('INTERNAL_ERROR', 'Unable to retrieve recording at this time.'));
    }
  }
};

router.get('/recording/:sessionId', initDataLockdownMiddleware, handleRecordingRetrieval);
router.get('/:sessionId/recording', initDataLockdownMiddleware, handleRecordingRetrieval);

router.get('/active', initDataLockdownMiddleware, async (req: AuthenticatedTelegramRequest, res) => {
  try {
    const tgUser = req.telegramUser;
    if (!tgUser) {
      res.status(401).json(createCanonicalError('UNAUTHORIZED', 'Authentication required.'));
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

    const callDurationLimitMinutes = calculateEffectiveCallDuration(self, partner);
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
      callDurationLimit: remainingSeconds,
    });
  } catch (error: unknown) {
    console.error('[Calls] active_session_lookup_failed', {
      error: error instanceof Error ? error.message : 'unknown_error',
    });
    res.status(500).json(createCanonicalError('INTERNAL_ERROR', 'Failed to retrieve active session.'));
  }
});

export default router;
