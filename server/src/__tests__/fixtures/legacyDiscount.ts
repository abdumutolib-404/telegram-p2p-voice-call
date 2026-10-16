import type {User} from '@prisma/client';
import {prisma} from '../../config/database';
import {discountCampaignInput,discountedPrice} from '../../contracts/discounts';
import {getPaidUserProfile,isDowngrade} from '../../services/plan';
import {loadPlanConfiguration} from '../../services/planConfiguration';
import {hasAcceptedCurrentTerms} from '../../services/terms';
import {DiscountError} from '../../services/discounts';

// Seed historical offers only to verify settlement of earlier invoices.
function eligible(user: User, tier: string, consent = true): boolean {
  if (user.isBanned || user.isPermanentlyBanned || (user.bannedUntil && user.bannedUntil > new Date())) return false;
  if (consent && (!user.onboarded || !hasAcceptedCurrentTerms(user))) return false;
  const profile = getPaidUserProfile(user);
  return !profile.isActivePaid || (profile.plan !== tier && !isDowngrade(profile.plan, tier));
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
    const campaign = await tx.discountCampaign.create({data:{...data,adminId,originalStars:config.starsPrice,originalUzs:config.uzsPrice,
      starsPrice:discountedPrice(config.starsPrice,data.percent),uzsPrice:discountedPrice(config.uzsPrice,data.percent),planSnapshot:JSON.stringify(config),expiresAt:new Date(Date.now()+data.validMinutes*60000)}});
    await tx.discountOffer.createMany({data:users.slice(0,data.recipientCount).map(user=>({campaignId:campaign.id,userId:user.id,status:'AVAILABLE',noticeQueuedAt:null,checkoutCurrency:null,checkoutOrder:null,preCheckoutId:null,authorizedAt:null,claimedAt:null,claimedPaymentId:null}))});
    await tx.auditLog.create({data:{action:'DISCOUNT_CAMPAIGN_CREATED',targetId:campaign.id,adminId,afterState:JSON.stringify(data),reason:'Exclusive random-user discount campaign'}});
    return campaign;
  },{maxWait:10000,timeout:30000});
}
