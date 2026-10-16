import { Router } from 'express';
import { ZodError } from 'zod';
import { prisma } from '../config/database';
import { adminAuthMiddleware, type AdminAuthenticatedRequest } from '../middleware/adminAuth';
import { createActionRateLimiter } from '../middleware/rateLimit';
import { readNotificationConfiguration, saveNotificationConfiguration } from '../services/notificationConfiguration';
import { createNotificationBroadcast } from '../services/optionalNotifications';
import { optionalNotificationPreviews } from '../contracts/notifications';

const router = Router();
router.use(adminAuthMiddleware);
router.get('/', async (_req, res, next) => {
  try {
    const [configuration, jobs, broadcasts] = await Promise.all([
      readNotificationConfiguration(),
      prisma.notificationJob.findMany({ where: { category: { in: ['INACTIVITY', 'CHECKOUT', 'PEAK', 'CHANNEL'] } }, orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, category: true, status: true, failure: true, createdAt: true, nextAttemptAt: true } }),
      prisma.notificationBroadcast.findMany({ orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, kind: true, messageId: true, completed: true, expiresAt: true, createdAt: true } }),
    ]);
    res.json({ configuration, previews: optionalNotificationPreviews, jobs, broadcasts });
  } catch (error) { next(error); }
});
router.patch('/', async (req: AdminAuthenticatedRequest, res, next) => {
  try { res.json({ configuration: await saveNotificationConfiguration(req.body, req.adminUser!.telegramId) }); }
  catch (error) { if (error instanceof ZodError) res.status(400).json({ error: 'Set every notification category to on or off.' }); else next(error); }
});
router.post('/channel', createActionRateLimiter('BOT_BUTTON', req => (req as AdminAuthenticatedRequest).adminUser!.telegramId), async (req: AdminAuthenticatedRequest, res, next) => {
  try { res.json({ broadcast: await createNotificationBroadcast(req.body, req.adminUser!.telegramId) }); }
  catch (error) { if (error instanceof ZodError) res.status(400).json({ error: 'Enter a valid channel post number.' }); else if (error instanceof Error && /Offer posts|another announcement/.test(error.message)) res.status(409).json({ error: error.message }); else next(error); }
});
export default router;
