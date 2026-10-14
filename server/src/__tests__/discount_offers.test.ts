import { beforeEach,afterEach,expect,it,vi } from 'vitest';
import crypto from 'node:crypto';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/database';
import { env } from '../config/env';
import { currentTerms } from '../services/terms';
import { getPlansConfig,updatePlansConfig,approveManualPaymentRequest,rejectManualPaymentRequest,getEffectiveEntitlement,calculateEffectiveCallDuration,revokePlanOnRefund,refundManualPaymentRequest } from '../services/plan';
import { createDiscountCampaign,activeDiscountOffers,recoverDiscountNotices,viewDiscountOffer,beginDiscountCheckout,authorizeDiscountStars,settleDiscountStars,claimFreeDiscount,submitDiscountReceipt } from '../services/discounts';
import { discountCampaignInput,discountedPrice } from '../contracts/discounts';
import adminRoutes from '../routes/admin';
import dashboardRoutes from '../routes/dashboard';
import { NotificationQueue } from '../bot/notifications';
import { startDiscountNoticeWorker } from '../services/discounts';

const baseline=structuredClone(getPlansConfig());
const app=express();app.use(express.json());app.use('/admin',adminRoutes);app.use('/dashboard',dashboardRoutes);
let seq=960000000n;
const signed=(id:bigint)=>{const p=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id:Number(id),first_name:'Synthetic'})});const secret=crypto.createHmac('sha256','WebAppData').update(env.BOT_TOKEN).digest();p.set('hash',crypto.createHmac('sha256',secret).update([...p].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join('\n')).digest('hex'));return p.toString();};
async function member(data={}){return prisma.user.create({data:{telegramId:++seq,alias:'Synthetic-'+crypto.randomUUID(),onboarded:true,termsAcceptedVersion:currentTerms.version,termsDocumentSha256:currentTerms.sha256,termsAcceptedAt:new Date(),...data}});}
async function campaign(percent=20,recipientCount=1,validMinutes=60){return createDiscountCampaign({requestId:crypto.randomUUID(),plan:'PLUS',percent,recipientCount,validMinutes},'12345678');}
async function fixture(percent=20){const user=await member(),c=await campaign(percent);const offer=(await prisma.discountOffer.findMany({where:{campaignId:c.id}}))[0];return{user,c,offer};}
beforeEach(async()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-14T16:00:00Z'));vi.restoreAllMocks();
  await prisma.starsTransaction.deleteMany();await prisma.manualPaymentRequest.deleteMany();await prisma.notificationJob.deleteMany();await prisma.discountOffer.deleteMany();await prisma.discountCampaign.deleteMany();await prisma.auditLog.deleteMany();await prisma.user.deleteMany();
  updatePlansConfig({...baseline,PLUS:{...baseline.PLUS,starsPrice:100,uzsPrice:10000}});
});
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();updatePlansConfig(baseline);});
it('applies the discount separately, rounds whole units up and supports 100%',()=>{
  expect(discountedPrice(100,20)).toBe(80);expect(discountedPrice(10000,20)).toBe(8000);
  expect(discountedPrice(79,20)).toBe(64);expect(discountedPrice(100,100)).toBe(0);expect(discountedPrice(100,0.01)).toBe(100);
});
it.each([{}, {plan:'FREE'}, {percent:0}, {percent:101}, {recipientCount:0}, {recipientCount:1.5}, {validMinutes:0}])('requires all inputs and valid bounds: %j',input=>{
  const base={requestId:crypto.randomUUID(),plan:'PLUS',percent:20,recipientCount:1,validMinutes:60};
  expect(discountCampaignInput.safeParse(Object.keys(input).length?{...base,...input}:{}).success).toBe(false);
});
it('selects exactly X distinct eligible users and permits selection in later campaigns',async()=>{
  const members=await Promise.all(Array.from({length:5},()=>member()));await member({isBanned:true});await member({onboarded:false});await member({termsDocumentSha256:'invalid'});await member({plan:'BOSS',subscriptionStatus:'ACTIVE',subscriptionExpiresAt:new Date(Date.now()+86400000)});
  const first=await campaign(20,3),offers=await prisma.discountOffer.findMany({where:{campaignId:first.id}});
  expect(offers).toHaveLength(3);expect(new Set(offers.map(o=>o.userId)).size).toBe(3);expect(offers.every(o=>members.some(u=>u.id===o.userId))).toBe(true);
  const second=await campaign(20,5);expect(await prisma.discountOffer.count({where:{campaignId:second.id}})).toBe(5);
});
it('replays the same admin submission without creating a second campaign or random draw',async()=>{
  await member();const input={requestId:crypto.randomUUID(),plan:'PLUS',percent:20,recipientCount:1,validMinutes:60};
  const result=await Promise.all([createDiscountCampaign(input,'12345678'),createDiscountCampaign(input,'12345678')]);
  expect(result[0].id).toBe(result[1].id);expect(await prisma.discountOffer.count()).toBe(1);
  await expect(createDiscountCampaign({...input,percent:30},'12345678')).rejects.toThrow('submission ID');
});
it('refuses insufficient recipients or inactive plans without leaving partial campaigns',async()=>{
  await member();await expect(campaign(20,2)).rejects.toThrow('Only 1 eligible');expect(await prisma.discountCampaign.count()).toBe(0);
  updatePlansConfig({PLUS:{...getPlansConfig().PLUS,active:false}});await expect(campaign()).rejects.toThrow('available paid plan');
});
it('queues exactly one personal message per selected user and keeps its expiry',async()=>{
  const {c,offer}=await fixture();await Promise.all([recoverDiscountNotices(),recoverDiscountNotices()]);await recoverDiscountNotices();
  const jobs=await prisma.notificationJob.findMany();expect(jobs).toHaveLength(1);expect(jobs[0].text).toContain('20% discount offer');expect(jobs[0].text).toContain('80 Stars');expect(jobs[0].text).toContain('8,000 UZS');expect(jobs[0].expiresAt).toEqual(c.expiresAt);expect(jobs[0].optionsJson).toContain(`discount:${offer.id}`);
});
it('waits for notification capacity without redrawing recipients or duplicating notices',async()=>{
  const {offer}=await fixture();const spy=vi.spyOn(prisma.notificationJob,'count').mockResolvedValueOnce(1000);
  await recoverDiscountNotices();expect(await prisma.notificationJob.findMany()).toHaveLength(0);expect((await prisma.discountOffer.findUnique({where:{id:offer.id}}))?.noticeQueuedAt).toBeNull();
  spy.mockRestore();await recoverDiscountNotices();await recoverDiscountNotices();expect(await prisma.notificationJob.count()).toBe(1);
});
it('stops campaign recovery cleanly and does not restart its timer',async()=>{
  await fixture();const stop=startDiscountNoticeWorker();await vi.advanceTimersByTimeAsync(1000);expect(await prisma.notificationJob.count()).toBe(1);await stop();
  await campaign();await vi.advanceTimersByTimeAsync(10000);expect(await prisma.notificationJob.count()).toBe(1);
});
it('never queues an expired offer and removes it from the dashboard at the deadline',async()=>{
  const {user,offer}=await fixture();expect(await activeDiscountOffers(user)).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(3600000);expect(await activeDiscountOffers(user)).toHaveLength(0);await recoverDiscountNotices();expect(await prisma.notificationJob.count()).toBe(0);
  await expect(viewDiscountOffer(offer.id,user.telegramId)).rejects.toThrow('expired');await expect(beginDiscountCheckout(offer.id,user.telegramId,'XTR')).rejects.toThrow('expired');
});
it('does not send an offer notification that expires while it waits in the queue',async()=>{
  await fixture();await recoverDiscountNotices();await vi.advanceTimersByTimeAsync(3600000);
  const bot={api:{sendMessage:vi.fn().mockResolvedValue({message_id:1})}};await (new NotificationQueue() as any).drainPersistent(bot);
  expect(bot.api.sendMessage).not.toHaveBeenCalled();expect(await prisma.notificationJob.count({where:{status:'EXPIRED'}})).toBe(1);
});
it('binds offers to their recipient and excludes foreign accounts from dashboard results',async()=>{
  const {user,offer}=await fixture(),other=await member();expect(await activeDiscountOffers(other)).toHaveLength(0);
  await expect(viewDiscountOffer(offer.id,other.telegramId)).rejects.toThrow('your account');await expect(claimFreeDiscount(offer.id,other.telegramId)).rejects.toThrow('your account');
  const response=await request(app).get('/dashboard/discount-offers').set('x-telegram-init-data',signed(user.telegramId));expect(response.body.offers[0].starsPrice).toBe(80);expect(JSON.stringify(response.body)).not.toContain(String(user.telegramId));
  expect((await request(app).get('/dashboard/discount-offers')).status).toBe(403);
});
it('claims a 100% offer once under simultaneous repeated clicks',async()=>{
  const {user,offer}=await fixture(100);await expect(beginDiscountCheckout(offer.id,user.telegramId,'XTR')).rejects.toThrow('offer is free');const results=await Promise.allSettled([claimFreeDiscount(offer.id,user.telegramId),claimFreeDiscount(offer.id,user.telegramId)]);
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(await prisma.starsTransaction.count()).toBe(0);
  const after=await prisma.user.findUnique({where:{id:user.id}});expect(after?.plan).toBe('PLUS');expect(getEffectiveEntitlement(after).source).toBe('PLAN_DEFAULT');expect(calculateEffectiveCallDuration(after,{plan:'FREE',subscriptionStatus:'NONE'})).toBe(30);expect((await prisma.discountOffer.findUnique({where:{id:offer.id}}))?.status).toBe('CLAIMED');
});
it('preserves a new 100% subscription when an older same-tier Stars purchase is refunded',async()=>{
  const user=await member({plan:'PRO',subscriptionStatus:'EXPIRED',subscriptionExpiresAt:new Date(Date.now()-86400000)});
  const old=await prisma.starsTransaction.create({data:{userId:user.id,telegramPaymentId:'synthetic-old-purchase',planTier:'PRO',starsAmount:255,status:'PAID',createdAt:new Date(Date.now()-31*86400000)}});
  const campaign=await createDiscountCampaign({requestId:crypto.randomUUID(),plan:'PRO',percent:100,recipientCount:1,validMinutes:60},'12345678');
  const offer=(await prisma.discountOffer.findMany({where:{campaignId:campaign.id}}))[0];await claimFreeDiscount(offer.id,user.telegramId);
  const refunded=await revokePlanOnRefund({transactionId:old.id,adminId:'12345678',providerConfirmed:true});expect(refunded.user.plan).toBe('PRO');expect(refunded.user.subscriptionStatus).toBe('ACTIVE');
});
it('preserves a new 100% subscription when an older same-tier card purchase is refunded',async()=>{
  const now=new Date();const user=await member({plan:'PRO',subscriptionStatus:'EXPIRED',subscriptionExpiresAt:new Date(Date.now()-86400000)});
  vi.setSystemTime(new Date(now.getTime()-31*86400000));const old=await prisma.manualPaymentRequest.create({data:{userId:user.id,telegramId:user.telegramId,alias:user.alias,plan:'PRO',uzsAmount:55000,status:'APPROVED',reviewedAt:new Date()}});vi.setSystemTime(now);
  const campaign=await createDiscountCampaign({requestId:crypto.randomUUID(),plan:'PRO',percent:100,recipientCount:1,validMinutes:60},'12345678');const offer=(await prisma.discountOffer.findMany({where:{campaignId:campaign.id}}))[0];await claimFreeDiscount(offer.id,user.telegramId);
  const proof='data:application/pdf;base64,'+Buffer.from('%PDF-1.4 synthetic refund proof').toString('base64');
  const refunded=await refundManualPaymentRequest({requestId:old.id,adminId:'12345678',refundProof:proof});expect(refunded.user.plan).toBe('PRO');expect(refunded.user.subscriptionStatus).toBe('ACTIVE');
});
it('still revokes the subscription when refunding the discounted paid claim itself',async()=>{
  const {user,offer}=await fixture();const checkout=await beginDiscountCheckout(offer.id,user.telegramId,'XTR');await authorizeDiscountStars(offer.id,user.telegramId,checkout.order,80,'refund-own-query');await settleDiscountStars({id:offer.id,telegramId:user.telegramId,order:checkout.order,amount:80,chargeId:'refund-own-charge'});
  const payment=await prisma.starsTransaction.findUnique({where:{telegramPaymentId:'refund-own-charge'}});const refunded=await revokePlanOnRefund({transactionId:payment!.id,adminId:'12345678',providerConfirmed:true});expect(refunded.user.plan).toBe('FREE');expect((await prisma.discountOffer.findUnique({where:{id:offer.id}}))?.status).toBe('CLAIMED');
});
it('uses one durable Stars order and accepts only one distinct pre-checkout query',async()=>{
  const {user,offer}=await fixture();const [a,b]=await Promise.all([beginDiscountCheckout(offer.id,user.telegramId,'XTR'),beginDiscountCheckout(offer.id,user.telegramId,'XTR')]);expect(a.order).toBe(b.order);
  const checks=await Promise.allSettled([authorizeDiscountStars(offer.id,user.telegramId,a.order,80,'query-A'),authorizeDiscountStars(offer.id,user.telegramId,a.order,80,'query-B')]);expect(checks.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  const row=await prisma.discountOffer.findUnique({where:{id:offer.id}});await authorizeDiscountStars(offer.id,user.telegramId,a.order,80,row!.preCheckoutId!);
  await expect(beginDiscountCheckout(offer.id,user.telegramId,'UZS')).rejects.toThrow('awaiting confirmation');
});
it('rejects wrong prices, replaced invoices and checkout at the exact deadline',async()=>{
  const {user,offer}=await fixture();const a=await beginDiscountCheckout(offer.id,user.telegramId,'XTR');
  await expect(authorizeDiscountStars(offer.id,user.telegramId,a.order,100,'wrong')).rejects.toThrow('no longer valid');
  await beginDiscountCheckout(offer.id,user.telegramId,'UZS');await expect(authorizeDiscountStars(offer.id,user.telegramId,a.order,80,'old')).rejects.toThrow('no longer valid');
  const b=await beginDiscountCheckout(offer.id,user.telegramId,'XTR');await vi.advanceTimersByTimeAsync(3600000);await expect(authorizeDiscountStars(offer.id,user.telegramId,b.order,80,'late')).rejects.toThrow('expired');
});
it.each(['checkout','stars','free','receipt'])('rechecks the deadline after slow admission work for %s',async(action)=>{
  const {user,c,offer}=await fixture(action==='free'?100:20);let order='';
  if(action==='stars'||action==='receipt')order=(await beginDiscountCheckout(offer.id,user.telegramId,action==='stars'?'XTR':'UZS')).order;
  vi.spyOn(prisma.manualPaymentRequest,'findFirst').mockImplementation(async()=>{vi.setSystemTime(c.expiresAt);return null;});
  const request=action==='checkout'?beginDiscountCheckout(offer.id,user.telegramId,'XTR'):action==='stars'?authorizeDiscountStars(offer.id,user.telegramId,order,80,'boundary-query'):action==='free'?claimFreeDiscount(offer.id,user.telegramId):submitDiscountReceipt(offer.id,user.telegramId,'{}');
  await expect(request).rejects.toThrow('expired');expect(await prisma.manualPaymentRequest.count()).toBe(0);expect((await prisma.discountOffer.findUnique({where:{id:offer.id}}))?.claimedAt).toBeNull();
});
it('honors an in-time payment after delayed settlement and never activates twice',async()=>{
  const {user,offer}=await fixture();const checkout=await beginDiscountCheckout(offer.id,user.telegramId,'XTR');await authorizeDiscountStars(offer.id,user.telegramId,checkout.order,80,'paid');
  updatePlansConfig({PLUS:{...getPlansConfig().PLUS,starsPrice:500,uzsPrice:50000,subscriptionDurationDays:90}});await vi.advanceTimersByTimeAsync(3600001);
  const input={id:offer.id,telegramId:user.telegramId,order:checkout.order,amount:80,chargeId:'synthetic-charge'};
  expect((await settleDiscountStars(input)).status).toBe('success');expect((await settleDiscountStars(input)).status).toBe('duplicate');
  expect((await prisma.user.findUnique({where:{id:user.id}}))?.subscriptionDurationDays).toBe(30);
  expect((await settleDiscountStars({...input,chargeId:'synthetic-extra-charge'})).status).toBe('refund');expect(await prisma.starsTransaction.count({where:{status:'REFUND_PROCESSING'}})).toBe(1);
});
it('does not let an expired unanswered reservation block a later campaign',async()=>{
  const {user,offer}=await fixture();const checkout=await beginDiscountCheckout(offer.id,user.telegramId,'XTR');await authorizeDiscountStars(offer.id,user.telegramId,checkout.order,80,'unanswered');
  await vi.advanceTimersByTimeAsync(3600000);const next=await campaign(100);const fresh=(await prisma.discountOffer.findMany({where:{campaignId:next.id}}))[0];
  await claimFreeDiscount(fresh.id,user.telegramId);
  expect((await settleDiscountStars({id:offer.id,telegramId:user.telegramId,order:checkout.order,amount:80,chargeId:'late-old-charge'})).status).toBe('refund');
});
it('refunds a foreign settled charge without consuming the intended recipient offer',async()=>{
  const {user,offer}=await fixture(),other=await member();const checkout=await beginDiscountCheckout(offer.id,user.telegramId,'XTR');await authorizeDiscountStars(offer.id,user.telegramId,checkout.order,80,'paid');
  expect((await settleDiscountStars({id:offer.id,telegramId:other.telegramId,order:checkout.order,amount:80,chargeId:'foreign-charge'})).status).toBe('refund');expect((await prisma.discountOffer.findUnique({where:{id:offer.id}}))?.status).toBe('PAYING');expect((await prisma.user.findUnique({where:{id:other.id}}))?.plan).toBe('FREE');
});
it('submits a discounted UZS receipt once and approves its snapshotted terms after expiry',async()=>{
  const {user,offer}=await fixture();await beginDiscountCheckout(offer.id,user.telegramId,'UZS');
  const submissions=await Promise.allSettled([submitDiscountReceipt(offer.id,user.telegramId,'{}'),submitDiscountReceipt(offer.id,user.telegramId,'{}')]);expect(submissions.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  const req=(await prisma.manualPaymentRequest.findMany())[0];expect(req.uzsAmount).toBe(8000);expect(req.discountOfferId).toBe(offer.id);
  updatePlansConfig({PLUS:{...getPlansConfig().PLUS,uzsPrice:99000,subscriptionDurationDays:90}});await vi.advanceTimersByTimeAsync(3600001);
  const approvals=await Promise.allSettled([approveManualPaymentRequest({requestId:req.id,adminId:'12345678'}),approveManualPaymentRequest({requestId:req.id,adminId:'12345678'})]);expect(approvals.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  expect((await prisma.user.findUnique({where:{id:user.id}}))?.subscriptionDurationDays).toBe(30);expect((await prisma.discountOffer.findUnique({where:{id:offer.id}}))?.status).toBe('CLAIMED');
});
it('allows retry after a rejected card receipt but never accepts an expired new receipt',async()=>{
  const {user,offer}=await fixture();const first=await beginDiscountCheckout(offer.id,user.telegramId,'UZS');const req=await submitDiscountReceipt(offer.id,user.telegramId,'{}');await rejectManualPaymentRequest({requestId:req.id,adminId:'12345678'});
  const second=await beginDiscountCheckout(offer.id,user.telegramId,'UZS');expect(second.order).not.toBe(first.order);
  await vi.advanceTimersByTimeAsync(3600000);await expect(submitDiscountReceipt(offer.id,user.telegramId,'{}')).rejects.toThrow('expired');expect(await prisma.manualPaymentRequest.count()).toBe(1);
});
it('requires admin authentication and creates the campaign through the Plans API',async()=>{
  await member();const body={requestId:crypto.randomUUID(),plan:'PLUS',percent:20,recipientCount:1,validMinutes:60};
  expect((await request(app).post('/admin/plans/discounts').send(body)).status).toBe(401);
  const token=jwt.sign({telegramId:'12345678',role:'admin'},env.JWT_SECRET,{algorithm:'HS256'});
  expect((await request(app).post('/admin/plans/discounts').set('Authorization',`Bearer ${token}`).send({...body,percent:101})).status).toBe(400);
  const response=await request(app).post('/admin/plans/discounts').set('Authorization',`Bearer ${token}`).send(body);expect(response.status).toBe(201);expect(response.body.starsPrice).toBe(80);
  const list=await request(app).get('/admin/plans/discounts').set('Authorization',`Bearer ${token}`);expect(list.body.campaigns).toHaveLength(1);
});
