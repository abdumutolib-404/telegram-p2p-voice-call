import { processStarsRefund } from '../../services/starsRefund';
import { Bot, InlineKeyboard } from 'grammy';
import { escapeHtml } from '../../utils/sanitize';
import { MyContext } from '../types';
import { prisma } from '../../config/database';
import { env } from '../../config/env';
import {
  getUserCallsUsedThisPeriod,
  getDailyLimitForPlan,
  revokePlanOnRefund,
  refundManualPaymentRequest,
  rejectManualPaymentRefund,
} from '../../services/plan';
import { logger } from '../../utils/logger';

const getPolicyUrl = () => {
  const baseUrl = env.MINI_APP_URL || 'https://pairtalk.online';
  return `${baseUrl}/privacy`;
};

export const handleRefundRequest = async (ctx: MyContext) => {
  const telegramIdNum = ctx.from?.id;
  if (!telegramIdNum) return;
  const telegramId = BigInt(telegramIdNum);

  const user = await prisma.user.findUnique({ where: { telegramId } });
  if (!user) {
    await ctx.reply('Please register with /start first.');
    return;
  }

  const policyUrl = getPolicyUrl();

    // 1. Locate most recent successful payment transaction
    const latestStarsTx = await prisma.starsTransaction.findFirst({
      where: { userId: user.id, status: 'PAID' },
      orderBy: { createdAt: 'desc' },
    });

    const latestManualReq = await prisma.manualPaymentRequest.findFirst({
      where: { userId: user.id, status: { in: ['APPROVED', 'REFUND_PENDING'] } },
      orderBy: { createdAt: 'desc' },
    });

    if (latestManualReq && latestManualReq.status === 'REFUND_PENDING') {
      const orderNum = latestManualReq.orderNumber || `A${latestManualReq.id.slice(0, 4)}`;
      await ctx.reply(
        `⏳ <b>Refund Request Already Under Review</b>\n\n` +
          `• <b>Order #</b>: <code>${orderNum}</code>\n` +
          `• <b>Plan</b>: <b>${latestManualReq.plan}</b>\n` +
          `• <b>Amount</b>: <b>${latestManualReq.uzsAmount.toLocaleString()} UZS</b>\n\n` +
          `Your refund request is currently in the administrator review queue. Once processed, the payment will be reversed to your card.`,
        { parse_mode: 'HTML' }
      );
      return;
    }

    if (!latestStarsTx && !latestManualReq) {
      const inlineKb = new InlineKeyboard()
        .webApp('📜 Read Refund Policy', policyUrl)
        .row()
        .text('⭐ View Upgrade Plans', 'show_plans');

      await ctx.reply(
        `ℹ️ <b>No Active Paid Purchases Found</b>\n\n` +
          `You currently do not have an active paid purchase eligible for a refund on your account.\n` +
          `• Current Tier: <b>${user.plan} Plan</b>\n\n` +
          `<i>Refunds apply exclusively to paid subscriptions (PLUS, PRO, BOSS) within 48 hours of purchase.</i>`,
        { parse_mode: 'HTML', reply_markup: inlineKb }
      );
      return;
    }

    // Determine the most recent active transaction
    let activeTxType: 'STARS' | 'UZS' = 'STARS';
    let txDate: Date = new Date();
    let planTier: string = 'PLUS';
    let starsAmount: number = 0;
    let uzsAmount: number = 0;
    let orderNum: string = '';
    let chargeId: string = '';
    let starsTxId: string = '';
    let manualReqId: string = '';

    if (latestStarsTx && latestManualReq) {
      if (latestStarsTx.createdAt >= latestManualReq.createdAt) {
        activeTxType = 'STARS';
        txDate = latestStarsTx.createdAt;
        planTier = latestStarsTx.planTier;
        starsAmount = latestStarsTx.starsAmount;
        chargeId = latestStarsTx.telegramPaymentId;
        starsTxId = latestStarsTx.id;
      } else {
        activeTxType = 'UZS';
        txDate = latestManualReq.createdAt;
        planTier = latestManualReq.plan;
        uzsAmount = latestManualReq.uzsAmount;
        orderNum = latestManualReq.orderNumber || `A${latestManualReq.id.slice(0, 4)}`;
        manualReqId = latestManualReq.id;
      }
    } else if (latestStarsTx) {
      activeTxType = 'STARS';
      txDate = latestStarsTx.createdAt;
      planTier = latestStarsTx.planTier;
      starsAmount = latestStarsTx.starsAmount;
      chargeId = latestStarsTx.telegramPaymentId;
      starsTxId = latestStarsTx.id;
    } else if (latestManualReq) {
      activeTxType = 'UZS';
      txDate = latestManualReq.createdAt;
      planTier = latestManualReq.plan;
      uzsAmount = latestManualReq.uzsAmount;
      orderNum = latestManualReq.orderNumber || `A${latestManualReq.id.slice(0, 4)}`;
      manualReqId = latestManualReq.id;
    }

    // 2. Authoritative Server-Side Refund Verification (<10% calls OR <48 hours)
    const callsUsed = await getUserCallsUsedThisPeriod(user.id, user);
    const callLimit = getDailyLimitForPlan(planTier) || 10;
    const purchaseAgeMs = Date.now() - new Date(txDate).getTime();
    const purchaseAgeHours = Math.floor(purchaseAgeMs / (1000 * 60 * 60));

    const isUsageEligible = callsUsed < callLimit * 0.10;
    const isTimeEligible = purchaseAgeMs < 48 * 3600 * 1000;

    // INELIGIBLE CASE (Neither criteria satisfied)
    if (!isUsageEligible && !isTimeEligible) {
      const inlineKb = new InlineKeyboard()
        .webApp('📜 View Refund Policy', policyUrl)
        .row()
        .url('💬 Contact Support', `https://t.me/${(env.MANUAL_PAYMENT_ADMIN_USERNAME || 'PairTalkSupport').replace(/^@/, '')}`);

      await ctx.reply(
        `❌ <b>Refund Request Ineligible</b>\n\n` +
          `Your subscription does not qualify for a refund under our policy:\n\n` +
          `• <b>Plan Tier</b>: <b>${planTier}</b>\n` +
          `• <b>Calls Used</b>: <code>${callsUsed} / ${callLimit}</code> (❌ Exceeds 10% allowance limit)\n` +
          `• <b>Purchase Time</b>: <code>${purchaseAgeHours}h ago</code> (❌ Exceeds 48-hour window)\n\n` +
          `📖 <i>Refund eligibility requires submitting the request within 48 hours of purchase OR having used less than 10% of your call allowance.</i>\n\n` +
          `You can read our full policy using the button below:`,
        { parse_mode: 'HTML', reply_markup: inlineKb }
      );
      return;
    }

    // ELIGIBLE CASE: Branch by payment method
    if (activeTxType === 'STARS') {
      const inlineKb = new InlineKeyboard()
        .text('✅ Confirm & Receive Stars Refund', `exec_stars_refund:${starsTxId}`)
        .row()
        .text('✖️ Keep My Plan', 'cancel_refund');

      await ctx.reply(
        `💸 <b>Telegram Stars Refund Eligible</b>\n\n` +
          `Your account qualifies for a 100% refund of your recent Stars payment:\n\n` +
          `• <b>Plan</b>: <b>${planTier}</b>\n` +
          `• <b>Refund Amount</b>: ⭐ <b>${starsAmount} Stars</b>\n` +
          `• <b>Usage Verification</b>: <code>${callsUsed} / ${callLimit} calls used</code> (Eligible)\n\n` +
          `⚠️ <i>Confirming will automatically return ${starsAmount} Stars back to your Telegram balance and revert your account to the FREE plan.</i>`,
        { parse_mode: 'HTML', reply_markup: inlineKb }
      );
    } else {
      // UZS Card Payment Case
      const inlineKb = new InlineKeyboard()
        .text('📩 Submit UZS Refund Request', `submit_uzs_refund:${manualReqId}`)
        .row()
        .text('✖️ Keep My Plan', 'cancel_refund');

      await ctx.reply(
        `💳 <b>Card Payment (UZS) Refund Eligible</b>\n\n` +
          `Your account qualifies for a 100% refund of your UZS card payment:\n\n` +
          `• <b>Order #</b>: <code>${orderNum}</code>\n` +
          `• <b>Plan</b>: <b>${planTier}</b>\n` +
          `• <b>Refund Amount</b>: <b>${uzsAmount.toLocaleString()} UZS</b>\n` +
          `• <b>Usage Verification</b>: <code>${callsUsed} / ${callLimit} calls used</code> (Eligible)\n\n` +
          `Tap below to forward your refund request to our administrators for card reversal:`,
        { parse_mode: 'HTML', reply_markup: inlineKb }
      );
    }
  };

export function setupRefundHandlers(bot: Bot<MyContext>) {
  // Command: /refund
  bot.command('refund', handleRefundRequest);

  // Button callback: request_refund
  bot.callbackQuery('request_refund', async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => undefined);
    await handleRefundRequest(ctx);
  });

  // Execute Telegram Stars Automatic Refund
  bot.callbackQuery(/^exec_stars_refund:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => undefined);
    const starsTxId = ctx.match[1];
    const telegramIdNum = ctx.from?.id;
    if (!telegramIdNum) return;

    try {
      const tx = await prisma.starsTransaction.findUnique({
        where: { id: starsTxId },
        include: { user: true },
      });

      if (!tx || tx.user?.telegramId !== BigInt(telegramIdNum) || tx.status === 'REFUNDED') {
        await ctx.reply('⚠️ This transaction has already been refunded or does not exist.');
        return;
      }

      const result = await processStarsRefund({ transactionId: tx.id, adminId: 'bot_auto_refund', ownerTelegramId: telegramIdNum, reason: 'Automated user refund via /refund' }, ctx.api);

      await ctx.reply(
        `🎉 <b>Refund Completed Successfully!</b>\n\n` +
          `⭐ <b>${tx.starsAmount} Stars</b> have been refunded to your Telegram balance.\n` +
          `Your current plan is <b>${escapeHtml(result.user.plan)}</b>.\n\n` +
          `Thank you for trying PairTalk! You can upgrade again at any time.`,
        { parse_mode: 'HTML' }
      );
    } catch (err: unknown) {
      logger.error('Stars refund failed', {
        service: 'bot',
        event: 'stars_refund_failed',
        starsTxId,
      }, err);
      await ctx.reply(
        '⚠️ Failed to complete automatic refund. Please contact @PairTalkSupport for manual assistance.'
      );
    }
  });

  // Submit UZS Refund Request to Admin - Step 1: Prompt for receiving card number
  bot.callbackQuery(/^submit_uzs_refund:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => undefined);
    const manualReqId = ctx.match[1];
    if (!ctx.from?.id) return;

    try {
      const req = await prisma.manualPaymentRequest.findFirst({
        where: { id: manualReqId, telegramId: BigInt(ctx.from.id), status: { in: ['APPROVED', 'REFUND_PENDING'] } },
        include: { user: true },
      });

      if (!req) {
        await ctx.reply('⚠️ Payment record not found.');
        return;
      }

      ctx.session.step = 'awaiting_refund_card';
      ctx.session.pendingRefundManualReqId = req.id;

      const orderNum = req.orderNumber || `A${req.id.slice(0, 4)}`;
      const inlineKb = new InlineKeyboard().text('✖️ Cancel Refund', 'cancel_refund');

      await ctx.reply(
        `💳 <b>Enter Refund Receiving Card</b>\n\n` +
          `• <b>Order #</b>: <code>${orderNum}</code>\n` +
          `• <b>Refund Amount</b>: <b>${req.uzsAmount.toLocaleString()} UZS</b>\n\n` +
          `Please send your <b>16-digit card number</b> (Uzcard, Humo, or Visa/MasterCard) where you want to receive the funds:\n\n` +
          `⚠️ <i>Once refund is approved, the money will be sent to this card number. If user enters a wrong card number, administration is not responsible for the money sent to it.</i>`,
        { parse_mode: 'HTML', reply_markup: inlineKb }
      );
    } catch (err) {
      logger.error('UZS refund init failed', {
        service: 'bot',
        event: 'uzs_refund_init_failed',
        manualReqId,
      }, err);
      await ctx.reply('⚠️ Failed to initiate refund. Please contact @PairTalkSupport.');
    }
  });

  // Step 2: Handle receiving card text input from student
  bot.on('message:text', async (ctx, next) => {
    const text = ctx.message?.text?.trim() || '';

    // If it's a command like /start, /refund, /admin, /announce, /cancel, NEVER intercept here!
    if (!text || text.startsWith('/')) {
      return next();
    }

    const digitsOnly = text.replace(/\D/g, '');
    const isCardFormat = digitsOnly.length === 16;

    const inAwaitingStep = ctx.session?.step === 'awaiting_refund_card' && Boolean(ctx.session?.pendingRefundManualReqId);

    if (!inAwaitingStep && !isCardFormat) {
      return next();
    }

    if (inAwaitingStep && !isCardFormat) {
      const inlineKb = new InlineKeyboard().text('✖️ Cancel Refund', 'cancel_refund');
      const countMsg = digitsOnly.length > 0 ? ` (you entered <b>${digitsOnly.length} digits</b>)` : '';
      await ctx.reply(
        `⚠️ <b>Invalid Card Number</b>\n\n` +
          `A card number must contain <b>exactly 16 digits</b>${countMsg}.\n` +
          `Example: <code>8600 1234 5678 9012</code>\n\n` +
          `⚠️ <i>Once refund is approved, the money will be sent to this card number. If user enters a wrong card number, administration is not responsible for the money sent to it.</i>`,
        { parse_mode: 'HTML', reply_markup: inlineKb }
      );
      return;
    }

    const formattedCard = `${digitsOnly.slice(0, 4)} ${digitsOnly.slice(4, 8)} ${digitsOnly.slice(8, 12)} ${digitsOnly.slice(12, 16)}`;

    const fromId = ctx.from?.id;
    if (!fromId) return next();
    const telegramId = BigInt(fromId);

    try {
      let req = null;
      if (ctx.session.pendingRefundManualReqId) {
        req = await prisma.manualPaymentRequest.findUnique({
          where: { id: ctx.session.pendingRefundManualReqId },
          include: { user: true },
        });
      }

      if (!req) {
        // Fallback: look for the most recent active or refund-pending request for this user
        req = await prisma.manualPaymentRequest.findFirst({
          where: {
            telegramId,
            status: { in: ['APPROVED', 'REFUND_PENDING'] },
          },
          orderBy: { createdAt: 'desc' },
          include: { user: true },
        });
      }

      if (!req || req.telegramId !== telegramId || !['APPROVED', 'REFUND_PENDING'].includes(req.status)) {
        return next();
      }

      // Mark request as REFUND_PENDING with receiving card stored
      const changed = await prisma.manualPaymentRequest.updateMany({
        where: { id: req.id, telegramId, status: req.status },
        data: {
          status: 'REFUND_PENDING',
          refundCardNumber: formattedCard,
          adminNote: `[REFUND_REQUESTED] User submitted refund request for card: ${formattedCard} on ${new Date().toISOString()}`,
        },
      });
      if (changed.count !== 1) { await ctx.reply('This payment changed. Open /refund again to see its current status.'); return; }

      ctx.session.step = 'idle';
      ctx.session.pendingRefundManualReqId = undefined;

      const orderNum = req.orderNumber || `A${req.id.slice(0, 4)}`;
      const supportUser = (env.MANUAL_PAYMENT_ADMIN_USERNAME || 'PairTalkSupport').replace(/^@/, '');

      await ctx.reply(
        `✅ <b>Refund Request Forwarded to Administration</b>\n\n` +
          `• <b>Order #</b>: <code>${orderNum}</code>\n` +
          `• <b>Plan</b>: <b>${req.plan}</b>\n` +
          `• <b>Amount</b>: <b>${req.uzsAmount.toLocaleString()} UZS</b>\n` +
          `• <b>Receiving Card</b>: <code>${formattedCard}</code>\n\n` +
          `Our billing team will review your request in the Admin Panel and process the bank transfer within <b>1–3 business days</b>.\n` +
          `Once completed, you will receive the official bank transfer bill proof here.\n\n` +
          `If you have any questions, you can message @${supportUser}.`,
        { parse_mode: 'HTML' }
      );
    } catch (err) {
      logger.error('Failed to record refund card', {
        service: 'bot',
        event: 'refund_card_record_failed',
      }, err);
      ctx.session.step = 'idle';
      ctx.session.pendingRefundManualReqId = undefined;
      await ctx.reply('⚠️ Failed to submit refund request. Please contact @PairTalkSupport.');
    }
  });

  // Cancel refund prompt
  bot.callbackQuery('cancel_refund', async (ctx) => {
    ctx.session.step = 'idle';
    ctx.session.pendingRefundManualReqId = undefined;
    await ctx.answerCallbackQuery({ text: 'Refund cancelled. Your plan remains active.' }).catch(() => undefined);
    await ctx.reply('👍 Refund cancelled. Your subscription plan remains active.');
  });
}
