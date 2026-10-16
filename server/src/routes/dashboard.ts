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
import { getEffectiveEntitlement, getUserCallsUsedThisPeriod, getUserRecordingsUsedThisPeriod, sessionCallMinutes, getAllowancePeriod } from '../services/plan';
import { getActiveBonusCallsCount, getReferralStats, getContestStatus } from '../services/referralService';
import { hasAcceptedCurrentTerms, currentTerms } from '../services/terms';
import { saveCallQualityRating } from '../services/callFeedback';
import { moderationService } from '../services/moderation';
import { admitCall, activatePendingCall } from '../services/callAdmission';
import { notificationQueue } from '../bot/notifications';
import type { MyContext } from '../bot/types';
import { scheduleConnectionHandshakeTimer, setRoomDurationLimit } from '../socket/signaling';
import { isUserSessionRecorder, recordingDeadline } from '../utils/recordingAccess';
import { lockRow } from '../utils/transactionLock';
import { recordingDeliveryStatus } from '../services/recordingDelivery';
import { activeDiscountOffers } from '../services/discounts';
import { creditReceipt } from '../services/credits';
import { CREDIT_TERMS_VERSION } from '../contracts/credits';
import { createPracticeOrder, practiceOrderDescription, cancelPendingPracticeCheckout, resumePracticeCheckout } from '../services/practiceCheckout';
import { listPackCampaigns, publicPackCampaign } from '../services/packCampaigns';
import { heldPackSlots } from '../services/packOfferInventory';
import { claimStarterGift } from '../services/starterGift';
import { saveNotificationPreferences } from '../services/optionalNotifications';
import { userNotificationPreferences } from '../services/notificationPolicy';

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
router.get('/credits',action(async(req,res)=>{
  const user=req.member!;
  const orders=await prisma.creditOrder.findMany({where:{userId:user.id},orderBy:{createdAt:'desc'},take:20,select:{id:true,calls:true,recordings:true,storage:true,packSnapshot:true,checkoutCurrency:true,expiresAt:true,authorizedAt:true,starsAmount:true,uzsAmount:true,status:true,createdAt:true,paidAt:true}});
  res.json({balance:{calls:user.callCredits,recordings:user.recordingCredits,storage:user.storageCredits},orders});
}));
router.get('/starter-gift',action(async(req,res)=>{res.json({claimed:Boolean(req.member!.starterGiftGrantedAt),calls:3,channelUrl:'https://t.me/pairtalk'});}));
router.post('/starter-gift',action(async(req,res)=>{
  z.object({}).strict().parse(req.body);
  if(!dashboardBot)throw new ActionError(503,'Membership checks are temporarily unavailable.');
  try{res.json(await claimStarterGift(req.member!.id,dashboardBot));}catch(error){throw new ActionError(409,error instanceof Error?error.message:'Membership could not be checked.');}
}));
router.get('/notifications',action(async(req,res)=>{res.json({preferences:userNotificationPreferences(req.member!),timeZone:'Asia/Tashkent',cooldownHours:24});}));
router.patch('/notifications',action(async(req,res)=>{res.json({preferences:await saveNotificationPreferences(req.member!.id,req.body),timeZone:'Asia/Tashkent',cooldownHours:24});}));
router.post('/credits/checkout',createActionRateLimiter('PAYMENT_INVOICE',req=>(req as MemberRequest).member!.id),action(async(req,res)=>{
  const input=z.object({requestId:identifier,revision:z.string().regex(/^[a-f0-9]{64}$/),calls:z.number().int().min(1).refine(Number.isSafeInteger),recordings:z.number().int().min(0).refine(Number.isSafeInteger),storage:z.boolean(),termsAccepted:z.literal(true),termsVersion:z.literal(CREDIT_TERMS_VERSION)}).strict().refine(data=>data.recordings<=data.calls&&(!data.storage||data.recordings>0)).parse(req.body);
  if (!dashboardBot) throw new ActionError(503,'Telegram checkout is temporarily unavailable.');
  let order;
  try { order=await createPracticeOrder(req.member!.id,input.requestId,{calls:input.calls,recordings:input.recordings,retention:input.storage,minutes:15},input.revision,'XTR'); }
  catch(error){throw new ActionError(409,error instanceof Error?error.message:'Checkout is unavailable.');}
  if (order.status!=='PENDING' || order.expiresAt<=new Date()) throw new ActionError(409,'This checkout is already used or expired. Review your balance before trying again.');
  let invoiceUrl:string;
  try{invoiceUrl=await dashboardBot.api.createInvoiceLink('PairTalk calls and recordings',creditReceipt(order).slice(0,255),`credits:${order.id}`,'','XTR',[{label:'Calls and recordings',amount:order.starsAmount}]);}
  catch{throw new ActionError(503,'Telegram could not prepare this invoice. No payment was requested. Retry this checkout or cancel it from your balance.');}
  res.json({orderId:order.id,invoiceUrl,stars:order.starsAmount,uzs:order.uzsAmount});
}));
router.post('/practice/checkout',createActionRateLimiter('PAYMENT_INVOICE',req=>(req as MemberRequest).member!.id),action(async(req,res)=>{
  const count=z.number().int().nonnegative().refine(Number.isSafeInteger);
  const input=z.object({requestId:identifier,revision:z.string().regex(/^[a-f0-9]{64}$/),calls:count.min(1),recordings:count,retention:z.boolean(),minutes:z.union([z.literal(15),z.literal(30)]),currency:z.enum(['XTR','UZS']),campaignId:identifier.optional(),termsAccepted:z.literal(true),termsVersion:z.literal(CREDIT_TERMS_VERSION)}).strict().refine(data=>data.recordings<=data.calls&&(!data.retention||data.recordings>0)).parse(req.body);
  if (!dashboardBot) throw new ActionError(503,'Telegram checkout is temporarily unavailable.');
  let order;
  try { order=await createPracticeOrder(req.member!.id,input.requestId,{calls:input.calls,recordings:input.recordings,retention:input.retention,minutes:input.minutes},input.revision,input.currency,input.campaignId); }
  catch(error){throw new ActionError(409,error instanceof Error?error.message:'Checkout is unavailable.');}
  if(order.status==='PAID'&&order.starsAmount===0&&order.packClaimId){res.json({orderId:order.id,claimed:true,stars:0,uzs:0});return;}
  if (order.status!=='PENDING' || order.expiresAt<=new Date()) throw new ActionError(409,'This checkout is already used or expired. Review your balance before trying again.');
  if (input.currency==='UZS') {
    // The durable job was committed with the order before the app may close.
    void notificationQueue.recover(dashboardBot).catch(()=>undefined);
    const job=await prisma.notificationJob.findFirst({where:{dedupeKey:`pack-checkout:${order.id}`,telegramId:req.member!.telegramId.toString()},orderBy:{createdAt:'desc'}});
    const delivery=job&&['QUEUED','CHECKING','SENDING'].includes(job.status)?'QUEUED':job?.status??'UNCONFIRMED';
    res.json({orderId:order.id,delivery,stars:order.starsAmount,uzs:order.uzsAmount});
    return;
  }
  let invoiceUrl:string;
  try{invoiceUrl=await dashboardBot.api.createInvoiceLink('PairTalk practice pack',practiceOrderDescription(order).slice(0,255),`credits:${order.id}`,'','XTR',[{label:'Practice pack',amount:order.starsAmount}]);}
  catch{throw new ActionError(503,'Telegram could not prepare this invoice. No payment was requested. Retry this checkout or cancel it from your balance.');}
  res.json({orderId:order.id,invoiceUrl,stars:order.starsAmount,uzs:order.uzsAmount});
}));
router.get('/discount-offers',action(async(req,res)=>{res.json({offers:await activeDiscountOffers(req.member!),serverNow:new Date()});}));
router.get('/pack-offers',action(async(req,res)=>{res.json({offers:await listPackCampaigns(req.member!.id),serverNow:new Date()});}));
router.post('/practice/orders/:id/cancel',action(async(req,res)=>{
  try{res.json(await cancelPendingPracticeCheckout(req.member!.id,identifier.parse(req.params.id)));}
  catch(error){throw new ActionError(409,error instanceof Error?error.message:'Cancellation could not be confirmed.');}
}));
router.get('/practice/orders/:id',action(async(req,res)=>{
  try{res.json(await resumePracticeCheckout(req.member!.id,identifier.parse(req.params.id)));}
  catch(error){throw new ActionError(409,error instanceof Error?error.message:'Checkout could not be resumed.');}
}));
router.get('/pack-offers/:id',action(async(req,res)=>{
  const id=identifier.parse(req.params.id),campaign=await prisma.packCampaign.findUnique({where:{id}});
  if(!campaign||campaign.status==='DRAFT')throw new ActionError(404,'This offer is not available.');
  const claim=await prisma.packClaim.findUnique({where:{campaignId_userId:{campaignId:id,userId:req.member!.id}}});
  res.json({offer:publicPackCampaign(campaign,await heldPackSlots(prisma,id),claim?.status),serverNow:new Date()});
}));
async function ownSession(id: string, userId: string) {
  identifier.parse(id);
  const session = await prisma.callSession.findFirst({ where: { id, OR: [{ userAId: userId }, { userBId: userId }] }, include: { userA: true, userB: true, ratings: true } });
  if (!session) throw new ActionError(404, 'Session not found.');
  return session;
}
type SummaryRecording = { id: string; callId: string; createdAt: Date; expiresAt: Date | null; creditOwnerIds?:string[];storedOwnerIds?:string[];status?:string;objectKey?:string };
async function sessionSummary(session: Awaited<ReturnType<typeof ownSession>>, userId: string, retentionDays: number, savedPartnerIds?: ReadonlySet<string>, availableSegments?: SummaryRecording[]) {
  const partner = session.userAId === userId ? session.userB : session.userA;
  const rating = session.ratings.find(item => item.raterId === userId && !item.reported);
  const expiry = Math.min(session.recordingExpiresAt?.getTime() ?? Infinity, (session.endedAt ?? session.createdAt).getTime() + retentionDays * 86400000);
  const segments = availableSegments ?? await prisma.recordingSegment.findMany({where:{callId:session.id,ownerIds:{has:userId}},orderBy:{createdAt:"asc"}});
  const recipientExpiry=(session.endedAt??session.createdAt).getTime()+retentionDays*86400000;
  const recordings = recipientExpiry > Date.now() ? segments.filter(segment=>segment.status==='READY' && recordingDeadline(segment,userId)>Date.now()).map(segment=>({id:segment.id,createdAt:segment.createdAt,expiresAt:new Date(Math.min(recordingDeadline(segment,userId),recipientExpiry))})) : [];
  const managedLatest=segments.find(segment=>segment.objectKey===session.recordingUrl);
  const recordingAvailable = Boolean((!managedLatest || (managedLatest.status==='READY' && recordingDeadline(managedLatest,userId)>Date.now())) && session.recordingUrl && expiry > Date.now() && (!session.recordedByUserId || isUserSessionRecorder(session.recordedByUserId, userId)));
  return { id: session.id, partnerAlias: partner.alias, partnerBand: partner.band, status: session.status, duration: session.duration, createdAt: session.createdAt, endedAt: session.endedAt, recordings, rating: rating?.stars ?? null, reported: session.ratings.some(item => item.raterId === userId && item.reported), saved: savedPartnerIds?.has(partner.id) ?? false, recordingAvailable, recordingExpiresAt: recordingAvailable ? new Date(expiry) : null };
}

router.get('/summary', action(async (req, res) => {
  const user = req.member!;
  const entitlement = getEffectiveEntitlement(user);
  const [callsUsed, recordingsUsed, bonus, activeCall] = await Promise.all([
    getUserCallsUsedThisPeriod(user.id, user), getUserRecordingsUsedThisPeriod(user.id, user), getActiveBonusCallsCount(user.id),
    prisma.callSession.findFirst({ where: { status: 'ACTIVE', OR: [{ userAId: user.id }, { userBId: user.id }] }, select: { roomName: true } }),
  ]);
  res.json({ activeCall: activeCall ? { roomName: activeCall.roomName } : null, user: { userId: user.id, alias: user.alias, band: user.band, subFC: user.subFC, subLR: user.subLR, subGRA: user.subGRA, subP: user.subP, plan: entitlement.plan, creditOnly:user.creditBilling && entitlement.baseCallLimit===0, preferredCallMinutes:user.preferredCallMinutes, starterGiftClaimed:Boolean(user.starterGiftGrantedAt), creditBalance:{calls:user.callCredits,recordings:user.recordingCredits,storage:user.storageCredits}, planExpiresAt: user.subscriptionExpiresAt, dnd: user.dnd, callsRemaining: Math.max(0, entitlement.callLimit - callsUsed) + bonus, includedCallsRemaining: Math.max(0, entitlement.baseCallLimit - callsUsed), bonusCallsRemaining: bonus, allowancePeriod: getAllowancePeriod(user), totalCallsLimit: entitlement.callLimit, maxCallDuration: entitlement.maxCallDuration, recordingsRemaining: Math.max(0, entitlement.recordingLimit - recordingsUsed), recordingsLimit: entitlement.recordingLimit, recordingRetentionDays: entitlement.retentionDays }, terms: { version: currentTerms.version, acceptedAt: user.termsAcceptedAt, url: currentTerms.termsUrl } });
}));

const band = z.number().min(0).max(9).refine(value => Number.isInteger(value * 2));
const preferences = z.object({ dnd: z.boolean().optional(),preferredCallMinutes:z.union([z.literal(15),z.literal(30)]).optional(), subFC: band.optional(), subLR: band.optional(), subGRA: band.optional(), subP: band.optional() }).strict().refine(data => Object.keys(data).length > 0).refine(data => [data.subFC, data.subLR, data.subGRA, data.subP].every(value => value === undefined) || [data.subFC, data.subLR, data.subGRA, data.subP].every(value => value !== undefined));
router.patch('/account', action(async (req, res) => {
  const data = preferences.parse(req.body);
  const overall = data.subFC === undefined ? undefined : Math.round((data.subFC + data.subLR! + data.subGRA! + data.subP!) / 4 * 2) / 2;
  await prisma.$transaction(async tx=>{
    await lockRow(tx,'User',req.member!.id);
    if(data.preferredCallMinutes!==undefined&&await tx.callSession.findFirst({where:{status:{in:['ACTIVE','PENDING']},OR:[{userAId:req.member!.id},{userBId:req.member!.id}]}}))throw new ActionError(409,'Finish your current call or invitation before changing duration.');
    await tx.user.update({ where: { id: req.member!.id }, data: { ...data, ...(overall === undefined ? {} : { band: overall }) } });
  });
  res.json({ success: true });
}));

router.get('/sessions', action(async (req, res) => {
  const cursor = req.query.cursor === undefined ? undefined : identifier.parse(req.query.cursor);
  const roomName = req.query.roomName === undefined ? undefined : z.string().min(1).max(128).parse(req.query.roomName);
  if (cursor) await ownSession(cursor, req.member!.id);
  const sessions = await prisma.callSession.findMany({ where: { ...(roomName ? { roomName } : {}), status: { in: ['COMPLETED', 'CANCELLED', 'DECLINED'] }, OR: [{ userAId: req.member!.id }, { userBId: req.member!.id }] }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), take: 21, include: { userA: true, userB: true, ratings: true } });
  const retention = getEffectiveEntitlement(req.member!).retentionDays;
  const savedRows = await prisma.favoritePartner.findMany({ where: { userId: req.member!.id }, select: { partnerId: true } });
  const savedPartnerIds = new Set(savedRows.map(row => row.partnerId));
  const page = sessions.slice(0, 20);
  const segments = page.length ? await prisma.recordingSegment.findMany({
    where: { callId: { in: page.map(session => session.id) }, ownerIds: { has: req.member!.id } },
    orderBy: { createdAt: 'asc' }, select: { id: true, callId: true, createdAt: true, expiresAt: true,creditOwnerIds:true,storedOwnerIds:true,status:true,objectKey:true },
  }) : [];
  const byCall = new Map<string, SummaryRecording[]>();
  for (const segment of segments) {
    const items = byCall.get(segment.callId) ?? [];
    items.push(segment); byCall.set(segment.callId, items);
  }
  res.json({ sessions: await Promise.all(page.map(session => sessionSummary(session, req.member!.id, retention, savedPartnerIds, byCall.get(session.id) ?? []))), nextCursor: sessions.length > 20 ? sessions[19].id : null });
}));
router.get('/sessions/:id', action(async (req, res) => {
  const session = await ownSession(req.params.id, req.member!.id);
  const partnerId = session.userAId === req.member!.id ? session.userBId : session.userAId;
  const saved = await prisma.favoritePartner.findUnique({ where: { userId_partnerId: { userId: req.member!.id, partnerId } }, select: { partnerId: true } });
  res.json({ session: await sessionSummary(session, req.member!.id, getEffectiveEntitlement(req.member!).retentionDays, new Set(saved ? [saved.partnerId] : [])) });
}));
router.post('/sessions/:id/recording-delivery', action(async (req, res) => {
  const { segmentId, retry = false } = z.object({ segmentId: identifier.optional(), retry: z.boolean().optional() }).strict().parse(req.body);
  const user = req.member!;
  const session = await ownSession(req.params.id, user.id);
  const now = new Date();
  const retentionDays = getEffectiveEntitlement(user).retentionDays;
  if (!['COMPLETED', 'CANCELLED'].includes(session.status) || now.getTime() >= (session.endedAt ?? session.createdAt).getTime() + retentionDays * 86400000) {
    throw new ActionError(404, 'This recording is no longer available.');
  }
  let segment = segmentId
    ? await prisma.recordingSegment.findUnique({ where: { id: segmentId } })
    : await prisma.recordingSegment.findFirst({ where: { callId: session.id, status: 'READY', ownerIds: { has: user.id }, expiresAt: { gt: now } }, orderBy: { createdAt: 'desc' } });
  if (segmentId && !segment) throw new ActionError(404, 'This recording is no longer available.');
  if (!segment) {
    // Give pre-segment recordings the same durable receipt and claim protection.
    // Legacy delivery remains user-requested; it does not notify other owners automatically.
    if (!session.recordingUrl || (session.recordingExpiresAt && session.recordingExpiresAt <= now) || (session.recordedByUserId && !isUserSessionRecorder(session.recordedByUserId,user.id))) throw new ActionError(404,'This recording is no longer available.');
    if (!dashboardBot) throw new ActionError(503,'Telegram delivery is temporarily unavailable. Please retry.');
    const ownerIds = [session.userAId,session.userBId].filter(id=>!session.recordedByUserId || isUserSessionRecorder(session.recordedByUserId,id));
    const maxRetention = Math.max(getEffectiveEntitlement(session.userA).retentionDays,getEffectiveEntitlement(session.userB).retentionDays);
    const expiresAt = new Date(Math.min(session.recordingExpiresAt?.getTime()??Infinity,(session.endedAt??session.createdAt).getTime()+maxRetention*86400000));
    segment = await prisma.$transaction(async tx => {
      const stored = await tx.recordingSegment.upsert({where:{objectKey:session.recordingUrl!},create:{callId:session.id,objectKey:session.recordingUrl!,egressId:`legacy:${session.id}:${crypto.createHash('sha256').update(session.recordingUrl!).digest('hex')}`,ownerIds,status:'READY',expiresAt},update:{}});
      if (stored.callId !== session.id || stored.status !== 'READY' || !stored.ownerIds.includes(user.id) || !stored.expiresAt || stored.expiresAt <= now) throw new ActionError(404,'This recording is no longer available.');
      await tx.recordingDelivery.upsert({where:{segmentId_userId:{segmentId:stored.id,userId:user.id}},create:{segmentId:stored.id,userId:user.id},update:{}});
      return stored;
    });
  }
  if (segment) {
    if (segment.callId !== session.id || segment.status !== 'READY' || !segment.ownerIds.includes(user.id) || !segment.expiresAt || recordingDeadline(segment,user.id) <= Date.now()) {
      throw new ActionError(404, 'This recording is no longer available.');
    }
    if (!dashboardBot) throw new ActionError(503, 'Telegram delivery is temporarily unavailable. Please retry.');
    const delivery = await prisma.$transaction(async tx => {
      // Preserve automatic delivery to every consenting recorder. Creating only
      // one job would make the worker's "no deliveries yet" scan skip the others.
      const owners = segment!.egressId.startsWith('legacy:') ? [user.id] : segment!.ownerIds;
      const jobs = await Promise.all(owners.map(ownerId => tx.recordingDelivery.upsert({ where: { segmentId_userId: { segmentId: segment!.id, userId: ownerId } }, create: { segmentId: segment!.id, userId: ownerId }, update: {} })));
      let owned = jobs.find(job => job.userId === user.id)!;
      if (retry && owned.status === 'FAILED') {
        await tx.recordingDelivery.updateMany({where:{segmentId:owned.segmentId,userId:user.id,status:'FAILED'},data:{status:'QUEUED',nextAttemptAt:now,owner:null,leaseUntil:null,failure:null}});
        owned = (await tx.recordingDelivery.findUnique({where:{segmentId_userId:{segmentId:owned.segmentId,userId:user.id}}}))!;
      }
      return owned;
    });
    if (delivery.status === 'EXPIRED') throw new ActionError(404, 'This recording is no longer available.');
    const status = recordingDeliveryStatus(delivery);
    res.status(status === 'QUEUED' ? 202 : 200).json({ status });
    return;
  }
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
  const { reason, details } = z.object({ reason: z.enum(['Harassment', 'Hate speech', 'Explicit content', 'Spam or solicitation', 'Other unsafe behavior']), details: z.string().trim().max(1000).optional() }).strict().parse(req.body);
  const session = await ownSession(req.params.id, req.member!.id);
  if (session.status !== 'COMPLETED') throw new ActionError(409, 'Finish or leave the conversation before reporting.');
  if (session.ratings.some(item => item.raterId === req.member!.id && item.reported)) throw new ActionError(409, 'You already reported this conversation.');
  try { await moderationService.processReport(session.userAId === req.member!.id ? session.userBId : session.userAId, req.member!.id, session.id, details ? `${reason}\n\n${details}` : reason); }
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
    await notificationQueue.enqueue(dashboardBot, partner.telegramId.toString(), `${user.alias} invited you to a ${session.allowedMinutes}-minute speaking call. This reserves ${Math.ceil((session.allowedMinutes??15)/15)} call units if your included allowance is exhausted. Open your dashboard to accept or decline. The invitation lasts 60 seconds.`, { reply_markup: new InlineKeyboard().webApp('Open invitation', url.toString()) }, true, `invite:${session.id}`);
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
  const seconds = sessionCallMinutes(session) * 60;
  setRoomDurationLimit(session.roomName, seconds);
  scheduleConnectionHandshakeTimer(session.roomName, 90, dashboardBot);
  await publishGatewayCommand({ command: 'SCHEDULE_HANDSHAKE_TIMER', roomName: session.roomName, durationSeconds: seconds });
  res.json({ success: true, activeCallId: session.id });
}));
export default router;
