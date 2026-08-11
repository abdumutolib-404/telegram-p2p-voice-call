import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { prisma } from '../config/database';

const router = Router();

// Stream or download audio recording file
router.get('/recording/:sessionId', async (req, res) => {
  const { sessionId } = req.params;

  const session = await prisma.callSession.findUnique({
    where: { id: sessionId },
  });

  if (!session || !session.recordingUrl) {
    return res.status(404).json({ error: 'Recording not found or expired.' });
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
