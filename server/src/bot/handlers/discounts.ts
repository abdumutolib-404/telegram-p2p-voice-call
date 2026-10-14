import { Bot, InlineKeyboard } from 'grammy';
import type { MyContext } from '../types';
import { prisma } from '../../config/database';
import { env } from '../../config/env';
import { viewDiscountOffer, beginDiscountCheckout, authorizeDiscountStars, settleDiscountStars, claimFreeDiscount, submitDiscountReceipt, DiscountError } from '../../services/discounts';
import { completeStarsRefund } from '../../services/starsRefund';
import { checkRateLimit } from '../../services/rateLimitMatrix';
import { escapeHtml } from '../../utils/sanitize';
import { logger } from '../../utils/logger';
import { validateReceipt } from '../receiptValidator';
import { downloadTelegramReceiptFile, sendAdminPaymentNotification } from '../paymentsBot';

const uuid='[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
const payloadPattern=new RegExp(`^discount_purchase:(${uuid}):(\\d+):(D[A-F0-9]{16})$`);
const errorText=(error:unknown)=>error instanceof DiscountError?error.message:'Your offer could not be checked. Please try again.';
async function privateAction(ctx:MyContext){
  if(ctx.chat?.type!=='private'){await ctx.answerCallbackQuery({text:'Open the offer in your private bot chat.',show_alert:true});return false;}
  const limit=await checkRateLimit('PAYMENT_INVOICE',String(ctx.from!.id));
  if(!limit.allowed){await ctx.answerCallbackQuery({text:limit.error?.message||'Please wait a moment.',show_alert:true});return false;}
  return true;
}
export async function renderDiscountOffer(ctx:MyContext,id:string){
  try{
    const offer=await viewDiscountOffer(id,BigInt(ctx.from!.id));
    if(ctx.callbackQuery)await ctx.answerCallbackQuery();
    const keyboard=new InlineKeyboard();
    if(offer.percent===100)keyboard.text('Claim Offer · Free',`discount_free:${id}`);
    else keyboard.text(`⭐ ${offer.starsPrice} Stars`,`discount_stars:${id}`).row().text(`💳 ${offer.uzsPrice.toLocaleString('en-US')} UZS`,`discount_card:${id}`);
    await ctx.reply(`An exclusive <b>${offer.percent}% discount offer for ${escapeHtml(offer.planName)}</b> is available for you.\n\n⭐ <s>${offer.originalStars}</s> → <b>${offer.starsPrice} Stars</b>\n💳 <s>${offer.originalUzs.toLocaleString('en-US')}</s> → <b>${offer.uzsPrice.toLocaleString('en-US')} UZS</b>\n\nPlan validity: ${offer.validityDays} days.\n\nValid until ${new Date(offer.expiresAt).toISOString().replace('T',' ').slice(0,16)} UTC. This offer can be claimed once.`,{parse_mode:'HTML',reply_markup:keyboard});
  }catch(error){if(ctx.callbackQuery)await ctx.answerCallbackQuery({text:errorText(error),show_alert:true});else await ctx.reply(errorText(error));}
}
export function setupDiscountHandlers(bot:Bot<MyContext>){
  bot.callbackQuery(new RegExp(`^discount:(${uuid})$`),async ctx=>{if(await privateAction(ctx))await renderDiscountOffer(ctx,ctx.match[1]);});
  bot.callbackQuery(new RegExp(`^discount_free:(${uuid})$`),async ctx=>{
    if(!await privateAction(ctx))return;
    try{const user=await claimFreeDiscount(ctx.match[1],BigInt(ctx.from.id));await ctx.answerCallbackQuery({text:'Offer claimed.'});await ctx.reply(`Your ${escapeHtml(user.plan)} plan is now active. This exclusive offer has been used.`,{parse_mode:'HTML'});}
    catch(error){await ctx.answerCallbackQuery({text:errorText(error),show_alert:true});}
  });
  bot.callbackQuery(new RegExp(`^discount_stars:(${uuid})$`),async ctx=>{
    if(!await privateAction(ctx))return;
    try{
      const checkout=await beginDiscountCheckout(ctx.match[1],BigInt(ctx.from.id),'XTR');
      ctx.session.pendingDiscountOfferId=undefined;ctx.session.pendingPaymentPlan=undefined;ctx.session.step='idle';
      await ctx.answerCallbackQuery();
      const title=Array.from(`${checkout.offer.planName} offer`).slice(0,32).join('');
      await ctx.replyWithInvoice(title,`${checkout.offer.planName} · ${checkout.offer.percent}% discount · ${checkout.offer.starsPrice} Stars · Order ${checkout.order}`,checkout.payload,'XTR',[{label:checkout.offer.planName,amount:checkout.offer.starsPrice}],{start_parameter:`discount_${ctx.match[1]}`});
    }catch(error){if(error instanceof DiscountError)await ctx.answerCallbackQuery({text:error.message,show_alert:true});else{logger.warn('Discount invoice delivery failed',{service:'discounts'},error);await ctx.reply('The invoice could not be opened. Reopen your offer to try again.');}}
  });
  bot.callbackQuery(new RegExp(`^discount_card:(${uuid})$`),async ctx=>{
    if(!await privateAction(ctx))return;
    try{
      const card=env.MANUAL_PAYMENT_CARD_HOLDER?.trim();
      if(!card)throw new DiscountError(503,'Card payment instructions are unavailable. Choose Stars or contact /paysupport.');
      const checkout=await beginDiscountCheckout(ctx.match[1],BigInt(ctx.from.id),'UZS');
      ctx.session.pendingDiscountOfferId=ctx.match[1];ctx.session.pendingPaymentPlan=undefined;ctx.session.step='awaiting_receipt';
      await ctx.answerCallbackQuery();
      const instructions=env.MANUAL_PAYMENT_INSTRUCTIONS||'Transfer the exact amount, then send a photo or PDF receipt here.';
      await ctx.reply(`<b>${escapeHtml(checkout.offer.planName)} · ${checkout.offer.percent}% exclusive discount</b>\n\nAmount due: <b>${checkout.offer.uzsPrice.toLocaleString('en-US')} UZS</b>\nOrder: <code>${checkout.order}</code>\nCard: <code>${escapeHtml(card)}</code>\n\n${escapeHtml(instructions)}\n\nSubmit your receipt before ${new Date(checkout.offer.expiresAt).toISOString().replace('T',' ').slice(0,16)} UTC. A receipt submitted in time can be reviewed after the offer expires.`,{parse_mode:'HTML'});
    }catch(error){await ctx.answerCallbackQuery({text:errorText(error),show_alert:true});}
  });
  bot.on('pre_checkout_query',async(ctx,next)=>{
    const query=ctx.preCheckoutQuery;if(!query.invoice_payload.startsWith('discount_purchase:'))return next();
    try{
      const match=payloadPattern.exec(query.invoice_payload);
      if(!match||query.currency!=='XTR'||match[2]!==String(ctx.from.id))throw new DiscountError(400,'This invoice is not valid for your account.');
      await authorizeDiscountStars(match[1],BigInt(ctx.from.id),match[3],query.total_amount,query.id);
      await ctx.answerPreCheckoutQuery(true);
    }catch(error){await ctx.answerPreCheckoutQuery(false,{error_message:errorText(error)});}
  });
  bot.on('message:successful_payment',async(ctx,next)=>{
    const payment=ctx.message.successful_payment;if(!payment.invoice_payload.startsWith('discount_purchase:'))return next();
    try{
      const match=payloadPattern.exec(payment.invoice_payload);
      if(!match||payment.currency!=='XTR')throw new Error('Malformed discount payment payload.');
      const result=await settleDiscountStars({id:match[1],telegramId:BigInt(ctx.from.id),order:match[3],amount:payment.total_amount,chargeId:payment.telegram_payment_charge_id});
      if(result.status==='duplicate')return;
      if(result.status==='refund'){
        try{await completeStarsRefund(result.transactionId,bot.api);await ctx.reply('This offer could not be applied. Your payment has been refunded and your current plan is unchanged.');}
        catch(error){logger.warn('Discount payment refund pending',{service:'discounts',transactionId:result.transactionId},error);await ctx.reply('This offer could not be applied. Refund confirmation is pending; contact /paysupport with your payment details.');}
        return;
      }
      await ctx.reply(`Payment successful. Your ${result.user.plan} plan is now active for this exclusive offer. Order ${match[3]}.`);
    }catch(error){logger.error('Discount payment settlement failed',{service:'discounts',chargeId:payment.telegram_payment_charge_id},error);throw error;}
  });
  bot.on(['message:photo','message:document'],async(ctx,next)=>{
    const id=ctx.session.pendingDiscountOfferId;if(!id)return next();
    try{
      const photo=ctx.message.photo?.at(-1),doc=ctx.message.document;
      const metadata={fileId:photo?.file_id??doc?.file_id,fileUniqueId:photo?.file_unique_id??doc?.file_unique_id,mimeType:photo?'image/jpeg':doc?.mime_type,fileName:photo?'discount-receipt.jpg':doc?.file_name,fileSize:photo?.file_size??doc?.file_size??0,messageId:ctx.message.message_id,telegramId:ctx.from.id,uploadedAt:new Date().toISOString()};
      const validation=validateReceipt({isPhoto:Boolean(photo),mimeType:metadata.mimeType,fileName:metadata.fileName,fileSize:metadata.fileSize});
      if(!validation.valid){await ctx.reply(validation.userMessage,{parse_mode:'HTML'});return;}
      const request=await submitDiscountReceipt(id,BigInt(ctx.from.id),JSON.stringify({...metadata,mimeType:validation.mimeType,fileName:validation.fileName,fileSize:validation.fileSize}));
      ctx.session.pendingDiscountOfferId=undefined;ctx.session.step='idle';
      await ctx.reply(`Your receipt has been submitted for ${request.plan} at ${request.uzsAmount.toLocaleString('en-US')} UZS. Order ${request.orderNumber}. The administration team will verify it.`);
      try{
        const user=await prisma.user.findUnique({where:{id:request.userId}}),file=await downloadTelegramReceiptFile(ctx.api,metadata.fileId!);
        await sendAdminPaymentNotification({api:bot.api} as unknown as Bot,{orderNumber:request.orderNumber,userAlias:user!.alias,telegramId:request.telegramId,plan:request.plan,uzsAmount:request.uzsAmount,paymentMethod:'MANUAL_UZS',receiptBuffer:file?.buffer??null,receiptFileName:validation.fileName,receiptMimeType:validation.mimeType,createdAt:request.createdAt,status:'PENDING'});
      }catch(error){logger.warn('Discount receipt admin notification failed',{service:'discounts',requestId:request.id},error);}
    }catch(error){
      if(error instanceof DiscountError){ctx.session.pendingDiscountOfferId=undefined;ctx.session.step='idle';await ctx.reply(error.message+(error.status===410?' If you already transferred funds, contact /paysupport.':''));}
      else{logger.warn('Discount receipt submission failed',{service:'discounts'},error);await ctx.reply('Your receipt could not be submitted. Please try again.');}
    }
  });
}
