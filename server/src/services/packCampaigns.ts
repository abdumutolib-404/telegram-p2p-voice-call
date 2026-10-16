import { Prisma, type PackCampaign } from '@prisma/client';
import type { Bot } from 'grammy';
import { z } from 'zod';
import { prisma } from '../config/database';
import { readCreditConfiguration } from './creditConfiguration';
import { quotePracticePack, validatePracticePack } from '../contracts/practicePacks';
import { campaignQuote, OFFER_CHANNEL_ID, OFFER_CHANNEL_URL } from './packOfferInventory';
import { lockRow } from '../utils/transactionLock';

const integer=z.number().int().nonnegative().refine(Number.isSafeInteger);
const campaignInput=z.object({requestId:z.string().uuid(),revision:z.string().regex(/^[a-f0-9]{64}$/),calls:integer.min(1),recordings:integer,retention:z.boolean(),minutes:z.union([z.literal(15),z.literal(30)]),percent:z.number().min(0.01).max(100),maximumClaims:integer.min(1).max(2147483647),validMinutes:z.number().int().min(1).max(2820)}).strict();

export async function checkOfferChannel(bot:Pick<Bot,'api'>) {
  let me;
  try {
    me=await bot.api.getMe();
  }catch(error){throw channelCheckRequestError(error,'bot identity');}
  const botName=me.username&&/^[A-Za-z0-9_]{1,32}$/.test(me.username)?`@${me.username}`:'the configured bot';
  let member;
  try {
    member=await bot.api.getChatMember(OFFER_CHANNEL_ID,me.id);
  }catch(error){throw channelCheckRequestError(error,'channel access',botName);}
  if(member.status!=='creator'&&member.status!=='administrator') {
    throw new Error(`Channel verification failed. Add ${botName} as an administrator in @pairtalk, enable Post Messages, then check again.`);
  }
  if(member.status==='administrator'&&!member.can_post_messages) {
    throw new Error(`Channel verification failed. ${botName} is an administrator in @pairtalk but Post Messages is disabled. Enable that permission, then check again.`);
  }
  return {channelId:OFFER_CHANNEL_ID,channelUrl:OFFER_CHANNEL_URL,botUsername:me.username,ready:true};
}

function channelCheckRequestError(error:unknown,stage:'bot identity'|'channel access',botName='the configured bot') {
  const code=error&&typeof error==='object'&&'error_code' in error?error.error_code:undefined;
  // Provider errors can contain request URLs/tokens. Return only fixed, actionable text.
  if(code===401)return new Error('Channel verification failed. Telegram rejected the configured bot credentials. Check the bot token in Railway, then retry.');
  if(code===429)return new Error('Channel verification temporarily unavailable. Telegram is rate limiting requests. Wait briefly, then retry; channel permissions have not been verified.');
  if(stage==='channel access'&&(code===400||code===403))return new Error(`Channel verification failed. Telegram cannot access the configured @pairtalk channel. Add ${botName} as an administrator with Post Messages enabled, and verify that the configured channel ID ${OFFER_CHANNEL_ID} belongs to @pairtalk.`);
  return new Error(`Channel verification temporarily unavailable while checking ${stage}. Telegram could not complete the request. Retry shortly; this does not establish a missing permission.`);
}

export async function createPackCampaign(input:unknown,adminId:string,bot:Pick<Bot,'api'>) {
  const data=campaignInput.parse(input);
  const selection=validatePracticePack({calls:data.calls,recordings:data.recordings,retention:data.retention,minutes:data.minutes});
  const {packs}=await readCreditConfiguration();
  const quote=quotePracticePack(selection,packs.prices,data.percent);
  if([quote.callUnits,quote.recordingUnits,quote.retentionUnits,quote.originalStars,quote.originalUzs].some(n=>n>2147483647))throw new Error('The pack exceeds the payment ledger range. Choose a smaller pack.');
  await checkOfferChannel(bot);
  return prisma.$transaction(async tx=>{
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(736251012)::text`;
    const previous=await tx.packCampaign.findUnique({where:{requestId:data.requestId}});
    if(previous){
      if(previous.adminId!==adminId||previous.packSnapshot!==JSON.stringify(selection)||previous.percent!==data.percent||previous.maximumClaims!==data.maximumClaims||previous.validMinutes!==data.validMinutes||campaignQuote(previous).catalog.revision!==data.revision)throw new Error('This submission ID already belongs to a different campaign.');
      return previous;
    }
    if(data.revision!==packs.revision)throw new Error('Prices changed. Review the updated pack preview before creating an offer.');
    if(!packs.salesEnabled)throw new Error('Purchases are paused. Enable sales before publishing an offer.');
    const campaign=await tx.packCampaign.create({data:{requestId:data.requestId,adminId,packSnapshot:JSON.stringify(selection),catalogSnapshot:JSON.stringify(packs),percent:data.percent,maximumClaims:data.maximumClaims,validMinutes:data.validMinutes,expiresAt:new Date(Date.now()+data.validMinutes*60000)}});
    await tx.auditLog.create({data:{action:'CHANNEL_PACK_CAMPAIGN_CREATED',targetId:campaign.id,adminId,afterState:JSON.stringify({...selection,percent:data.percent,maximumClaims:data.maximumClaims,validMinutes:data.validMinutes}),reason:'One public channel offer; no random recipients or offer DMs'}});
    return campaign;
  });
}

export function publicPackCampaign(campaign:PackCampaign,held=0,claimStatus?:string) {
  const quote=campaignQuote(campaign);
  return {id:campaign.id,pack:quote.pack,catalog:quote.catalog,percent:campaign.percent,originalStars:quote.originalStars,originalUzs:quote.originalUzs,stars:quote.stars,uzs:quote.uzs,maximumClaims:campaign.maximumClaims,remaining:Math.max(0,campaign.maximumClaims-campaign.claimedCount),held,claimStatus:claimStatus??null,status:campaign.expiresAt<=new Date()?'EXPIRED':campaign.status,expiresAt:campaign.expiresAt.toISOString(),channelUrl:OFFER_CHANNEL_URL};
}

export async function listPackCampaigns(userId?:string,admin=false) {
  const campaigns=await prisma.packCampaign.findMany({where:admin?{}:{status:'ACTIVE',expiresAt:{gt:new Date()}},orderBy:{createdAt:'desc'},take:admin?50:20});
  if(!campaigns.length)return [];
  const ids=campaigns.map(c=>c.id);
  const holds=await prisma.$queryRaw<{campaignId:string;held:number}[]>(Prisma.sql`SELECT pc."campaignId",COUNT(*)::integer AS held FROM "CreditOrder" o JOIN "PackClaim" pc ON pc.id=o."packClaimId" WHERE pc."campaignId" IN (${Prisma.join(ids)}) AND o.status='PENDING' AND (o."expiresAt">NOW() OR o."authorizedAt" IS NOT NULL) GROUP BY pc."campaignId"`);
  const claims=userId?await prisma.packClaim.findMany({where:{userId,campaignId:{in:ids}}}):[];
  return campaigns.map(c=>({...publicPackCampaign(c,holds.find(h=>h.campaignId===c.id)?.held??0,claims.find(claim=>claim.campaignId===c.id)?.status),...(admin?{messageState:c.messageState,telegramMessageId:c.telegramMessageId,failure:c.failure,createdAt:c.createdAt}:{} )}));
}

export async function recoverCampaignMessage(id:string,messageId:number,adminId:string) {
  if(!Number.isSafeInteger(messageId)||messageId<1||messageId>2147483647)throw new Error('Enter the existing channel message ID.');
  return prisma.$transaction(async tx=>{
    await lockRow(tx,'PackCampaign',id);
    const campaign=await tx.packCampaign.findUnique({where:{id}});
    if(!campaign||!['UNCONFIRMED','FAILED'].includes(campaign.messageState))throw new Error('This publication is not awaiting recovery.');
    const updated=await tx.packCampaign.update({where:{id},data:{telegramMessageId:messageId,messageState:'RECOVERING',leaseUntil:null,owner:null,nextAttemptAt:new Date(),failure:null}});
    await tx.auditLog.create({data:{action:'CHANNEL_PACK_MESSAGE_RECOVERY',targetId:id,adminId,reason:`Admin linked existing channel message ${messageId}; the bot must confirm its edit before activation`}});
    return updated;
  });
}

export async function retryCampaignPublication(id:string,adminId:string) {
  return prisma.$transaction(async tx=>{
    await lockRow(tx,'PackCampaign',id);
    const c=await tx.packCampaign.findUnique({where:{id}});
    if(!c||c.messageState!=='FAILED'||c.telegramMessageId||c.expiresAt<=new Date())throw new Error('Only a rejected, unposted and unexpired publication can be retried. Link the existing message for an unconfirmed publication.');
    await tx.auditLog.create({data:{action:'CHANNEL_PACK_PUBLICATION_RETRY',targetId:id,adminId,reason:'Admin retried a rejected publication after checking channel permissions'}});
    return tx.packCampaign.update({where:{id},data:{messageState:'QUEUED',failure:null,nextAttemptAt:new Date()}});
  });
}
