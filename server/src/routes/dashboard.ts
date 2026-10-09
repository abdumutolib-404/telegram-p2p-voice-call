import crypto from 'node:crypto';
import { Router, type Request, type Response, type NextFunction } from 'express';
import { Bot, InlineKeyboard } from 'grammy';
import { z } from 'zod';
import { prisma } from '../config/database';
import { env } from '../config/env';
import { publishGatewayCommand } from '../config/redis';
import { initDataLockdownMiddleware } from '../middleware/initDataLockdown';
import { requireRegisteredMember, type MemberRequest } from '../middleware/registeredMember';
import { createActionRateLimiter } from '../middleware/rateLimit';
import { getEffectiveEntitlement, getUserCallsUsedThisPeriod, getUserRecordingsUsedThisPeriod, calculateEffectiveCallDuration } from '../services/plan';
import { getActiveBonusCallsCount, getReferralStats, getContestStatus } from '../services/referralService';
import { hasAcceptedCurrentTerms, currentTerms } from '../services/terms';
import { saveCallQualityRating } from '../services/callFeedback';
import { moderationService } from '../services/moderation';
import { admitCall, activatePendingCall } from '../services/callAdmission';
import { notificationQueue } from '../bot/notifications';
import type { MyContext } from '../bot/types';
import { scheduleConnectionHandshakeTimer, setRoomDurationLimit } from '../socket/signaling';
import { isUserSessionRecorder } from '../utils/recordingAccess';
import { lockRow } from '../utils/transactionLock';
import { sendLegacyRecording } from '../services/recordingDelivery';

const router = Router();
let dashboardBot: Bot<MyContext> | null = null;
export function setDashboardBot(bot: Bot<MyContext> | null): void { dashboardBot = bot; }
router.use(initDataLockdownMiddleware, requireRegisteredMember);
router.use(createActionRateLimiter('BOT_BUTTON', req => (req as MemberRequest).member!.id));
class ActionError extends Error { constructor(public status: number, message: string) { super(message); } }
const action = (handler: (req: MemberRequest, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) => {
  void handler(req as MemberRequest, res).catch(error => {
    if (error instanceof z.ZodError) { res.status(400).json({ error: 'Check the submitted values.' }); return; }
    if (error instanceof ActionError) { res.status(error.status).json({ error: error.message }); return; }
    next(error);
  });
};
const identifier = z.string().uuid();
async function ownSession(id: string, userId: string) {
  identifier.parse(id);
  const session = await prisma.callSession.findFirst({ where: { id, OR: [{ userAId: userId }, { userBId: userId }] }, include: { userA: true, userB: true, ratings: true } });
  if (!session) throw new ActionError(404, 'Session not found.');
  return session;
}
async function sessionSummary(session: Awaited<ReturnType<typeof ownSession>>, userId: string, retentionDays: number, savedPartnerIds?: ReadonlySet<string>) {
  const partner = session.userAId === userId ? session.userB : session.userA;
  const rating = session.ratings.find(item => item.raterId === userId && !item.reported);
  const expiry = Math.min(session.recordingExpiresAt?.getTime() ?? Infinity, (session.endedAt ?? session.createdAt).getTime() + retentionDays * 86400000);
  const segments = await prisma.recordingSegment.findMany({where:{callId:session.id,status:"READY",ownerIds:{has:userId},expiresAt:{gt:new Date()}},orderBy:{createdAt:"asc"}});
  const recipientExpiry=(session.endedAt??session.createdAt).getTime()+retentionDays*86400000;
  const recordings = recipientExpiry > Date.now() ? segments.map(segment=>({id:segment.id,createdAt:segment.createdAt,expiresAt:new Date(Math.min(segment.expiresAt!.getTime(),recipientExpiry))})) : [];
  const recordingAvailable = Boolean(session.recordingUrl && expiry > Date.now() && (!session.recordedByUserId || isUserSessionRecorder(session.recordedByUserId, userId)));
  return { id: session.id, partnerAlias: partner.alias, partnerBand: partner.band, status: session.status, duration: session.duration, createdAt: session.createdAt, endedAt: session.endedAt, recordings, rating: rating?.stars ?? null, reported: session.ratings.some(item => item.raterId === userId && item.reported), saved: savedPartnerIds?.has(partner.id) ?? false, recordingAvailable, recordingExpiresAt: recordingAvailable ? new Date(expiry) : null };
}

router.get('/summary', action(async (req, res) => {
  const user = req.member!;
  const entitlement = getEffectiveEntitlement(user);
  const [callsUsed, recordingsUsed, bonus] = await Promise.all([getUserCallsUsedThisPeriod(user.id, user), getUserRecordingsUsedThisPeriod(user.id, user), getActiveBonusCallsCount(user.id)]);
  res.json({ user: { userId: user.id, alias: user.alias, band: user.band, subFC: user.subFC, subLR: user.subLR, subGRA: user.subGRA, subP: user.subP, plan: entitlement.plan, planExpiresAt: user.subscriptionExpiresAt, dnd: user.dnd, callsRemaining: Math.max(0, entitlement.callLimit - callsUsed) + bonus, totalCallsLimit: entitlement.callLimit, maxCallDuration: entitlement.maxCallDuration, recordingsRemaining: Math.max(0, entitlement.recordingLimit - recordingsUsed), recordingsLimit: entitlement.recordingLimit, recordingRetentionDays: entitlement.retentionDays }, terms: { version: currentTerms.version, acceptedAt: user.termsAcceptedAt, url: currentTerms.termsUrl } });
}));

const band = z.number().min(0).max(9).refine(value => Number.isInteger(value * 2));
const preferences = z.object({ dnd: z.boolean().optional(), subFC: band.optional(), subLR: band.optional(), subGRA: band.optional(), subP: band.optional() }).strict().refine(data => Object.keys(data).length > 0).refine(data => [data.subFC, data.subLR, data.subGRA, data.subP].every(value => value === undefined) || [data.subFC, data.subLR, data.subGRA, data.subP].every(value => value !== undefined));
router.patch('/account', action(async (req, res) => {
  const data = preferences.parse(req.body);
  const overall = data.subFC === undefined ? undefined : Math.round((data.subFC + data.subLR! + data.subGRA! + data.subP!) / 4 * 2) / 2;
  await prisma.user.update({ where: { id: req.member!.id }, data: { ...data, ...(overall === undefined ? {} : { band: overall }) } });
  res.json({ success: true });
}));

router.get('/sessions', action(async (req, res) => {
  const cursor = req.query.cursor === undefined ? undefined : identifier.parse(req.query.cursor);
  if (cursor) await ownSession(cursor, req.member!.id);
  const sessions = await prisma.callSession.findMany({ where: { status: { in: ['COMPLETED', 'CANCELLED', 'DECLINED'] }, OR: [{ userAId: req.member!.id }, { userBId: req.member!.id }] }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), take: 21, include: { userA: true, userB: true, ratings: true } });
  const retention = getEffectiveEntitlement(req.member!).retentionDays;
  const savedRows = await prisma.favoritePartner.findMany({ where: { userId: req.member!.id }, select: { partnerId: true } });
  const savedPartnerIds = new Set(savedRows.map(row => row.partnerId));
  res.json({ sessions: await Promise.all(sessions.slice(0, 20).map(session => sessionSummary(session, req.member!.id, retention, savedPartnerIds))), nextCursor: sessions.length > 20 ? sessions[19].id : null });
}));
router.get('/sessions/:id', action(async (req, res) => {
  const session = await ownSession(req.params.id, req.member!.id);
  const partnerId = session.userAId === req.member!.id ? session.userBId : session.userAId;
  const saved = await prisma.favoritePartner.findUnique({ where: { userId_partnerId: { userId: req.member!.id, partnerId } }, select: { partnerId: true } });
  res.json({ session: await sessionSummary(session, req.member!.id, getEffectiveEntitlement(req.member!).retentionDays, new Set(saved ? [saved.partnerId] : [])) });
}));
router.post('/sessions/:id/recording-delivery', action(async (req, res) => {
  const { segmentId } = z.object({ segmentId: identifier.optional() }).strict().parse(req.body);
  const user = req.member!;
  const session = await ownSession(req.params.id, user.id);
  const now = new Date();
  const retentionDays = getEffectiveEntitlement(user).retentionDays;
  if (!['COMPLETED', 'CANCELLED'].includes(session.status) || now.getTime() >= (session.endedAt ?? session.createdAt).getTime() + retentionDays * 86400000) {
    throw new ActionError(404, 'This recording is no longer available.');
  }
  const segment = segmentId
    ? await prisma.recordingSegment.findUnique({ where: { id: segmentId } })
    : await prisma.recordingSegment.findFirst({ where: { callId: session.id, status: 'READY', ownerIds: { has: user.id }, expiresAt: { gt: now } }, orderBy: { createdAt: 'desc' } });
  if (segmentId && !segment) throw new ActionError(404, 'This recording is no longer available.');
  if (segment) {
    if (segment.callId !== session.id || segment.status !== 'READY' || !segment.ownerIds.includes(user.id) || !segment.expiresAt || segment.expiresAt <= now) {
      throw new ActionError(404, 'This recording is no longer available.');
    }
    if (!dashboardBot) throw new ActionError(503, 'Telegram delivery is temporarily unavailable. Please retry.');
    const delivery = await prisma.$transaction(async tx => {
      // Preserve automatic delivery to every consenting recorder. Creating only
      // one job would make the worker's "no deliveries yet" scan skip the others.
      const jobs = await Promise.all(segment.ownerIds.map(ownerId => tx.recordingDelivery.upsert({ where: { segmentId_userId: { segmentId: segment.id, userId: ownerId } }, create: { segmentId: segment.id, userId: ownerId }, update: {} })));
      return jobs.find(job => job.userId === user.id)!;
    });
    if (delivery.status === 'EXPIRED') throw new ActionError(404, 'This recording is no longer available.');
    const status = delivery.status === 'DONE' ? 'SENT' : 'QUEUED';
    res.status(status === 'SENT' ? 200 : 202).json({ status });
    return;
  }
  // Older recordings predate segments; retain access checks before sending the file.
  if (!session.recordingUrl || (session.recordingExpiresAt && session.recordingExpiresAt <= now) || (session.recordedByUserId && !isUserSessionRecorder(session.recordedByUserId, user.id))) {
    throw new ActionError(404, 'This recording is no longer available.');
  }
  if (!dashboardBot) throw new ActionError(503, 'Telegram delivery is temporarily unavailable. Please retry.');
  try { await sendLegacyRecording(dashboardBot, user.telegramId, session.recordingUrl); }
  catch { throw new ActionError(503, 'Audio could not be sent to Telegram. Please retry later.'); }
  res.json({ status: 'SENT' });
}));
router.post('/sessions/:id/rating', action(async (req, res) => {
  const { stars } = z.object({ stars: z.number().int().min(1).max(5) }).strict().parse(req.body);
  const session = await ownSession(req.params.id, req.member!.id);
  if (session.status !== 'COMPLETED') throw new ActionError(409, 'Rate a completed conversation.');
  const result = await saveCallQualityRating(session.id, req.member!.id, stars);
  if (result !== 'CREATED') throw new ActionError(409, 'This conversation has already been rated.');
  res.json({ success: true });
}));
router.post('/sessions/:id/report', action(async (req, res) => {
  const { reason } = z.object({ reason: z.enum(['Harassment', 'Hate speech', 'Explicit content', 'Spam or solicitation', 'Other unsafe behavior']) }).strict().parse(req.body);
  const session = await ownSession(req.params.id, req.member!.id);
  if (session.status !== 'COMPLETED') throw new ActionError(409, 'Finish or leave the conversation before reporting.');
  if (session.ratings.some(item => item.raterId === req.member!.id && item.reported)) throw new ActionError(409, 'You already reported this conversation.');
  try { await moderationService.processReport(session.userAId === req.member!.id ? session.userBId : session.userAId, req.member!.id, session.id, reason); }
  catch (error) { if (error instanceof Error && error.message === 'You have already reported this user for this call') throw new ActionError(409, error.message); throw error; }
  res.json({ success: true });
}));
router.get('/favorites', action(async (req, res) => {
  const favorites = await prisma.favoritePartner.findMany({ where: { userId: req.member!.id }, take: 100, orderBy: { createdAt: 'desc' }, include: { partner: true } });
  res.json({ favorites: favorites.map(({ partner }) => ({ id: partner.id, alias: partner.alias, band: partner.band, available: partner.onboarded && hasAcceptedCurrentTerms(partner) && !partner.dnd && !partner.isPermanentlyBanned && !(partner.isBanned && (!partner.bannedUntil || partner.bannedUntil > new Date())) })) });
}));
router.post('/sessions/:id/favorite', action(async (req, res) => {
  const session = await ownSession(req.params.id, req.member!.id);
  if (session.status !== 'COMPLETED') throw new ActionError(409, 'Save a partner after a completed conversation.');
  const userId = req.member!.id;
  const partnerId = session.userAId === userId ? session.userBId : session.userAId;
  await prisma.$transaction(async tx => {
    await lockRow(tx, 'User', userId);
    const existing = await tx.favoritePartner.findUnique({ where: { userId_partnerId: { userId, partnerId } } });
    if (!existing && await tx.favoritePartner.count({ where: { userId } }) >= 100) throw new ActionError(409, 'You can save up to 100 partners.');
    await tx.favoritePartner.upsert({ where: { userId_partnerId: { userId, partnerId } }, create: { userId, partnerId }, update: {} });
  });
  res.json({ success: true });
}));
router.delete('/favorites/:id', action(async (req, res) => {
  await prisma.favoritePartner.deleteMany({ where: { userId: req.member!.id, partnerId: identifier.parse(req.params.id) } });
  res.json({ success: true });
}));
router.get('/community', action(async (req, res) => {
  const [referrals, contest] = await Promise.all([getReferralStats(req.member!.id), getContestStatus()]);
  res.json({ referrals, referralPayload: `ref_${req.member!.telegramId}`, contest: { ...contest, leaderboard: contest.leaderboard.map(row => ({ rank: row.rank, alias: row.alias, invitesCount: row.invitesCount })) } });
}));

router.get('/invitations', action(async (req, res) => {
  const sessions = await prisma.callSession.findMany({ where: { status: { in: ['PENDING', 'ACTIVE'] }, OR: [{ userAId: req.member!.id }, { userBId: req.member!.id }], createdAt: { gte: new Date(Date.now() - 120000) } }, include: { userA: true, userB: true }, take: 5 });
  res.json({ invitations: sessions.filter(session => session.roomName.startsWith('direct_')).map(session => ({ id: session.id, status: session.status, incoming: session.userBId === req.member!.id, partnerAlias: session.userAId === req.member!.id ? session.userB.alias : session.userA.alias, expiresAt: new Date(session.createdAt.getTime() + 60000) })) });
}));
router.post('/invitations', action(async (req, res) => {
  const { partnerId } = z.object({ partnerId: identifier }).strict().parse(req.body);
  const user = req.member!;
  const favorite = await prisma.favoritePartner.findUnique({ where: { userId_partnerId: { userId: user.id, partnerId } } });
  if (!favorite) throw new ActionError(404, 'Saved partner not found.');
  const partner = await prisma.user.findUnique({ where: { id: partnerId } });
  if (!partner?.onboarded || !hasAcceptedCurrentTerms(partner) || partner.dnd) throw new ActionError(409, 'Your partner is unavailable.');
  if (!dashboardBot) throw new ActionError(503, 'Call invitations are temporarily unavailable.');
  await prisma.callSession.updateMany({ where: { status: 'PENDING', createdAt: { lt: new Date(Date.now() - 60000) }, OR: [{ userAId: user.id }, { userBId: user.id }, { userAId: partnerId }, { userBId: partnerId }] }, data: { status: 'CANCELLED', endedAt: new Date() } });
  let session;
  try { session = await admitCall(user.id, partnerId, `direct_${crypto.randomUUID()}`, 'PENDING'); }
  catch { throw new ActionError(409, 'A participant is unavailable, already in a call, or has no calls remaining.'); }
  const url = new URL(env.MINI_APP_URL); url.searchParams.set('view', 'partners');
  try {
    await notificationQueue.enqueue(dashboardBot, partner.telegramId.toString(), `${user.alias} invited you to a speaking call. Open your dashboard to accept or decline. The invitation lasts 60 seconds.`, { reply_markup: new InlineKeyboard().webApp('Open invitation', url.toString()) }, true, `invite:${session.id}`);
  } catch (error) { await prisma.callSession.updateMany({ where: { id: session.id, status: 'PENDING' }, data: { status: 'CANCELLED', endedAt: new Date() } }); throw error; }
  res.status(201).json({ success: true, id: session.id });
}));
router.post('/invitations/:id/:decision', action(async (req, res) => {
  const decision = z.enum(['accept', 'decline', 'cancel']).parse(req.params.decision);
  const session = await ownSession(req.params.id, req.member!.id);
  if (session.status !== 'PENDING') throw new ActionError(409, 'This invitation is no longer active.');
  if ((decision === 'cancel' && session.userAId !== req.member!.id) || (decision !== 'cancel' && session.userBId !== req.member!.id)) throw new ActionError(403, 'This invitation action is unavailable.');
  if (decision !== 'accept') {
    const changed = await prisma.callSession.updateMany({ where: { id: session.id, status: 'PENDING' }, data: { status: decision === 'decline' ? 'DECLINED' : 'CANCELLED', endedAt: new Date() } });
    if (!changed.count) throw new ActionError(409, 'This invitation was already processed.');
    res.json({ success: true }); return;
  }
  if (session.createdAt.getTime() + 60000 <= Date.now()) throw new ActionError(409, 'This invitation expired.');
  if (!session.userA.onboarded || !hasAcceptedCurrentTerms(session.userA) || session.userB.dnd) throw new ActionError(409, 'A participant is unavailable.');
  if (!dashboardBot) throw new ActionError(503, 'Call invitations are temporarily unavailable.');
  let claimed;
  try { claimed = await activatePendingCall(session.id); }
  catch { throw new ActionError(409, 'A participant is unavailable or has no calls remaining.'); }
  if (!claimed.count) throw new ActionError(409, 'This invitation was already processed.');
  const seconds = calculateEffectiveCallDuration(session.userA, session.userB) * 60;
  setRoomDurationLimit(session.roomName, seconds);
  scheduleConnectionHandshakeTimer(session.roomName, 90, dashboardBot);
  await publishGatewayCommand({ command: 'SCHEDULE_HANDSHAKE_TIMER', roomName: session.roomName, durationSeconds: seconds });
  res.json({ success: true, activeCallId: session.id });
}));
export default router;
