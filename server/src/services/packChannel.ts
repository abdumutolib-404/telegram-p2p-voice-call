import crypto from 'node:crypto';
import type { Bot } from 'grammy';
import type { PackCampaign } from '@prisma/client';
import { prisma } from '../config/database';
import { campaignQuote, heldPackSlots, OFFER_CHANNEL_ID } from './packOfferInventory';
import { logger } from '../utils/logger';
import { lockRow } from '../utils/transactionLock';

type ChannelBot=Pick<Bot,'api'>;
type ApiSignal=Parameters<Bot['api']['sendMessage']>[3];

export function packChannelPost(campaign:PackCampaign,username:string,held=0) {
  if(!/^[A-Za-z0-9_]+$/.test(username))throw new Error('The bot username is unavailable.');
  const quote=campaignQuote(campaign),pack=quote.pack;
  const remaining=Math.max(0,campaign.maximumClaims-campaign.claimedCount);
  const active=['DRAFT','ACTIVE'].includes(campaign.status)&&campaign.expiresAt>new Date()&&remaining>0;
  const format=(n:number)=>n.toLocaleString('en-US');
  const text=`<b>${active?'New PairTalk offer':campaign.status==='SOLD_OUT'?'Offer sold out':'Offer ended'}</b>\n\nCalls: ${format(pack.calls)} × ${pack.minutes} minutes\nRecordings: ${format(pack.recordings)}\n30-day retention: ${pack.retention?'✅ Included':'❌ Not included'}\n\n<b>${campaign.percent}% off</b>\n<s>${format(quote.originalUzs)} UZS</s> → <b>${format(quote.uzs)} UZS</b>\n<s>${format(quote.originalStars)} Stars</s> → <b>${format(quote.stars)} Stars</b>\n\nAvailable: ${format(remaining)}/${format(campaign.maximumClaims)}${held?` (${format(held)} temporarily reserved)`:''}\nValid until ${campaign.expiresAt.toISOString().replace('T',' ').slice(0,16)} UTC.\nOne purchase per person. ${quote.free?'Claim this pack free.':'Choose your payment method at checkout.'}`;
  return {text,parse_mode:'HTML' as const,link_preview_options:{is_disabled:true},reply_markup:{inline_keyboard:active?[[{text:quote.free?'Claim free offer':'Claim offer',url:`https://t.me/${username}?startapp=offer_${campaign.id}`}]]:[]}};
}

async function acknowledgeEdit(campaign:PackCampaign,owner:string) {
  const data={syncedRevision:campaign.revision,leaseUntil:null,owner:null,failure:null,messageState:'PUBLISHED',nextAttemptAt:new Date(Date.now()+60000)};
  const changed=await prisma.packCampaign.updateMany({where:{id:campaign.id,owner,revision:campaign.revision},data});
  // Preserve a purchase's immediate wake-up if it committed during this API call.
  if(!changed.count)await prisma.packCampaign.updateMany({where:{id:campaign.id,owner},data:{syncedRevision:campaign.revision,leaseUntil:null,owner:null,failure:null,messageState:'PUBLISHED'}});
}

/** Durable campaign state handles channel operations; no private offer sender. */
export async function reconcilePackChannel(bot:ChannelBot,stopped:()=>boolean=()=>false,signal?:ApiSignal) {
  const now=new Date();
  await prisma.packCampaign.updateMany({where:{status:{in:['DRAFT','ACTIVE']},expiresAt:{lte:now}},data:{status:'EXPIRED',revision:{increment:1},nextAttemptAt:now}});
  await prisma.packCampaign.updateMany({where:{messageState:'PUBLISHING',leaseUntil:{lte:now}},data:{messageState:'UNCONFIRMED',owner:null,leaseUntil:null,failure:'Publication acknowledgement was lost. Link the existing channel message; automatic reposting is disabled.'}});
  const due=await prisma.packCampaign.findMany({where:{messageState:{in:['QUEUED','PUBLISHED','RECOVERING','RETRY']},nextAttemptAt:{lte:now},OR:[{leaseUntil:null},{leaseUntil:{lte:now}}]},orderBy:{nextAttemptAt:'asc'},take:10});
  if(!due.length)return;
  const me=await bot.api.getMe(signal);
  for(const candidate of due){
    if(stopped()||signal?.aborted)return;
    const owner=crypto.randomUUID();
    const lease=await prisma.packCampaign.updateMany({where:{id:candidate.id,messageState:candidate.messageState,OR:[{leaseUntil:null},{leaseUntil:{lte:new Date()}}]},data:{owner,leaseUntil:new Date(Date.now()+90000),...(candidate.messageState==='QUEUED'?{messageState:'PUBLISHING'}:{})}});
    if(lease.count!==1)continue;
    const campaign=await prisma.packCampaign.findUniqueOrThrow({where:{id:candidate.id}});
    const closed=!['DRAFT','ACTIVE'].includes(campaign.status)||campaign.expiresAt<=new Date();
    let publishing=!campaign.telegramMessageId;
    let buttonsRemoved=false;
    try{
      if(publishing&&closed){await prisma.packCampaign.updateMany({where:{id:campaign.id,owner},data:{messageState:'DELETED',owner:null,leaseUntil:null}});continue;}
      const post=packChannelPost(campaign,me.username,await heldPackSlots(prisma,campaign.id));
      if(publishing){
        const sent=await bot.api.sendMessage(OFFER_CHANNEL_ID,post.text,{parse_mode:post.parse_mode,reply_markup:post.reply_markup,link_preview_options:post.link_preview_options},signal);
        await prisma.$transaction(async tx=>{
          await lockRow(tx,'PackCampaign',campaign.id);
          const current=await tx.packCampaign.findUniqueOrThrow({where:{id:campaign.id}});
          if(current.owner!==owner)return;
          await tx.packCampaign.update({where:{id:campaign.id},data:{telegramMessageId:sent.message_id,telegramMessageAt:new Date(sent.date*1000),messageState:'PUBLISHED',status:current.status==='DRAFT'?(current.expiresAt>new Date()?'ACTIVE':'EXPIRED'):current.status,syncedRevision:campaign.revision,owner:null,leaseUntil:null,failure:null,nextAttemptAt:new Date(current.expiresAt>new Date()?Date.now()+60000:Date.now())}});
        });
        continue;
      }
      try{await bot.api.editMessageText(OFFER_CHANNEL_ID,campaign.telegramMessageId!,post.text,{parse_mode:post.parse_mode,reply_markup:post.reply_markup,link_preview_options:post.link_preview_options},signal);}
      catch(error){if(!/message is not modified/i.test((error as {description?:string}).description??''))throw error;}
      buttonsRemoved=closed;
      if(closed){
        // The server disabled inventory before this edit removes claim buttons.
        // A message older than 48 hours cannot be deleted through the Bot API.
        if(campaign.telegramMessageAt&&Date.now()-campaign.telegramMessageAt.getTime()>=48*3600000){
          await prisma.packCampaign.updateMany({where:{id:campaign.id,owner},data:{messageState:'MANUAL_CLEANUP',owner:null,leaseUntil:null,failure:'Offer disabled and buttons removed. Telegram cannot delete this message after 48 hours; a channel administrator must remove it.'}});
          continue;
        }
        try{await bot.api.deleteMessage(OFFER_CHANNEL_ID,campaign.telegramMessageId!,signal);}
        catch(error){if(!/message to delete not found/i.test((error as {description?:string}).description??''))throw error;}
        await prisma.packCampaign.updateMany({where:{id:campaign.id,owner},data:{messageState:'DELETED',syncedRevision:campaign.revision,owner:null,leaseUntil:null,failure:null}});
      }else if(campaign.messageState==='RECOVERING'&&campaign.status==='DRAFT'){
        await prisma.$transaction(async tx=>{await lockRow(tx,'PackCampaign',campaign.id);const current=await tx.packCampaign.findUniqueOrThrow({where:{id:campaign.id}});if(current.owner===owner)await tx.packCampaign.update({where:{id:campaign.id},data:{status:current.expiresAt>new Date()?'ACTIVE':'EXPIRED',messageState:'PUBLISHED',syncedRevision:campaign.revision,owner:null,leaseUntil:null,failure:null,nextAttemptAt:new Date()}});});
      }else await acknowledgeEdit(campaign,owner);
    }catch(error){
      const apiError=error as {error_code?:number;parameters?:{retry_after?:number}};
      const rejected=[400,401,403].includes(apiError.error_code??0);
      const delay=apiError.error_code===429?Math.max(5,Math.min(3600,Number(apiError.parameters?.retry_after)||60)):60;
      await prisma.packCampaign.updateMany({where:{id:campaign.id,owner},data:{messageState:publishing?(rejected?'FAILED':apiError.error_code===429?'QUEUED':'UNCONFIRMED'):buttonsRemoved?'MANUAL_CLEANUP':rejected?'FAILED':'RETRY',owner:null,leaseUntil:null,nextAttemptAt:new Date(Date.now()+delay*1000),failure:publishing?'Channel publication failed or is unconfirmed. Review before retrying; do not post a duplicate.':buttonsRemoved?'Offer disabled and claim buttons removed. Automatic deletion failed; remove this post as a channel administrator.':'Channel message could not be reconciled. Inventory remains protected on the server; check bot permissions.'}});
      logger.warn('Channel offer reconciliation deferred',{service:'packOffers',campaignId:campaign.id,operation:publishing?'publish':'edit_or_delete',rejected});
    }
  }
}

export function startPackChannelWorker(supplier:()=>ChannelBot|null):()=>Promise<void> {
  let stopped=false,timer:NodeJS.Timeout|undefined,active:Promise<void>|undefined,controller:AbortController|undefined;
  const tick=async()=>{
    if(stopped)return;
    const bot=supplier();
    if(bot){controller=new AbortController();const timeout=setTimeout(()=>controller?.abort(),60000);active=reconcilePackChannel(bot,()=>stopped,controller.signal as unknown as ApiSignal).catch(()=>logger.warn('Channel offer worker unavailable',{service:'packOffers'}));await active;clearTimeout(timeout);active=undefined;}
    if(!stopped)timer=setTimeout(tick,5000);
  };
  timer=setTimeout(tick,1000);
  return async()=>{stopped=true;clearTimeout(timer);controller?.abort();await active;};
}
