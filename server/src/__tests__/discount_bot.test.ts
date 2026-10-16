import {createDiscountCampaign} from './fixtures/legacyDiscount';
import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import crypto from 'node:crypto';
import {prisma} from '../config/database';
import {currentTerms} from '../services/terms';
import {getPlansConfig,updatePlansConfig} from '../services/plan';
import {beginDiscountCheckout} from '../services/discounts';
import {setupDiscountHandlers} from '../bot/handlers/discounts';
import {setupPaymentHandlers} from '../bot/handlers/payments';
import {sendAdminPaymentNotification} from '../bot/paymentsBot';
import {env} from '../config/env';
vi.mock('../services/rateLimitMatrix',()=>({checkRateLimit:vi.fn().mockResolvedValue({allowed:true})}));
vi.mock('../bot/paymentsBot',()=>({downloadTelegramReceiptFile:vi.fn().mockResolvedValue({buffer:Buffer.from('synthetic receipt')}),sendAdminPaymentNotification:vi.fn().mockResolvedValue(undefined)}));
const baseline=structuredClone(getPlansConfig());
const previousCard=env.MANUAL_PAYMENT_CARD_HOLDER;
let sequence=970000000n;
let callbacks:{pattern:RegExp;handler:Function}[],events:Map<string,Function>,bot:any,user:any,offer:any;
const context=()=>({from:{id:Number(user.telegramId)},chat:{id:Number(user.telegramId),type:'private'},session:{step:'idle'},match:[],api:{},reply:vi.fn().mockResolvedValue(undefined),answerCallbackQuery:vi.fn().mockResolvedValue(undefined),answerPreCheckoutQuery:vi.fn().mockResolvedValue(undefined),replyWithInvoice:vi.fn().mockResolvedValue(undefined),editMessageText:vi.fn().mockResolvedValue(undefined)} as any);
const callback=(text:string,ctx:any)=>{const found=callbacks.find(item=>item.pattern instanceof RegExp&&item.pattern.test(text))!;ctx.callbackQuery={id:'synthetic-callback',data:text};ctx.match=found.pattern.exec(text);return found.handler(ctx);};
beforeEach(async()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-14T16:00:00Z'));vi.clearAllMocks();
  await prisma.starsTransaction.deleteMany();await prisma.manualPaymentRequest.deleteMany();await prisma.discountOffer.deleteMany();await prisma.discountCampaign.deleteMany();await prisma.auditLog.deleteMany();await prisma.user.deleteMany();
  updatePlansConfig({PLUS:{...baseline.PLUS,starsPrice:100,uzsPrice:10000}});
  env.MANUAL_PAYMENT_CARD_HOLDER='Synthetic card instructions for verification only';
  user=await prisma.user.create({data:{telegramId:++sequence,alias:'Synthetic bot '+crypto.randomUUID(),onboarded:true,termsAcceptedVersion:currentTerms.version,termsDocumentSha256:currentTerms.sha256,termsAcceptedAt:new Date()}});
  const campaign=await createDiscountCampaign({requestId:crypto.randomUUID(),plan:'PLUS',percent:20,recipientCount:1,validMinutes:60},'synthetic-admin');offer=(await prisma.discountOffer.findMany({where:{campaignId:campaign.id}}))[0];
  callbacks=[];events=new Map();bot={api:{refundStarPayment:vi.fn().mockResolvedValue(true)},callbackQuery:(pattern:RegExp,handler:Function)=>callbacks.push({pattern,handler}),on:(kind:string|string[],handler:Function)=>events.set(String(kind),handler),command:vi.fn()};setupDiscountHandlers(bot);
});
afterEach(()=>{vi.useRealTimers();updatePlansConfig(baseline);env.MANUAL_PAYMENT_CARD_HOLDER=previousCard;});
it('renders the owner offer and blocks a forwarded/group claim',async()=>{
  const ctx=context();await callback(`discount:${offer.id}`,ctx);expect(ctx.reply.mock.calls[0][0]).toContain('80 Stars');expect(ctx.reply.mock.calls[0][1].reply_markup.inline_keyboard[0][0].callback_data).toBe(`discount_stars:${offer.id}`);
  const group=context();group.chat.type='group';await callback(`discount:${offer.id}`,group);expect(group.reply).not.toHaveBeenCalled();
  const foreign=context();foreign.from.id++;await callback(`discount:${offer.id}`,foreign);expect(foreign.reply).not.toHaveBeenCalled();expect(foreign.answerCallbackQuery.mock.calls[0][0].show_alert).toBe(true);
});
it('opens a recipient-bound Stars invoice using the discounted amount and rejects an expired invoice',async()=>{
  const ctx=context();await callback(`discount_stars:${offer.id}`,ctx);const invoice=ctx.replyWithInvoice.mock.calls[0];expect(invoice[3]).toBe('XTR');expect(invoice[4][0].amount).toBe(80);expect(invoice[5].start_parameter).toBe(`discount_${offer.id}`);
  ctx.preCheckoutQuery={id:'synthetic-query',invoice_payload:invoice[2],currency:'XTR',total_amount:80};await events.get('pre_checkout_query')!(ctx,vi.fn());expect(ctx.answerPreCheckoutQuery).toHaveBeenLastCalledWith(true);
  await vi.advanceTimersByTimeAsync(3600000);ctx.preCheckoutQuery.id='late-query';await events.get('pre_checkout_query')!(ctx,vi.fn());expect(ctx.answerPreCheckoutQuery).toHaveBeenLastCalledWith(false,{error_message:'This limited offer has expired.'});
});
it('keeps long admin plan names within the Telegram invoice title limit',async()=>{
  const campaign=await prisma.discountCampaign.findUnique({where:{id:offer.campaignId}}),snapshot=JSON.parse(campaign!.planSnapshot);snapshot.name='A long subscription name for advanced speaking and pronunciation';await prisma.discountCampaign.update({where:{id:campaign!.id},data:{planSnapshot:JSON.stringify(snapshot)}});
  const ctx=context();await callback(`discount_stars:${offer.id}`,ctx);expect(Array.from(ctx.replyWithInvoice.mock.calls[0][0]).length).toBeLessThanOrEqual(32);expect(ctx.replyWithInvoice.mock.calls[0][1]).toContain(snapshot.name);
});
it('does not intercept ordinary payment updates or a receipt with no offer selected',async()=>{
  const ctx=context(),next=vi.fn();ctx.preCheckoutQuery={invoice_payload:'plan_purchase:PLUS:123:A1',currency:'XTR'};await events.get('pre_checkout_query')!(ctx,next);expect(next).toHaveBeenCalledOnce();
  ctx.message={successful_payment:{invoice_payload:'plan_purchase:PLUS:123:A1'}};await events.get('message:successful_payment')!(ctx,next);expect(next).toHaveBeenCalledTimes(2);
  ctx.message={};await events.get('message:photo,message:document')!(ctx,next);expect(next).toHaveBeenCalledTimes(3);
});
it('submits a discounted card receipt and notifies the admin with its actual amount',async()=>{
  const ctx=context();await callback(`discount_card:${offer.id}`,ctx);expect(ctx.reply.mock.calls[0][0]).toContain('8,000 UZS');
  ctx.message={message_id:5,photo:[{file_id:'synthetic-photo',file_unique_id:'synthetic-photo-id',file_size:1000}]};
  await events.get('message:photo,message:document')!(ctx,vi.fn());
  const req=(await prisma.manualPaymentRequest.findMany())[0];expect(req.uzsAmount).toBe(8000);expect(req.discountOfferId).toBe(offer.id);expect(JSON.parse(req.paymentProof!).orderNumber).toBe(req.orderNumber);expect(ctx.session.pendingDiscountOfferId).toBeUndefined();expect(vi.mocked(sendAdminPaymentNotification).mock.calls[0][1].uzsAmount).toBe(8000);
});
it('does not invent bank details when card instructions are missing',async()=>{
  env.MANUAL_PAYMENT_CARD_HOLDER=undefined;const ctx=context();await callback(`discount_card:${offer.id}`,ctx);expect(ctx.reply).not.toHaveBeenCalled();expect(ctx.answerCallbackQuery.mock.calls[0][0].text).toContain('instructions are unavailable');expect((await prisma.discountOffer.findUnique({where:{id:offer.id}}))?.status).toBe('AVAILABLE');
});
it('settles a valid Stars receipt once and refunds a distinct extra charge',async()=>{
  const ctx=context();await callback(`discount_stars:${offer.id}`,ctx);const payload=ctx.replyWithInvoice.mock.calls[0][2];ctx.preCheckoutQuery={id:'synthetic-paid-query',invoice_payload:payload,currency:'XTR',total_amount:80};await events.get('pre_checkout_query')!(ctx,vi.fn());
  ctx.message={successful_payment:{invoice_payload:payload,currency:'XTR',total_amount:80,telegram_payment_charge_id:'synthetic-charge'}};const handler=events.get('message:successful_payment')!;
  await handler(ctx,vi.fn());const replies=ctx.reply.mock.calls.length;await handler(ctx,vi.fn());expect(ctx.reply).toHaveBeenCalledTimes(replies);ctx.message.successful_payment.telegram_payment_charge_id='synthetic-extra';await handler(ctx,vi.fn());expect(bot.api.refundStarPayment).toHaveBeenCalledOnce();expect((await prisma.starsTransaction.findUnique({where:{telegramPaymentId:'synthetic-extra'}}))?.status).toBe('REFUNDED');
});
it('cancels only the owner pending receipt and restores its unused offer',async()=>{
  await beginDiscountCheckout(offer.id,user.telegramId,'UZS');const ctx=context();ctx.session.pendingDiscountOfferId=offer.id;ctx.message={message_id:5,photo:[{file_id:'synthetic-photo',file_unique_id:'synthetic-photo-id',file_size:1000}]};await events.get('message:photo,message:document')!(ctx,vi.fn());const req=(await prisma.manualPaymentRequest.findMany())[0];
  setupPaymentHandlers(bot);const foreign=context();foreign.from.id++;await callback(`cancel_manual_pay:${req.id}`,foreign);expect((await prisma.manualPaymentRequest.findUnique({where:{id:req.id}}))?.status).toBe('PENDING');
  const owner=context();await callback(`cancel_manual_pay:${req.id}`,owner);expect((await prisma.manualPaymentRequest.findUnique({where:{id:req.id}}))?.status).toBe('REJECTED');expect((await prisma.discountOffer.findUnique({where:{id:offer.id}}))?.status).toBe('AVAILABLE');
});
