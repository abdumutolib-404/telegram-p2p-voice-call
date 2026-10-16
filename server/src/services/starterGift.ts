import type { Bot } from 'grammy';
import { prisma } from '../config/database';
import { lockRow } from '../utils/transactionLock';
import { isAccountRestricted } from './accountRestriction';
import { hasAcceptedCurrentTerms } from './terms';
import { OFFER_CHANNEL_ID, OFFER_CHANNEL_URL } from './packOfferInventory';
import { assertWalletHeadroom } from './walletCapacity';

export async function claimStarterGift(userId:string,bot:Pick<Bot,'api'>) {
  const initial=await prisma.user.findUnique({where:{id:userId}});
  if(!initial||isAccountRestricted(initial)||!hasAcceptedCurrentTerms(initial))throw new Error('Complete registration before claiming starter practice.');
  if(initial.starterGiftGrantedAt)return {claimed:false,alreadyClaimed:true,channelUrl:OFFER_CHANNEL_URL};
  let subscribed=false;
  if(!Number.isSafeInteger(Number(initial.telegramId)))throw new Error('This Telegram identity cannot be checked safely. Contact support.');
  try{
    const me=await bot.api.getMe();
    const admin=await bot.api.getChatMember(OFFER_CHANNEL_ID,me.id);
    if(!['administrator','creator'].includes(admin.status))throw new Error('The bot must be a channel administrator.');
    const member=await bot.api.getChatMember(OFFER_CHANNEL_ID,Number(initial.telegramId));
    subscribed=['member','administrator','creator'].includes(member.status)||(member.status==='restricted'&&member.is_member);
  }catch{throw new Error('Channel membership could not be verified. No starter calls were added. Retry shortly or contact support.');}
  if(!subscribed)return {claimed:false,member:false,channelUrl:OFFER_CHANNEL_URL};
  return prisma.$transaction(async tx=>{
    await lockRow(tx,'User',userId);
    const user=await tx.user.findUnique({where:{id:userId}});
    if(!user||isAccountRestricted(user)||!hasAcceptedCurrentTerms(user))throw new Error('Starter practice is unavailable for this account.');
    if(user.starterGiftGrantedAt)return {claimed:false,alreadyClaimed:true,channelUrl:OFFER_CHANNEL_URL};
    await assertWalletHeadroom(tx,user,{calls:3,recordings:0,storage:0});
    await tx.user.update({where:{id:userId},data:{callCredits:{increment:3},starterGiftGrantedAt:new Date()}});
    await tx.auditLog.create({data:{action:'STARTER_CHANNEL_GIFT',targetId:userId,adminId:user.telegramId.toString(),afterState:JSON.stringify({calls:3,channelId:OFFER_CHANNEL_ID}),reason:'Channel membership verified; one starter grant'}});
    return {claimed:true,member:true,calls:3,channelUrl:OFFER_CHANNEL_URL};
  });
}
