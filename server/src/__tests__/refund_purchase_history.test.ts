import { expect, it, vi } from 'vitest';
import crypto from 'node:crypto';
import { prisma } from '../config/database';
import { processStarsRefund } from '../services/starsRefund';
import { purchaseRefundUsage } from '../services/refundUsage';
import { requestManualPaymentRefund, refundManualPaymentRequest, rejectManualPaymentRefund } from '../services/plan';

async function fixture(ageDays=65) {
  const suffix=crypto.randomUUID();
  const user=await prisma.user.create({data:{telegramId:BigInt(Date.now()+Math.floor(Math.random()*1000000)),alias:`refund-${suffix}`,plan:'FREE',dailyCallsUsed:0,lastCallDate:new Date().toISOString().slice(0,7)}});
  const partner=await prisma.user.create({data:{telegramId:BigInt(Date.now()+Math.floor(Math.random()*1000000)+2000000),alias:`partner-${suffix}`}});
  const start=new Date(Date.now()-ageDays*86400000);
  const purchase=await prisma.starsTransaction.create({data:{userId:user.id,telegramPaymentId:suffix,starsAmount:100,planTier:'PLUS',createdAt:start,entitlementStartsAt:start,entitlementExpiresAt:new Date(start.getTime()+30*86400000),refundCallLimit:10}});
  return {user,partner,purchase,start};
}
it('rejects a consumed historical purchase after expiry and month/counter reset before calling Telegram', async()=>{
  const {user,partner,purchase,start}=await fixture();
  await prisma.callSession.create({data:{roomName:crypto.randomUUID(),userAId:user.id,userBId:partner.id,status:'COMPLETED',duration:100,createdAt:new Date(start.getTime()+86400000)}});
  const provider={refundStarPayment:vi.fn(async()=>true)};
  await expect(processStarsRefund({transactionId:purchase.id,adminId:'fixture'},provider)).rejects.toThrow('eligibility');
  expect(provider.refundStarPayment).not.toHaveBeenCalled();
});
it('counts legacy purchase history conservatively instead of using the current month',async()=>{
  const {user,partner,purchase,start}=await fixture();
  await prisma.starsTransaction.update({where:{id:purchase.id},data:{entitlementStartsAt:null,entitlementExpiresAt:null,refundCallLimit:null}});
  await prisma.callSession.create({data:{roomName:crypto.randomUUID(),userAId:partner.id,userBId:user.id,status:'COMPLETED',duration:20,createdAt:new Date(start.getTime()+86400000)}});
  const legacy=await prisma.starsTransaction.findUnique({where:{id:purchase.id}});
  expect((await purchaseRefundUsage(legacy!,10)).callsUsed).toBe(1);
});
it('preserves unused historical refunds and the 48-hour policy for used purchases',async()=>{
  const unused=await fixture(); const provider={refundStarPayment:vi.fn(async()=>true)};
  await processStarsRefund({transactionId:unused.purchase.id,adminId:'fixture'},provider);
  const recent=await fixture(1);
  await prisma.callSession.create({data:{roomName:crypto.randomUUID(),userAId:recent.user.id,userBId:recent.partner.id,status:'COMPLETED',duration:20,createdAt:new Date(recent.start.getTime()+1000)}});
  await processStarsRefund({transactionId:recent.purchase.id,adminId:'fixture'},provider);
  expect(provider.refundStarPayment).toHaveBeenCalledTimes(2);
});
it('freezes the purchased limit and stops attribution at a later grant',async()=>{
  const {user,partner,purchase,start}=await fixture();
  const later=new Date(start.getTime()+10*86400000);
  await prisma.starsTransaction.create({data:{userId:user.id,telegramPaymentId:crypto.randomUUID(),starsAmount:200,planTier:'PRO',createdAt:later,entitlementStartsAt:later}});
  await prisma.callSession.create({data:{roomName:crypto.randomUUID(),userAId:user.id,userBId:partner.id,status:'COMPLETED',duration:20,createdAt:new Date(later.getTime()+1000)}});
  expect(await purchaseRefundUsage(purchase,999)).toEqual({callsUsed:0,callLimit:10});
});

it('enforces historical UZS usage at direct card submission and admin approval',async()=>{
  const {user,partner,start}=await fixture();
  const purchase=await prisma.manualPaymentRequest.create({data:{userId:user.id,telegramId:user.telegramId,
    plan:'PLUS',uzsAmount:10000,status:'APPROVED',createdAt:start,reviewedAt:start,refundCallLimit:10}});
  await prisma.callSession.create({data:{roomName:crypto.randomUUID(),userAId:user.id,userBId:partner.id,status:'COMPLETED',duration:60,createdAt:new Date(start.getTime()+1000)}});
  await expect(requestManualPaymentRefund(purchase.id,user.telegramId,'8600 1234 5678 9012')).rejects.toThrow('eligibility');
  const proof='data:application/pdf;base64,'+Buffer.from('%PDF-1.4\nsynthetic').toString('base64');
  await expect(refundManualPaymentRequest({requestId:purchase.id,adminId:'fixture',refundProof:proof})).rejects.toThrow('eligibility');
  expect((await prisma.manualPaymentRequest.findUnique({where:{id:purchase.id}}))?.status).toBe('APPROVED');
});
it('keeps legacy manual usage after a rejection changes its review timestamp',async()=>{
  const {user,partner,start}=await fixture();
  const purchase=await prisma.manualPaymentRequest.create({data:{userId:user.id,telegramId:user.telegramId,plan:'PLUS',uzsAmount:10000,status:'REFUND_PENDING',createdAt:start,reviewedAt:start}});
  await prisma.callSession.create({data:{roomName:crypto.randomUUID(),userAId:user.id,userBId:partner.id,status:'COMPLETED',duration:60,createdAt:new Date(start.getTime()+1000)}});
  await rejectManualPaymentRefund({requestId:purchase.id,adminId:'fixture',reason:'Synthetic review'});
  const rejected=await prisma.manualPaymentRequest.findUnique({where:{id:purchase.id}});
  expect((await purchaseRefundUsage(rejected!,10)).callsUsed).toBe(1);
  await expect(requestManualPaymentRefund(purchase.id,user.telegramId,'8600 1234 5678 9012')).rejects.toThrow('eligibility');
});
