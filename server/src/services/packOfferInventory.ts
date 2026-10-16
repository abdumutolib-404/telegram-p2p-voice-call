import type { CreditOrder, PackCampaign, Prisma } from '@prisma/client';
import { lockRow } from '../utils/transactionLock';
import { isPracticeCatalog, quotePracticePack, validatePracticePack } from '../contracts/practicePacks';

export const OFFER_CHANNEL_ID='-1004318847810';
export const OFFER_CHANNEL_URL='https://t.me/pairtalk';
export function campaignQuote(campaign:PackCampaign) {
  const catalog:unknown=JSON.parse(campaign.catalogSnapshot);
  if(!isPracticeCatalog(catalog))throw new Error('This offer has an invalid price snapshot. Contact support.');
  const pack=validatePracticePack(JSON.parse(campaign.packSnapshot));
  return {catalog,...quotePracticePack(pack,catalog.prices,campaign.percent)};
}

/** Call after locking the user and before locking this order. */
export async function lockOrderCampaign(tx:Prisma.TransactionClient,order:Pick<CreditOrder,'packClaimId'>) {
  if(!order.packClaimId)return;
  const claim=await tx.packClaim.findUnique({where:{id:order.packClaimId}});
  if(!claim)throw new Error('Offer claim not found.');
  await lockRow(tx,'PackCampaign',claim.campaignId);
}

export async function heldPackSlots(tx:Prisma.TransactionClient,campaignId:string) {
  return tx.creditOrder.count({where:{packClaim:{campaignId},status:'PENDING',OR:[{expiresAt:{gt:new Date()}},{authorizedAt:{not:null}}]}});
}

export async function assertClaimAuthorization(tx:Prisma.TransactionClient,order:CreditOrder) {
  if(!order.packClaimId)return;
  const claim=await tx.packClaim.findUnique({where:{id:order.packClaimId}});
  const campaign=claim?await tx.packCampaign.findUnique({where:{id:claim.campaignId}}):null;
  if(!claim||claim.status!=='HELD'||claim.activeOrderId!==order.id||claim.userId!==order.userId||!campaign||campaign.status!=='ACTIVE'||campaign.expiresAt<=new Date())throw new Error('This offer is unavailable or expired.');
}

/** The campaign lock serializes payment fulfillment with new slot allocation. */
export async function finishPackClaim(tx:Prisma.TransactionClient,order:CreditOrder) {
  if(!order.packClaimId)return;
  const claim=await tx.packClaim.findUnique({where:{id:order.packClaimId}});
  if(!claim||claim.userId!==order.userId||claim.activeOrderId!==order.id)throw new Error('Payment does not belong to the current offer claim.');
  if(claim.status==='CLAIMED')throw new Error('This campaign was already claimed.');
  const campaign=await tx.packCampaign.findUnique({where:{id:claim.campaignId}});
  if(!campaign||campaign.claimedCount>=campaign.maximumClaims)throw new Error('This campaign has no remaining purchase slots.');
  await tx.packClaim.update({where:{id:claim.id},data:{status:'CLAIMED',claimedAt:new Date()}});
  await tx.packCampaign.update({where:{id:campaign.id},data:{claimedCount:{increment:1},revision:{increment:1},nextAttemptAt:new Date(),...(campaign.claimedCount+1===campaign.maximumClaims?{status:'SOLD_OUT'}:{})}});
}
