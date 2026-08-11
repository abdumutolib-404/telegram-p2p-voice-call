import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { prisma } from '../config/database';

const router = Router();

import { initDataLockdownMiddleware, AuthenticatedTelegramRequest } from '../middleware/initDataLockdown';

// Stream or download audio recording file (Protected)
router.get('/recording/:sessionId', initDataLockdownMiddleware, async (req: AuthenticatedTelegramRequest, res) => {
  const { sessionId } = req.params;
  const tgUser = req.telegramUser;

  if (!tgUser) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  const session = await prisma.callSession.findUnique({
    where: { id: sessionId },
    include: { userA: true, userB: true },
  });

  if (!session || !session.recordingUrl) {
    return res.status(404).json({ error: 'Recording not found or expired.' });
  }

  // Authorization check: requester must be userA or userB of this call
  const requesterTelegramId = BigInt(tgUser.id);
  if (session.userA.telegramId !== requesterTelegramId && session.userB.telegramId !== requesterTelegramId) {
    return res.status(403).json({ error: 'Forbidden: You were not a participant in this practice session.' });
  }

  const filePath = path.isAbsolute(session.recordingUrl)
    ? session.recordingUrl
    : path.join(process.cwd(), session.recordingUrl);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Recording file missing from server disk.' });
  }

  res.sendFile(filePath);
});

export default router;
