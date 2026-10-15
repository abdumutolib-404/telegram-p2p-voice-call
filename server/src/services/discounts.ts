import crypto from 'node:crypto';
import type { DiscountCampaign, DiscountOffer, Prisma, User } from '@prisma/client';
import { prisma } from '../config/database';
import { discountCampaignInput, discountedPrice, discountPlan } from '../contracts/discounts';
import { getPaidUserProfile, isDowngrade } from './plan';
import { loadPlanConfiguration } from './planConfiguration';
import { hasAcceptedCurrentTerms } from './terms';
import { lockRow } from '../utils/transactionLock';
import { persistNotification } from '../bot/notifications';
import { escapeHtml } from '../utils/sanitize';
import { logger } from '../utils/logger';

export class DiscountError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
function authorizationTime(campaign:DiscountCampaign):Date{
  const now=new Date();
  if(campaign.expiresAt<=now)throw new DiscountError(410,'This limited offer has expired.');
  return now;
}
function eligible(user: User, tier: string, consent = true): boolean {
  if (user.isBanned || user.isPermanentlyBanned || (user.bannedUntil && user.bannedUntil > new Date())) return false;
  if (consent && (!user.onboarded || !hasAcceptedCurrentTerms(user))) return false;
  const profile = getPaidUserProfile(user);
  return !profile.isActivePaid || (profile.plan !== tier && !isDowngrade(profile.plan, tier));
}
function publicOffer(offer: DiscountOffer, campaign: DiscountCampaign) {
  const plan=discountPlan(campaign.planSnapshot);
  return { id: offer.id, plan: campaign.plan, planName: plan.name, validityDays:plan.subscriptionDurationDays, percent: campaign.percent,
    originalStars: campaign.originalStars, originalUzs: campaign.originalUzs, starsPrice: campaign.starsPrice, uzsPrice: campaign.uzsPrice,
    expiresAt: campaign.expiresAt, status: offer.status };
}
export async function createDiscountCampaign(input: unknown, adminId: string) {
  const data = discountCampaignInput.parse(input);
  const plans = await loadPlanConfiguration();
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(736251010)::text`;
    const previous = await tx.discountCampaign.findUnique({where:{requestId:data.requestId}});
    if (previous) {
      if (previous.adminId !== adminId || ['plan','percent','recipientCount','validMinutes'].some(key => previous[key as keyof typeof previous] !== data[key as keyof typeof data])) throw new DiscountError(409,'This submission ID was already used for another campaign.');
      return previous;
    }
    const config = plans[data.plan];
    if (!config.active || config.starsPrice <= 0 || config.uzsPrice <= 0) throw new DiscountError(400,'Choose an available paid plan with positive published prices.');
    const pending=new Set((await tx.manualPaymentRequest.findMany({where:{status:'PENDING'}})).map(item=>item.userId));
    const activeCampaignIds=(await tx.discountCampaign.findMany({where:{expiresAt:{gt:new Date()}},select:{id:true}})).map(item=>item.id);
    const paying=new Set((await tx.discountOffer.findMany({where:{status:'PAYING',campaignId:{in:activeCampaignIds}}})).map(item=>item.userId));
    const users = (await tx.user.findMany()).filter(user => eligible(user,data.plan)&&!pending.has(user.id)&&!paying.has(user.id));
    if (users.length < data.recipientCount) throw new DiscountError(409,`Only ${users.length} eligible users are available. Reduce the recipient count.`);
    // Partial Fisher–Yates: uniform sampling without replacement, once per campaign.
    for (let i=0;i<data.recipientCount;i++) { const j=crypto.randomInt(i,users.length);[users[i],users[j]]=[users[j],users[i]]; }
    const campaign = await tx.discountCampaign.create({data:{...data,adminId,originalStars:config.starsPrice,originalUzs:config.uzsPrice,
      starsPrice:discountedPrice(config.starsPrice,data.percent),uzsPrice:discountedPrice(config.uzsPrice,data.percent),planSnapshot:JSON.stringify(config),expiresAt:new Date(Date.now()+data.validMinutes*60000)}});
    await tx.discountOffer.createMany({data:users.slice(0,data.recipientCount).map(user=>({campaignId:campaign.id,userId:user.id,status:'AVAILABLE',noticeQueuedAt:null,checkoutCurrency:null,checkoutOrder:null,preCheckoutId:null,authorizedAt:null,claimedAt:null,claimedPaymentId:null}))});
    await tx.auditLog.create({data:{action:'DISCOUNT_CAMPAIGN_CREATED',targetId:campaign.id,adminId,afterState:JSON.stringify(data),reason:'Exclusive random-user discount campaign'}});
    return campaign;
  },{maxWait:10000,timeout:30000});
}
export async function listDiscountCampaigns() {
  const campaigns = await prisma.discountCampaign.findMany({take:20,orderBy:{createdAt:'desc'}});
  return Promise.all(campaigns.map(async campaign=>({id:campaign.id,plan:campaign.plan,planName:discountPlan(campaign.planSnapshot).name,percent:campaign.percent,recipientCount:campaign.recipientCount,
    originalStars:campaign.originalStars,originalUzs:campaign.originalUzs,starsPrice:campaign.starsPrice,uzsPrice:campaign.uzsPrice,expiresAt:campaign.expiresAt,createdAt:campaign.createdAt,
    claimed:await prisma.discountOffer.count({where:{campaignId:campaign.id,status:'CLAIMED'}})})));
}
export async function activeDiscountOffers(user: User) {
  const offers=await prisma.discountOffer.findMany({where:{userId:user.id,status:{in:['AVAILABLE','CHECKOUT']}},orderBy:{createdAt:'desc'},take:100});
  const result=[];
  for(const offer of offers){const campaign=await prisma.discountCampaign.findUnique({where:{id:offer.campaignId}});if(campaign&&campaign.expiresAt>new Date()&&eligible(user,campaign.plan))result.push(publicOffer(offer,campaign));}
  return result;
}
export function startDiscountNoticeWorker():()=>Promise<void>{
  let stopped=false,active:Promise<void>|undefined,timer:NodeJS.Timeout|undefined;
  const tick=async()=>{if(stopped)return;active=recoverDiscountNotices(()=>stopped).catch(error=>logger.warn('Discount notification recovery unavailable',{service:'discounts'},error));await active;active=undefined;if(!stopped)timer=setTimeout(tick,5000);};
  timer=setTimeout(tick,1000);
  return async()=>{stopped=true;clearTimeout(timer);await active;};
}
export async function recoverDiscountNotices(stopped:()=>boolean=()=>false) {
  const offers=await prisma.discountOffer.findMany({where:{noticeQueuedAt:null},take:50,orderBy:{createdAt:'asc'}});
  for(const offer of offers){
    if(stopped())return;
    try { await prisma.$transaction(async tx=>{
      const current=await tx.discountOffer.findUnique({where:{id:offer.id}});
      if(!current||current.noticeQueuedAt)return;
      const campaign=await tx.discountCampaign.findUnique({where:{id:current.campaignId}}),user=await tx.user.findUnique({where:{id:current.userId}});
      if(campaign&&user&&campaign.expiresAt>new Date()&&current.status==='AVAILABLE'&&eligible(user,campaign.plan)){
        const name=escapeHtml(discountPlan(campaign.planSnapshot).name);
        await persistNotification(tx,user.telegramId.toString(),`An exclusive ${campaign.percent}% discount offer for <b>${name}</b> is available for you.\n\n⭐ <s>${campaign.originalStars}</s> → <b>${campaign.starsPrice} Stars</b>\n💳 <s>${campaign.originalUzs.toLocaleString('en-US')}</s> → <b>${campaign.uzsPrice.toLocaleString('en-US')} UZS</b>\n\nValid until ${campaign.expiresAt.toISOString().replace('T',' ').slice(0,16)} UTC. Claim once before it expires.`,
          {parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:'Claim Offer',callback_data:`discount:${current.id}`}]]}},false,`discount-offer:${current.id}`,campaign.expiresAt);
      }
      await tx.discountOffer.update({where:{id:current.id},data:{noticeQueuedAt:new Date()}});
    }); }catch(error){if(error instanceof Error&&error.message==='Notification queue is full.')return;throw error;}
  }
}
async function owned(tx:Prisma.TransactionClient,id:string,user:User,unexpired=true){
  const offer=await tx.discountOffer.findUnique({where:{id}});
  if(!offer||offer.userId!==user.id)throw new DiscountError(404,'This offer is not available for your account.');
  const campaign=await tx.discountCampaign.findUnique({where:{id:offer.campaignId}});
  if(!campaign)throw new DiscountError(404,'Offer not found.');
  if(unexpired)authorizationTime(campaign);
  return{offer,campaign};
}
async function buyer(tx:Prisma.TransactionClient,telegramId:bigint){
  const user=await tx.user.findUnique({where:{telegramId}});if(!user)throw new DiscountError(404,'Please register in the bot first.');
  await lockRow(tx,'User',user.id);return(await tx.user.findUnique({where:{id:user.id}}))!;
}
async function canPurchase(tx:Prisma.TransactionClient,user:User,campaign:DiscountCampaign){
  if(!eligible(user,campaign.plan))throw new DiscountError(409,'This plan is unavailable for your current account or subscription.');
  if(await tx.manualPaymentRequest.findFirst({where:{userId:user.id,status:'PENDING'}}))throw new DiscountError(409,'Your payment request is already under review.');
  const activeCampaignIds=(await tx.discountCampaign.findMany({where:{expiresAt:{gt:new Date()}},select:{id:true}})).map(item=>item.id);
  if(await tx.discountOffer.findFirst({where:{userId:user.id,status:'PAYING',campaignId:{in:activeCampaignIds}}}))throw new DiscountError(409,'An offer payment is awaiting confirmation.');
}
export async function viewDiscountOffer(id:string,telegramId:bigint){
  const user=await prisma.user.findUnique({where:{telegramId}});if(!user)throw new DiscountError(404,'Please register in the bot first.');
  const {offer,campaign}=await owned(prisma,id,user);
  if(!['AVAILABLE','CHECKOUT'].includes(offer.status))throw new DiscountError(409,'This offer has been claimed or its payment is awaiting confirmation.');
  if(!eligible(user,campaign.plan))throw new DiscountError(409,'This plan is unavailable for your current subscription.');
  return publicOffer(offer,campaign);
}
export async function beginDiscountCheckout(id:string,telegramId:bigint,currency:'XTR'|'UZS'){
  return prisma.$transaction(async tx=>{
    const user=await buyer(tx,telegramId),{offer,campaign}=await owned(tx,id,user);
    if(campaign.percent===100)throw new DiscountError(400,'This offer is free. Use Claim Offer to activate it.');
    if(!['AVAILABLE','CHECKOUT'].includes(offer.status))throw new DiscountError(409,'This offer has been claimed or its payment is awaiting confirmation.');
    await canPurchase(tx,user,campaign);
    const order=offer.checkoutCurrency===currency&&offer.checkoutOrder?offer.checkoutOrder:`D${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
    authorizationTime(campaign);
    await tx.discountOffer.update({where:{id},data:{status:'CHECKOUT',checkoutCurrency:currency,checkoutOrder:order}});
    return{offer:publicOffer(offer,campaign),order,payload:`discount_purchase:${id}:${telegramId}:${order}`};
  });
}
export async function authorizeDiscountStars(id:string,telegramId:bigint,order:string,amount:number,queryId:string){
  return prisma.$transaction(async tx=>{
    const user=await buyer(tx,telegramId),{offer,campaign}=await owned(tx,id,user);
    if(offer.checkoutCurrency!=='XTR'||offer.checkoutOrder!==order||campaign.starsPrice!==amount||amount<=0)throw new DiscountError(409,'This invoice is no longer valid. Reopen your offer.');
    if(offer.status==='PAYING'&&offer.preCheckoutId===queryId)return;
    if(offer.status!=='CHECKOUT')throw new DiscountError(409,'This offer has already been claimed or payment is in progress.');
    await canPurchase(tx,user,campaign);
    const authorizedAt=authorizationTime(campaign);
    await tx.discountOffer.update({where:{id},data:{status:'PAYING',preCheckoutId:queryId,authorizedAt}});
  });
}
async function grant(tx:Prisma.TransactionClient,userId:string,campaign:DiscountCampaign){
  const config=discountPlan(campaign.planSnapshot),now=new Date();
  return tx.user.update({where:{id:userId},data:{plan:campaign.plan,subscriptionStatus:'ACTIVE',subscriptionStartsAt:now,subscriptionExpiresAt:new Date(now.getTime()+config.subscriptionDurationDays*86400000),subscriptionDurationDays:config.subscriptionDurationDays,
    maxDuration:config.maxDuration,dailyLimit:config.dailyLimit,dailyCallsUsed:0,recordingLimitOverride:null,retentionOverride:null,customPlanName:null}});
}
export async function claimFreeDiscount(id:string,telegramId:bigint){
  return prisma.$transaction(async tx=>{
    const user=await buyer(tx,telegramId),{offer,campaign}=await owned(tx,id,user);
    if(campaign.percent!==100||campaign.starsPrice!==0||campaign.uzsPrice!==0)throw new DiscountError(400,'This offer requires payment.');
    if(!['AVAILABLE','CHECKOUT'].includes(offer.status))throw new DiscountError(409,'This offer has already been claimed.');
    await canPurchase(tx,user,campaign);
    const claimedAt=authorizationTime(campaign);
    await tx.discountOffer.update({where:{id},data:{status:'CLAIMED',claimedAt,claimedPaymentId:'FREE'}});
    await tx.auditLog.create({data:{action:'DISCOUNT_OFFER_CLAIMED',targetId:id,adminId:'SYSTEM',reason:'100% discount activation'}});
    return grant(tx,user.id,campaign);
  });
}
export async function settleDiscountStars(input:{id:string;telegramId:bigint;order:string;amount:number;chargeId:string}){
  return prisma.$transaction(async tx=>{
    const user=await buyer(tx,input.telegramId);
    if(await tx.starsTransaction.findUnique({where:{telegramPaymentId:input.chargeId}}))return{status:'duplicate' as const};
    const offer=await tx.discountOffer.findUnique({where:{id:input.id}}),campaign=offer?await tx.discountCampaign.findUnique({where:{id:offer.campaignId}}):null;
    const valid=offer&&campaign&&offer.userId===user.id&&offer.status==='PAYING'&&offer.checkoutCurrency==='XTR'&&offer.checkoutOrder===input.order&&offer.authorizedAt&&offer.authorizedAt<campaign.expiresAt&&campaign.starsPrice===input.amount&&eligible(user,campaign.plan,false);
    // Never discard a settled charge: persist a refundable transaction if entitlement cannot be applied.
    const purchase=await tx.starsTransaction.create({data:{userId:user.id,telegramPaymentId:input.chargeId,starsAmount:input.amount,planTier:campaign?.plan??'PLUS',discountOfferId:offer?.id,orderNumber:valid?input.order:null,
      status:valid?'PAID':'REFUND_PROCESSING',entitlementApplied:Boolean(valid),...(valid?{}:{refundRequestedAt:new Date(),refundAdminId:'SYSTEM',refundReason:'Discount offer unavailable, already used or payment does not match its authorization'})}});
    if(!valid)return{status:'refund' as const,transactionId:purchase.id};
    await tx.discountOffer.update({where:{id:offer.id},data:{status:'CLAIMED',claimedAt:new Date(),claimedPaymentId:input.chargeId}});
    const updated=await grant(tx,user.id,campaign);
    await tx.starsTransaction.update({where:{id:purchase.id},data:{entitlementStartsAt:updated.subscriptionStartsAt,entitlementExpiresAt:updated.subscriptionExpiresAt,refundCallLimit:discountPlan(campaign.planSnapshot).dailyLimit}});
    return{status:'success' as const,user:updated};
  });
}
export async function submitDiscountReceipt(id:string,telegramId:bigint,paymentProof:string){
  return prisma.$transaction(async tx=>{
    const user=await buyer(tx,telegramId),{offer,campaign}=await owned(tx,id,user);
    if(offer.status!=='CHECKOUT'||offer.checkoutCurrency!=='UZS'||!offer.checkoutOrder)throw new DiscountError(409,'Reopen your offer and choose card payment before submitting a receipt.');
    await canPurchase(tx,user,campaign);
    const authorizedAt=authorizationTime(campaign);
    const proof=JSON.stringify({...JSON.parse(paymentProof),orderNumber:offer.checkoutOrder});
    const request=await tx.manualPaymentRequest.create({data:{orderNumber:offer.checkoutOrder,userId:user.id,telegramId,alias:user.alias,plan:campaign.plan,uzsAmount:campaign.uzsPrice,paymentProof:proof,discountOfferId:id,status:'PENDING'}});
    await tx.discountOffer.update({where:{id},data:{status:'SUBMITTED',authorizedAt,claimedPaymentId:request.id}});
    return request;
  });
}
