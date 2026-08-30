import { Bot, InlineKeyboard } from 'grammy';
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

export function setupRefundHandlers(bot: Bot<MyContext>) {
  const getPolicyUrl = () => {
    const baseUrl = env.MINI_APP_URL || 'https://pairtalk.online';
    return `${baseUrl}/privacy`;
  };

  const handleRefundRequest = async (ctx: MyContext) => {
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
          `• <b>Refund Amount</b>: ⭐ <b>${starsAmount} Stars (XTR)</b>\n` +
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

      if (!tx || tx.status === 'REFUNDED') {
        await ctx.reply('⚠️ This transaction has already been refunded or does not exist.');
        return;
      }

      // Execute Telegram API Star Refund
      if (tx.telegramPaymentId) {
        await ctx.api.refundStarPayment(telegramIdNum, tx.telegramPaymentId).catch((err) => {
          console.warn('[Refund] Telegram refundStarPayment API warning:', err);
        });
      }

      // Atomically revoke plan and downgrade to FREE
      await revokePlanOnRefund({
        transactionId: tx.id,
        adminId: 'bot_auto_refund',
        reason: 'Automated user refund via /refund',
      });

      await ctx.reply(
        `🎉 <b>Refund Completed Successfully!</b>\n\n` +
          `⭐ <b>${tx.starsAmount} Stars</b> have been refunded to your Telegram balance.\n` +
          `Your account has been reverted to the <b>FREE Plan</b>.\n\n` +
          `Thank you for trying PairTalk! You can upgrade again at any time.`,
        { parse_mode: 'HTML' }
      );
    } catch (err: unknown) {
      console.error('[Refund] Stars refund failed:', err);
      await ctx.reply(
        '⚠️ Failed to complete automatic refund. Please contact @PairTalkSupport for manual assistance.'
      );
    }
  });

  // Submit UZS Refund Request to Admin
  bot.callbackQuery(/^submit_uzs_refund:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => undefined);
    const manualReqId = ctx.match[1];

    try {
      const req = await prisma.manualPaymentRequest.findUnique({
        where: { id: manualReqId },
        include: { user: true },
      });

      if (!req) {
        await ctx.reply('⚠️ Payment record not found.');
        return;
      }

      // 1. Mark request as REFUND_PENDING
      const updatedReq = await prisma.manualPaymentRequest.update({
        where: { id: req.id },
        data: {
          status: 'REFUND_PENDING',
          adminNote: `[REFUND_REQUESTED] User submitted refund request via Bot on ${new Date().toISOString()}`,
        },
      });

      const orderNum = req.orderNumber || `A${req.id.slice(0, 4)}`;
      const supportUser = (env.MANUAL_PAYMENT_ADMIN_USERNAME || 'PairTalkSupport').replace(/^@/, '');

      // 2. Dispatch interactive alert to all ADMIN_TELEGRAM_IDS
      if (env.ADMIN_TELEGRAM_IDS && env.ADMIN_TELEGRAM_IDS.length > 0) {
        const adminInlineKb = new InlineKeyboard()
          .text('✅ Approve Refund', `adm_approve_refund:${req.id}`)
          .text('❌ Reject Refund', `adm_reject_refund:${req.id}`);

        const callsUsed = req.user ? await getUserCallsUsedThisPeriod(req.userId, req.user) : 0;
        const callLimit = getDailyLimitForPlan(req.plan) || 10;

        for (const adminId of env.ADMIN_TELEGRAM_IDS) {
          await ctx.api.sendMessage(
            adminId,
            `💸 <b>New UZS Refund Request</b>\n\n` +
              `• <b>Order #</b>: <code>${orderNum}</code>\n` +
              `• <b>Candidate</b>: <code>${req.alias}</code> (ID: <code>${req.telegramId}</code>)\n` +
              `• <b>Plan Tier</b>: <b>${req.plan}</b>\n` +
              `• <b>Amount</b>: <b>${req.uzsAmount.toLocaleString()} UZS</b>\n` +
              `• <b>Usage</b>: <code>${callsUsed} / ${callLimit} calls used</code>\n` +
              `• <b>Purchase Date</b>: <code>${new Date(req.createdAt).toISOString().slice(0, 16).replace('T', ' ')}</code>\n\n` +
              `<i>Review and process this request below or in the Admin Panel:</i>`,
            { parse_mode: 'HTML', reply_markup: adminInlineKb }
          ).catch((e: unknown) => {
            console.warn(`[Refund] Failed to send admin alert to ${adminId}:`, e);
          });
        }
      }

      await ctx.reply(
        `✅ <b>Refund Request Forwarded to Administration</b>\n\n` +
          `• <b>Order #</b>: <code>${orderNum}</code>\n` +
          `• <b>Plan</b>: <b>${req.plan}</b>\n` +
          `• <b>Amount</b>: <b>${req.uzsAmount.toLocaleString()} UZS</b>\n\n` +
          `Our billing team will review and process the reversal to your originating payment card within <b>1–3 business days</b>.\n\n` +
          `If you have any questions, you can message @${supportUser}.`,
        { parse_mode: 'HTML' }
      );
    } catch (err) {
      console.error('[Refund] UZS refund request failed:', err);
      await ctx.reply('⚠️ Failed to submit refund request. Please contact @PairTalkSupport.');
    }
  });

  // Admin In-Bot Action: Approve UZS Refund
  bot.callbackQuery(/^adm_approve_refund:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => undefined);
    const adminIdStr = String(ctx.from?.id);
    if (!env.ADMIN_TELEGRAM_IDS.includes(adminIdStr)) {
      await ctx.reply('⛔ Unauthorized: You are not in ADMIN_TELEGRAM_IDS.');
      return;
    }

    const requestId = ctx.match[1];
    try {
      const result = await refundManualPaymentRequest({
        requestId,
        adminId: `tg_admin_${adminIdStr}`,
        note: 'Approved via Telegram Admin Alert',
      });

      const orderNum = result.request.orderNumber || `A${result.request.id.slice(0, 4)}`;

      // Notify candidate
      if (result.user?.telegramId) {
        await ctx.api.sendMessage(
          result.user.telegramId.toString(),
          `🎉 <b>Refund Approved & Processed!</b>\n\n` +
            `Your refund of <b>${result.request.uzsAmount.toLocaleString()} UZS</b> for Order #<code>${orderNum}</code> has been approved.\n` +
            `The amount will appear on your payment card in 1–3 business days.\n` +
            `Your account has been reverted to the <b>FREE Plan</b>.`,
          { parse_mode: 'HTML' }
        ).catch(() => undefined);
      }

      await ctx.editMessageText(
        `✅ <b>Refund Approved by Admin</b>\n\n` +
          `• <b>Order #</b>: <code>${orderNum}</code>\n` +
          `• <b>Candidate</b>: <code>${result.request.alias}</code>\n` +
          `• <b>Amount</b>: <b>${result.request.uzsAmount.toLocaleString()} UZS</b>\n` +
          `• <b>Status</b>: <code>REFUNDED</code> (Plan downgraded to FREE)\n` +
          `• <b>Processed By</b>: <code>${adminIdStr}</code>`,
        { parse_mode: 'HTML' }
      );
    } catch (err: any) {
      console.error('[Admin Refund Error]', err);
      await ctx.reply(`⚠️ Failed to approve refund: ${err.message}`);
    }
  });

  // Admin In-Bot Action: Reject UZS Refund
  bot.callbackQuery(/^adm_reject_refund:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => undefined);
    const adminIdStr = String(ctx.from?.id);
    if (!env.ADMIN_TELEGRAM_IDS.includes(adminIdStr)) {
      await ctx.reply('⛔ Unauthorized: You are not in ADMIN_TELEGRAM_IDS.');
      return;
    }

    const requestId = ctx.match[1];
    try {
      const result = await rejectManualPaymentRefund({
        requestId,
        adminId: `tg_admin_${adminIdStr}`,
        note: 'Rejected via Telegram Admin Alert',
      });

      const orderNum = result.request.orderNumber || `A${result.request.id.slice(0, 4)}`;

      // Notify candidate
      if (result.user?.telegramId) {
        await ctx.api.sendMessage(
          result.user.telegramId.toString(),
          `ℹ️ <b>Refund Request Decision</b>\n\n` +
            `Your refund request for Order #<code>${orderNum}</code> was reviewed and not approved by administration.\n` +
            `Your <b>${result.request.plan} Plan</b> remains active.\n\n` +
            `For inquiries, contact @${(env.MANUAL_PAYMENT_ADMIN_USERNAME || 'PairTalkSupport').replace(/^@/, '')}.`,
          { parse_mode: 'HTML' }
        ).catch(() => undefined);
      }

      await ctx.editMessageText(
        `❌ <b>Refund Rejected by Admin</b>\n\n` +
          `• <b>Order #</b>: <code>${orderNum}</code>\n` +
          `• <b>Candidate</b>: <code>${result.request.alias}</code>\n` +
          `• <b>Plan</b>: <b>${result.request.plan}</b> (Remains ACTIVE)\n` +
          `• <b>Processed By</b>: <code>${adminIdStr}</code>`,
        { parse_mode: 'HTML' }
      );
    } catch (err: any) {
      console.error('[Admin Refund Error]', err);
      await ctx.reply(`⚠️ Failed to reject refund: ${err.message}`);
    }
  });

  // Cancel refund prompt
  bot.callbackQuery('cancel_refund', async (ctx) => {
    await ctx.answerCallbackQuery({ text: 'Refund cancelled. Your plan remains active.' }).catch(() => undefined);
    await ctx.reply('👍 Refund cancelled. Your subscription plan remains active.');
  });
}
