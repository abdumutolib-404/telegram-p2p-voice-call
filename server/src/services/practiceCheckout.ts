import crypto from 'node:crypto';
import type { CreditOrder, Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { env } from '../config/env';
import { isPracticeCatalog, quotePracticePack, validatePracticePack, type PracticePack } from '../contracts/practicePacks';
import type { PracticeCheckoutSnapshot } from '../contracts/practiceCheckout';
import { CREDIT_TERMS_VERSION } from '../contracts/credits';
import { lockRow } from '../utils/transactionLock';
import { readCreditConfiguration } from './creditConfiguration';
import { isAccountRestricted } from './accountRestriction';
import { hasAcceptedCurrentTerms } from './terms';
import { campaignQuote, heldPackSlots, finishPackClaim, lockOrderCampaign, assertClaimAuthorization } from './packOfferInventory';
import { assertWalletHeadroom } from './walletCapacity';

export type CheckoutCurrency = 'XTR' | 'UZS';
// PostgreSQL/Telegram amounts are signed whole integers in the existing ledger.
// This is a representation check, not a product quantity ceiling.
function assertLedgerAmounts(values: number[]) {
  if (values.some(value => !Number.isSafeInteger(value) || value < 0 || value > 2147483647))
    throw new Error('This total exceeds the payment ledger range. Split it into separate purchases.');
}
export function practiceOrderDescription(order: Pick<CreditOrder,'calls'|'recordings'|'storage'|'packSnapshot'>) {
  if (!order.packSnapshot) return `${order.calls} calls, ${order.recordings} recordings (15-minute units)`;
  const pack = validatePracticePack(JSON.parse(order.packSnapshot));
  return `${pack.calls} × ${pack.minutes}-minute calls, ${pack.recordings} recordings${pack.retention ? ', with 30-day retention' : ', without extended retention'}`;
}
export async function createPracticeOrder(userId: string, requestId: string, input: PracticePack, revision: string, currency: CheckoutCurrency, campaignId?:string) {
  const pack = validatePracticePack(input);
  if (currency !== 'XTR' && currency !== 'UZS') throw new Error('Choose UZS or Stars.');
  const { packs:published } = await readCreditConfiguration();
  if (!published.salesEnabled) throw new Error('Purchases are paused. Your balance remains available.');
  const source=campaignId?await prisma.packCampaign.findUnique({where:{id:campaignId}}):null;
  if(campaignId&&!source)throw new Error('Offer not found.');
  const offered=source?campaignQuote(source):null;
  const packs=offered?.catalog??published;
  const quote=offered??quotePracticePack(pack,packs.prices);
  if(currency==='UZS'&&!quote.free&&(!env.MANUAL_PAYMENT_CARD_HOLDER||env.MANUAL_PAYMENT_CARD_HOLDER==='PairTalk Official (Humo / Uzcard)'||!env.MANUAL_PAYMENT_INSTRUCTIONS))
    throw new Error('UZS payment details are not configured. Use Stars or contact /paysupport.');
  if(offered&&JSON.stringify(pack)!==JSON.stringify(offered.pack))throw new Error('Review this offer’s fixed pack before checking out.');
  assertLedgerAmounts([quote.callUnits, quote.recordingUnits, quote.retentionUnits, quote.stars, quote.uzs]);
  const snapshot = JSON.stringify(pack);
  const {persistNotification}=await import('../bot/notifications');
  return prisma.$transaction(async tx => {
    await lockRow(tx, 'User', userId);
    const user = await tx.user.findUnique({where:{id:userId}});
    if (!user || isAccountRestricted(user) || !hasAcceptedCurrentTerms(user)) throw new Error('Complete registration before purchasing.');
    if(campaignId)await lockRow(tx,'PackCampaign',campaignId);
    const existing = await tx.creditOrder.findUnique({where:{requestId}});
    if (existing) {
      if (existing.userId !== userId || existing.packSnapshot !== snapshot || existing.catalogRevision !== revision || existing.checkoutCurrency !== currency)
        throw new Error('This checkout request already belongs to a different selection or currency.');
      const claim=existing.packClaimId?await tx.packClaim.findUnique({where:{id:existing.packClaimId}}):null;
      if((claim?.campaignId??null)!==(campaignId??null))throw new Error('This checkout belongs to another offer.');
      return existing;
    }
    if (revision !== packs.revision) throw new Error('Prices changed. Review the current total before paying.');
    let claimId:string|undefined;
    if(campaignId){
      const campaign=await tx.packCampaign.findUnique({where:{id:campaignId}});
      if(!campaign||campaign.status!=='ACTIVE'||campaign.expiresAt<=new Date())throw new Error('This offer is unavailable or expired.');
      const claim=await tx.packClaim.findUnique({where:{campaignId_userId:{campaignId,userId}}});
      if(claim?.status==='CLAIMED')throw new Error('You have already claimed this campaign.');
      const current=claim?.activeOrderId?await tx.creditOrder.findUnique({where:{id:claim.activeOrderId}}):null;
      if(current?.status==='PENDING'&&(current.expiresAt>new Date()||current.authorizedAt)){
        if(current.checkoutCurrency!==currency)throw new Error('This offer already has a checkout in the other currency. Complete or cancel it first.');
        return current;
      }
      if(campaign.claimedCount+await heldPackSlots(tx,campaignId)>=campaign.maximumClaims)throw new Error('All remaining offer slots are temporarily reserved by other checkouts. Try again later.');
      if(current?.status==='PENDING')await tx.creditOrder.update({where:{id:current.id},data:{status:'EXPIRED'}});
      claimId=claim?.id??(await tx.packClaim.create({data:{userId,campaignId}})).id;
    }
    if (currency === 'UZS') {
      const stale=await tx.manualPaymentRequest.findMany({where:{userId,status:'PENDING',paymentProof:null,creditOrder:{status:'PENDING',authorizedAt:null,expiresAt:{lte:new Date()}}}});
      for(const request of stale){await cancelPracticeOrder(tx,request.creditOrderId!);await tx.manualPaymentRequest.update({where:{id:request.id},data:{status:'REJECTED',adminNote:'Checkout expired before receipt submission'}});}
      if(await tx.manualPaymentRequest.findFirst({where:{userId,status:'PENDING'}}))throw new Error('A manual payment is already pending. Complete or cancel it in the bot first.');
    }
    await assertWalletHeadroom(tx,user,{calls:quote.callUnits,recordings:quote.recordingUnits,storage:quote.retentionUnits});
    if (quote.recordingUnits) {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(736251011)::text`;
      const stock = await tx.$queryRaw<{remaining:number}[]>`SELECT pairtalk_recording_capacity_remaining() AS remaining`;
      if ((stock[0]?.remaining ?? 0) < quote.recordingUnits * 16) throw new Error('Not enough recording capacity is available for this selection. Reduce recordings or buy calls separately.');
    }
    const order = await tx.creditOrder.create({data:{
      userId,requestId,calls:quote.callUnits,recordings:quote.recordingUnits,storage:quote.retentionUnits,
      starsAmount:quote.stars,uzsAmount:quote.uzs,catalogRevision:revision,catalogSnapshot:JSON.stringify(packs),
      packSnapshot:snapshot,checkoutCurrency:currency,termsVersion:CREDIT_TERMS_VERSION,
      packClaimId:claimId,
      status:quote.free?'PAID':'PENDING',paidAt:quote.free?new Date():null,
      expiresAt:new Date(Math.min(Date.now()+30*60000,source?.expiresAt.getTime()??Infinity)),
    }});
    if(claimId)await tx.packClaim.update({where:{id:claimId},data:{activeOrderId:order.id}});
    if(quote.free){
      await finishPackClaim(tx,order);
      await tx.user.update({where:{id:userId},data:{callCredits:{increment:order.calls},recordingCredits:{increment:order.recordings},storageCredits:{increment:order.storage}}});
      await tx.auditLog.create({data:{action:'FREE_PACK_CLAIM',targetId:order.id,adminId:user.telegramId.toString(),reason:'Public channel offer claimed once'}});
    }
    if (currency === 'UZS' && !quote.free) {
      const request = await tx.manualPaymentRequest.create({data:{
        orderNumber:`P${crypto.randomUUID().replaceAll('-','')}`,userId,telegramId:user.telegramId,alias:user.alias,
        plan:'PRACTICE_PACK',uzsAmount:order.uzsAmount,creditOrderId:order.id,
      }});
      const support = `@${(env.MANUAL_PAYMENT_ADMIN_USERNAME || 'PairTalkSupport').replace(/^@/,'')}`;
      const text = `PairTalk checkout\n\n${practiceOrderDescription(order)}\nTotal: ${order.uzsAmount.toLocaleString('en-US')} UZS\nOrder: ${request.orderNumber}\n\nPayment details: ${env.MANUAL_PAYMENT_CARD_HOLDER}\n${env.MANUAL_PAYMENT_INSTRUCTIONS}\n\nSend the receipt (photo or PDF) in this private chat before ${order.expiresAt.toISOString().replace('T',' ').slice(0,16)} UTC. Your purchase is added only after admin approval. Contact ${support} if any payment detail is unclear. Do not transfer to an unverified account.`;
      await persistNotification(tx,user.telegramId.toString(),text,{reply_markup:{inline_keyboard:[[{text:'Cancel checkout',callback_data:`cancel_manual_pay:${request.id}`}]]}},true,`pack-checkout:${order.id}`,order.expiresAt);
    }
    return order;
  });
}

/** Freeze a submitted receipt before expiry; pending payment alone grants nothing. */
export async function attachPracticePaymentProof(id: string, telegramId: bigint, proof: string) {
  return prisma.$transaction(async tx => {
    const initial = await tx.manualPaymentRequest.findUnique({where:{id}});
    if (!initial?.creditOrderId || initial.telegramId !== telegramId) throw new Error('Checkout not found.');
    await lockRow(tx,'User',initial.userId);
    const initialOrder=await tx.creditOrder.findUniqueOrThrow({where:{id:initial.creditOrderId}});
    await lockOrderCampaign(tx,initialOrder);
    await lockRow(tx,'CreditOrder',initial.creditOrderId);
    const request = await tx.manualPaymentRequest.findUnique({where:{id}});
    const order = await tx.creditOrder.findUnique({where:{id:initial.creditOrderId}});
    const user = await tx.user.findUnique({where:{id:initial.userId}});
    if (!request || request.status !== 'PENDING' || request.paymentProof || !order || order.status !== 'PENDING' || order.checkoutCurrency !== 'UZS' || order.expiresAt <= new Date() || !user || isAccountRestricted(user))
      throw new Error('This checkout is expired, unavailable or already submitted. Contact /paysupport if you transferred funds.');
    await assertClaimAuthorization(tx,order);
    // The manual transfer may already have happened. Preserve this order's
    // existing capacity hold rather than discard a timely receipt after an
    // admin lowers the recording allowance. New sales are checked separately.
    await tx.creditOrder.update({where:{id:order.id},data:{authorizedAt:new Date()}});
    return tx.manualPaymentRequest.update({where:{id},data:{paymentProof:proof}});
  });
}

export async function approvePracticePayment(id: string, adminId: string, note?: string) {
  const {persistNotification}=await import('../bot/notifications');
  return prisma.$transaction(async tx => {
    const first = await tx.manualPaymentRequest.findUnique({where:{id}});
    if (!first?.creditOrderId) throw new Error('Pack payment not found.');
    await lockRow(tx,'User',first.userId);
    const initialOrder=await tx.creditOrder.findUniqueOrThrow({where:{id:first.creditOrderId}});
    await lockOrderCampaign(tx,initialOrder);
    await lockRow(tx,'CreditOrder',first.creditOrderId);
    const request = await tx.manualPaymentRequest.findUnique({where:{id}});
    const order = await tx.creditOrder.findUnique({where:{id:first.creditOrderId}});
    const user = await tx.user.findUnique({where:{id:first.userId}});
    if (!request || request.status !== 'PENDING' || !request.paymentProof || !order || order.status !== 'PENDING' || !order.packSnapshot || order.checkoutCurrency !== 'UZS' || !order.authorizedAt || order.authorizedAt >= order.expiresAt || request.uzsAmount !== order.uzsAmount || !user || isAccountRestricted(user))
      throw new Error('Payment is not an authorized, submitted pack purchase awaiting approval.');
    await tx.creditOrder.update({where:{id:order.id},data:{status:'PAID',paidAt:new Date()}});
    const updatedRequest = await tx.manualPaymentRequest.update({where:{id},data:{status:'APPROVED',reviewedBy:adminId,reviewedAt:new Date(),adminNote:note || 'Pack payment verified'}});
    const updatedUser = await tx.user.update({where:{id:user.id},data:{callCredits:{increment:order.calls},recordingCredits:{increment:order.recordings},storageCredits:{increment:order.storage}}});
    await finishPackClaim(tx,order);
    await tx.auditLog.create({data:{action:'MANUAL_PACK_PAYMENT_APPROVAL',targetId:order.id,adminId,afterState:JSON.stringify({requestId:id,calls:order.calls,recordings:order.recordings,storage:order.storage}),reason:note || 'Verified manual pack payment'}});
    await persistNotification(tx,user.telegramId.toString(),`Payment approved. ${practiceOrderDescription(order)} added to your balance. Paid ${order.uzsAmount.toLocaleString('en-US')} UZS. Purchases do not expire.`,undefined,true,`pack-receipt:${order.id}`);
    return {request:updatedRequest,user:updatedUser};
  });
}

export async function cancelPracticeOrder(tx: Prisma.TransactionClient, orderId: string) {
  await lockRow(tx,'CreditOrder',orderId);
  await tx.creditOrder.updateMany({where:{id:orderId,status:'PENDING',checkoutCurrency:'UZS'},data:{status:'CANCELLED'}});
}

export async function cancelPendingPracticeCheckout(userId:string,id:string) {
  return prisma.$transaction(async tx=>{
    await lockRow(tx,'User',userId);
    const first=await tx.creditOrder.findUnique({where:{id}});
    if(!first||first.userId!==userId)throw new Error('Checkout not found.');
    await lockOrderCampaign(tx,first);await lockRow(tx,'CreditOrder',id);
    const order=await tx.creditOrder.findUniqueOrThrow({where:{id}});
    if(order.status==='CANCELLED')return {cancelled:true};
    if(order.status!=='PENDING'||order.authorizedAt)throw new Error('This payment is awaiting confirmation or has already completed. Check your balance or contact /paysupport before starting another payment.');
    const manual=await tx.manualPaymentRequest.findUnique({where:{creditOrderId:id}});
    if(manual?.paymentProof)throw new Error('This receipt is already awaiting review. Contact /paysupport.');
    if(manual)await tx.manualPaymentRequest.updateMany({where:{id:manual.id,status:'PENDING'},data:{status:'REJECTED',adminNote:'Checkout cancelled before payment authorization'}});
    await tx.creditOrder.update({where:{id},data:{status:'CANCELLED'}});
    return {cancelled:true};
  });
}

export async function resumePracticeCheckout(userId:string,id:string):Promise<PracticeCheckoutSnapshot> {
  const order=await prisma.creditOrder.findUnique({where:{id}});
  if(!order||order.userId!==userId)throw new Error('Checkout not found.');
  if(order.status!=='PENDING'||order.expiresAt<=new Date())throw new Error('This checkout is already used or expired. Review your balance.');
  if(order.authorizedAt)throw new Error('This payment or receipt is awaiting confirmation. Check your balance before starting another payment.');
  if(!order.packSnapshot||order.termsVersion!==CREDIT_TERMS_VERSION)throw new Error('This older checkout cannot be resumed here. Use its original invoice or choose a current pack.');
  const pack=validatePracticePack(JSON.parse(order.packSnapshot)),catalog:unknown=JSON.parse(order.catalogSnapshot);
  if(!isPracticeCatalog(catalog))throw new Error('This checkout has an invalid price snapshot. Contact /paysupport.');
  let discountPercent=0,campaignId:string|undefined;
  if(order.packClaimId){
    await assertClaimAuthorization(prisma,order);
    const claim=await prisma.packClaim.findUniqueOrThrow({where:{id:order.packClaimId}}),campaign=await prisma.packCampaign.findUniqueOrThrow({where:{id:claim.campaignId}});
    discountPercent=campaign.percent;campaignId=campaign.id;
  }
  const quote=quotePracticePack(pack,catalog.prices,discountPercent);
  if(quote.stars!==order.starsAmount||quote.uzs!==order.uzsAmount)throw new Error('Checkout totals do not match the stored pack. Contact /paysupport.');
  return {orderId:order.id,requestId:order.requestId,currency:order.checkoutCurrency==='UZS'?'UZS':'XTR',pack,catalog,discountPercent,stars:order.starsAmount,uzs:order.uzsAmount,expiresAt:order.expiresAt.toISOString(),campaignId,serverNow:new Date().toISOString()};
}

async function debitUnusedPurchase(tx: Prisma.TransactionClient, order: CreditOrder) {
  const changed=await tx.user.updateMany({where:{id:order.userId,callCredits:{gte:order.calls},recordingCredits:{gte:order.recordings},storageCredits:{gte:order.storage}},data:{callCredits:{decrement:order.calls},recordingCredits:{decrement:order.recordings},storageCredits:{decrement:order.storage}}});
  if(changed.count!==1)throw new Error('The full purchased quantities must remain unused and unreserved. Contact /paysupport.');
}
export async function requestPracticeRefund(id:string,telegramId:bigint,cardNumber:string) {
  return prisma.$transaction(async tx=>{
    const first=await tx.manualPaymentRequest.findUnique({where:{id}});
    if(!first?.creditOrderId||first.telegramId!==telegramId)throw new Error('Purchase not found.');
    await lockRow(tx,'User',first.userId);await lockRow(tx,'CreditOrder',first.creditOrderId);
    const request=await tx.manualPaymentRequest.findUnique({where:{id}});
    const order=await tx.creditOrder.findUnique({where:{id:first.creditOrderId}});
    if(request?.status==='REFUND_PENDING'&&order?.status==='REFUND_PENDING')return {count:1};
    if(request?.status!=='APPROVED'||!order||order.status!=='PAID'||!order.paidAt||Date.now()-order.paidAt.getTime()>48*3600000)throw new Error('This purchase is outside the 48-hour unused-purchase refund period. Contact /paysupport.');
    // Remove units at request time so they cannot be spent while money is returned.
    await debitUnusedPurchase(tx,order);
    await tx.creditOrder.update({where:{id:order.id},data:{status:'REFUND_PENDING'}});
    await tx.manualPaymentRequest.update({where:{id},data:{status:'REFUND_PENDING',refundCardNumber:cardNumber,refundRequestedAt:new Date()}});
    await tx.auditLog.create({data:{action:'MANUAL_PACK_REFUND_REQUESTED',targetId:order.id,adminId:String(telegramId),reason:'Full unused purchase reserved for a manual refund'}});
    return {count:1};
  });
}
export async function reviewPracticeRefund(id:string,adminId:string,decision:'CONFIRM'|'REJECT',reason:string,proof?:string) {
  return prisma.$transaction(async tx=>{
    const first=await tx.manualPaymentRequest.findUnique({where:{id}});
    if(!first?.creditOrderId)throw new Error('Purchase not found.');
    await lockRow(tx,'User',first.userId);await lockRow(tx,'CreditOrder',first.creditOrderId);
    const request=await tx.manualPaymentRequest.findUnique({where:{id}});
    const order=await tx.creditOrder.findUnique({where:{id:first.creditOrderId}});
    if(request?.status!=='REFUND_PENDING'||!order||order.status!=='REFUND_PENDING')throw new Error('Refund request already processed or not submitted.');
    if(decision==='CONFIRM'&&!proof)throw new Error('Transfer proof is required to confirm a refund.');
    const user=decision==='REJECT'?await tx.user.update({where:{id:first.userId},data:{callCredits:{increment:order.calls},recordingCredits:{increment:order.recordings},storageCredits:{increment:order.storage}}}):await tx.user.findUniqueOrThrow({where:{id:first.userId}});
    await tx.creditOrder.update({where:{id:order.id},data:decision==='CONFIRM'?{status:'REFUNDED',refundedAt:new Date()}:{status:'PAID'}});
    const updated=await tx.manualPaymentRequest.update({where:{id},data:{status:decision==='CONFIRM'?'REFUNDED':'APPROVED',refundProof:proof,refundReason:reason,reviewedBy:adminId,reviewedAt:new Date()}});
    await tx.auditLog.create({data:{action:`MANUAL_PACK_REFUND_${decision==='CONFIRM'?'CONFIRMED':'REJECTED'}`,targetId:order.id,adminId,reason}});
    return {request:updated,user};
  });
}
