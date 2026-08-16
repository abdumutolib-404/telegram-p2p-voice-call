import { Bot, InlineKeyboard } from 'grammy';
import { MyContext } from '../types';
import { prisma } from '../../config/database';
import {
  getPlansConfig,
  formatPriceDisplay,
  createManualPaymentRequest,
  getEffectiveEntitlement,
  getPaidUserProfile,
  generateOrderNumber,
  isDowngrade,
} from '../../services/plan';
import { checkRateLimit } from '../../services/rateLimitMatrix';
import { env } from '../../config/env';
import { sendAdminPaymentNotification, downloadTelegramReceiptFile } from '../paymentsBot';
import { validateReceipt } from '../receiptValidator';

export function setupPaymentHandlers(bot: Bot<MyContext>) {
  // Callback: select_plan:PLUS, PRO, or BOSS
  bot.callbackQuery(/^select_plan:(PLUS|PRO|BOSS)$/, async (ctx) => {
    const tier = ctx.match[1] as 'PLUS' | 'PRO' | 'BOSS';
    const plans = getPlansConfig();
    const planConfig = plans[tier];
    if (!planConfig) {
      await ctx.answerCallbackQuery({ text: 'Unknown plan selected.' });
      return;
    }
    const formattedUzs = planConfig.uzsPrice.toLocaleString('en-US');

    const inlineKb = new InlineKeyboard()
      .text(`⭐ Telegram Stars (${planConfig.starsPrice} XTR)`, `buy_plan:${tier}`)
      .row()
      .text(`💳 Pay with Card (${formattedUzs} UZS)`, `manual_pay:${tier}`)
      .row()
      .text('⬅️ Back to Plans', 'show_plans');

    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      `💎 <b>Upgrade to ${tier} Plan</b>\n\n` +
        `• Max Call Duration: <b>${planConfig.maxDuration} mins</b>\n` +
        `• Monthly Calls: <b>${planConfig.dailyLimit >= 999 ? 'Unlimited' : `${planConfig.dailyLimit} calls/month`}</b>\n` +
        `• Recording Storage: <b>${planConfig.retentionDays} days</b>\n\n` +
        `Choose your preferred payment method:`,
      { parse_mode: 'HTML', reply_markup: inlineKb }
    );
  });

  // Callback: show_plans (overview)
  bot.callbackQuery('show_plans', async (ctx) => {
    ctx.session.pendingPaymentPlan = undefined;
    ctx.session.step = 'idle';

    const telegramId = BigInt(ctx.from.id);
    const user = await prisma.user.findUnique({ where: { telegramId } });
    const profile = user ? getPaidUserProfile(user) : getPaidUserProfile({ plan: 'FREE' });

    const inlineKb = new InlineKeyboard()
      .text(`⚡ PLUS (${formatPriceDisplay('PLUS')})`, 'select_plan:PLUS')
      .row()
      .text(`🚀 PRO (${formatPriceDisplay('PRO')})`, 'select_plan:PRO')
      .row()
      .text(`👑 BOSS (${formatPriceDisplay('BOSS')})`, 'select_plan:BOSS');

    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      `⭐ <b>Subscription Plans & Pricing</b>\n\n` +
        `Current Plan: <b>${profile.planDisplayName}</b>\n` +
        (profile.isActivePaid && profile.expiration ? `Expires: <code>${profile.expiration}</code>\n\n` : '\n') +
        `🆓 <b>FREE Plan</b> (0 UZS / 0 XTR)\n` +
        `• Max Call Duration: 15 minutes\n` +
        `• Monthly Calls: 3\n` +
        `• Monthly Recordings: 1\n` +
        `• Recording Retention: 1 day\n\n` +
        `⚡ <b>PLUS Plan</b> (${formatPriceDisplay('PLUS')})\n` +
        `• Max Call Duration: 30 minutes\n` +
        `• Monthly Calls: 10\n` +
        `• Monthly Recordings: 3\n` +
        `• Recording Retention: 7 days\n\n` +
        `🚀 <b>PRO Plan</b> (${formatPriceDisplay('PRO')})\n` +
        `• Max Call Duration: 60 minutes\n` +
        `• Monthly Calls: 25\n` +
        `• Monthly Recordings: 7\n` +
        `• Recording Retention: 30 days\n\n` +
        `👑 <b>BOSS Plan</b> (${formatPriceDisplay('BOSS')})\n` +
        `• Max Call Duration: 90 minutes\n` +
        `• Monthly Calls: 50\n` +
        `• Monthly Recordings: 15\n` +
        `• Recording Retention: 90 days\n\n` +
        `Select a plan to choose payment method:`,
      { parse_mode: 'HTML', reply_markup: inlineKb }
    );
  });

  // Callback: buy_plan:PLUS, PRO, or BOSS (Telegram Stars)
  bot.callbackQuery(/^buy_plan:(PLUS|PRO|BOSS)$/, async (ctx) => {
    const tier = ctx.match[1] as 'PLUS' | 'PRO' | 'BOSS';
    const plans = getPlansConfig();
    const planConfig = plans[tier];

    if (!planConfig) {
      await ctx.answerCallbackQuery({ text: 'Selected plan configuration not found.', show_alert: true });
      return;
    }

    const rl = await checkRateLimit('PAYMENT_INVOICE', String(ctx.from.id));
    if (!rl.allowed) {
      await ctx.answerCallbackQuery({ text: rl.error?.message || 'Please wait a moment.', show_alert: true });
      return;
    }

    try {
      const telegramId = BigInt(ctx.from.id);
      const user = await prisma.user.findUnique({ where: { telegramId } });

      if (user) {
        const isSuspended =
          user.isBanned ||
          user.isPermanentlyBanned ||
          Boolean(user.bannedUntil && new Date(user.bannedUntil) > new Date());

        if (isSuspended) {
          await ctx.answerCallbackQuery({ text: 'Your account is suspended and cannot make purchases.', show_alert: true });
          return;
        }

        const profile = getPaidUserProfile(user);
        if (profile.isActivePaid) {
          await ctx.answerCallbackQuery({
            text: `You have an active paid plan — ${profile.plan}. Therefore, you cannot request or buy another plan. Wait until this one expires.`,
            show_alert: true,
          });
          return;
        }
      }

      await ctx.answerCallbackQuery();

      const orderNumber = await generateOrderNumber('A');
      const payload = `plan_purchase:${tier}:${ctx.from.id}:${orderNumber}:${Date.now()}`;

      await ctx.replyWithInvoice(
        tier,
        `${tier} Plan — Order #${orderNumber}`,
        payload,
        'XTR', // Currency for Telegram Stars
        [{ label: `${tier} Plan`, amount: planConfig.starsPrice }]
      );
    } catch (err) {
      console.error('[Payments] Failed to send Stars invoice:', err);
      await ctx.reply('⚠️ Unable to open payment invoice right now. Please try again later.');
    }
  });

  // Callback: manual_pay:PLUS, PRO, or BOSS (Card / UZS Manual)
  bot.callbackQuery(/^manual_pay:(PLUS|PRO|BOSS)$/, async (ctx) => {
    const tier = ctx.match[1] as 'PLUS' | 'PRO' | 'BOSS';
    const telegramId = BigInt(ctx.from.id);
    const plans = getPlansConfig();
    const config = plans[tier];

    if (!config) {
      await ctx.answerCallbackQuery({ text: 'Selected plan configuration not found.', show_alert: true });
      return;
    }

    const user = await prisma.user.findUnique({ where: { telegramId } });
    if (!user) {
      await ctx.answerCallbackQuery({ text: 'Please start the bot first (/start)', show_alert: true });
      return;
    }

    if (user.isBanned || user.isPermanentlyBanned) {
      await ctx.answerCallbackQuery({ text: '🚫 Suspended accounts cannot purchase plans.', show_alert: true });
      return;
    }

    const profile = getPaidUserProfile(user);
    if (profile.isActivePaid) {
      await ctx.answerCallbackQuery({
        text: `You have an active paid plan — ${profile.plan}. Therefore, you cannot request or buy another plan. Wait until this one expires.`,
        show_alert: true,
      });
      return;
    }

    ctx.session.pendingPaymentPlan = tier;
    ctx.session.step = 'awaiting_receipt';

    const formattedAmount = config.uzsPrice.toLocaleString('en-US');
    const adminUsername = env.MANUAL_PAYMENT_ADMIN_USERNAME ? `@${env.MANUAL_PAYMENT_ADMIN_USERNAME.replace(/^@/, '')}` : '@PairTalkSupport';
    const cardDetails = env.MANUAL_PAYMENT_CARD_HOLDER || '8600 1234 5678 9012 (Humo/Uzcard - PairTalk Official)';
    const instructions = env.MANUAL_PAYMENT_INSTRUCTIONS || '1. Transfer exact amount to the card.\n2. Save receipt screenshot or PDF.\n3. Send receipt here in bot for verification.';

    const inlineKb = new InlineKeyboard()
      .text('⬅️ Back to Plans', 'show_plans');

    await ctx.answerCallbackQuery();
    await ctx.reply(
      `📋 <b>Manual Payment Instructions</b>\n\n` +
        `You are subscribing to the <b>${tier} Plan</b>.\n\n` +
        `💵 <b>Amount Due</b>: <b>${formattedAmount} UZS</b>\n` +
        `💳 <b>Card Requisites</b>:\n<code>${cardDetails}</code>\n\n` +
        `📌 <b>Instructions</b>:\n` +
        `${instructions}\n` +
        `Support: ${adminUsername}\n\n` +
        `<i>Send your receipt (photo or PDF) right here in this chat to submit your request for verification.</i>`,
      { parse_mode: 'HTML', reply_markup: inlineKb }
    );
  });

  // Callback: cancel_manual_pay:<id>
  bot.callbackQuery(/^cancel_manual_pay:(.+)$/, async (ctx) => {
    const requestId = ctx.match[1];
    try {
      await prisma.manualPaymentRequest.update({
        where: { id: requestId },
        data: { status: 'REJECTED', adminNote: 'Cancelled by user' },
      });
      await ctx.answerCallbackQuery({ text: 'Payment request cancelled.' });
      await ctx.editMessageText('❌ Your manual payment request has been cancelled.');
    } catch {
      await ctx.answerCallbackQuery({ text: 'Unable to cancel request.' });
    }
  });

  // pre_checkout_query Webhook (< 10 seconds answer requirement)
  bot.on('pre_checkout_query', async (ctx) => {
    try {
      const query = ctx.preCheckoutQuery;
      const payload = query.invoice_payload;

      if (!payload || !payload.startsWith('plan_purchase:')) {
        await ctx.answerPreCheckoutQuery(false, { error_message: 'Invalid invoice payload format.' });
        return;
      }

      if (query.currency !== 'XTR') {
        await ctx.answerPreCheckoutQuery(false, { error_message: 'Invalid currency. Only Telegram Stars (XTR) are supported.' });
        return;
      }

      const parts = payload.split(':');
      const tier = parts[1] as 'PLUS' | 'PRO' | 'BOSS';
      const invoiceBuyerId = parts[2];

      if (tier !== 'PLUS' && tier !== 'PRO' && tier !== 'BOSS') {
        await ctx.answerPreCheckoutQuery(false, { error_message: 'Unsupported subscription tier.' });
        return;
      }

      if (String(ctx.from.id) !== invoiceBuyerId) {
        await ctx.answerPreCheckoutQuery(false, { error_message: 'Invoice was intended for a different user account.' });
        return;
      }

      const plans = getPlansConfig();
      const planConfig = plans[tier];

      if (query.total_amount !== planConfig.starsPrice) {
        await ctx.answerPreCheckoutQuery(false, { error_message: 'Invoice amount does not match current plan price.' });
        return;
      }

      const telegramId = BigInt(ctx.from.id);
      const user = await prisma.user.findUnique({ where: { telegramId } });
      if (!user) {
        await ctx.answerPreCheckoutQuery(false, { error_message: 'User profile not found. Please type /start first.' });
        return;
      }

      const isSuspended =
        user.isBanned ||
        user.isPermanentlyBanned ||
        Boolean(user.bannedUntil && new Date(user.bannedUntil) > new Date());
      if (isSuspended) {
        await ctx.answerPreCheckoutQuery(false, { error_message: 'Suspended accounts cannot purchase subscriptions.' });
        return;
      }

      await ctx.answerPreCheckoutQuery(true);
    } catch (err) {
      console.error('[Payments] Pre-checkout query error:', err);
      await ctx.answerPreCheckoutQuery(false, { error_message: 'Checkout validation failed.' });
    }
  });

  // successful_payment Webhook
  bot.on('message:successful_payment', async (ctx) => {
    const payment = ctx.message?.successful_payment;
    if (!payment) return;

    const payload = payment.invoice_payload;
    if (!payload || !payload.startsWith('plan_purchase:')) {
      console.error('[Payments] Invalid or missing invoice payload structure:', payload);
      return;
    }

    if (payment.currency !== 'XTR') {
      console.error('[Payments] Non-XTR payment received in successful_payment:', payment.currency);
      return;
    }

    const parts = payload.split(':');
    const tier = parts[1] as 'PLUS' | 'PRO' | 'BOSS';
    const invoiceBuyerId = parts[2];
    const orderNumber = parts[3] || 'A0';
    const telegramId = BigInt(ctx.from?.id || 0);

    if (tier !== 'PLUS' && tier !== 'PRO' && tier !== 'BOSS') {
      console.error('[Payments] Unsupported subscription tier in payload:', tier);
      return;
    }

    if (String(ctx.from?.id) !== invoiceBuyerId) {
      console.error('[Payments] Buyer ID mismatch in successful_payment:', { actual: ctx.from?.id, invoiceBuyerId });
      return;
    }

    const plans = getPlansConfig();
    const config = plans[tier];

    if (payment.total_amount !== config.starsPrice) {
      console.error('[Payments] Payment amount mismatch:', { received: payment.total_amount, expected: config.starsPrice });
      return;
    }

    try {
      const result = await prisma.$transaction(async (tx) => {
        const existingTx = await tx.starsTransaction.findUnique({
          where: { telegramPaymentId: payment.telegram_payment_charge_id },
        });

        if (existingTx) {
          return { status: 'duplicate' as const, user: null };
        }

        const user = await tx.user.findUnique({ where: { telegramId } });
        if (!user) {
          return { status: 'user_not_found' as const, user: null };
        }

        const isSuspended =
          user.isBanned ||
          user.isPermanentlyBanned ||
          Boolean(user.bannedUntil && new Date(user.bannedUntil) > new Date());

        if (isSuspended) {
          await tx.starsTransaction.create({
            data: {
              orderNumber,
              userId: user.id,
              telegramPaymentId: payment.telegram_payment_charge_id,
              starsAmount: payment.total_amount,
              planTier: tier,
              status: 'PAID',
            },
          });
          return { status: 'suspended' as const, user };
        }

        const targetTier = isDowngrade(user.plan, tier) ? user.plan : tier;
        const targetConfig = plans[targetTier as keyof typeof plans] || plans.PLUS;
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

        const updatedUser = await tx.user.update({
          where: { id: user.id },
          data: {
            plan: targetTier,
            subscriptionStatus: 'ACTIVE',
            subscriptionExpiresAt: expiresAt,
            maxDuration: targetConfig.maxDuration,
            dailyLimit: targetConfig.dailyLimit,
            dailyCallsUsed: 0,
          },
        });

        await tx.starsTransaction.create({
          data: {
            orderNumber,
            userId: user.id,
            telegramPaymentId: payment.telegram_payment_charge_id,
            starsAmount: payment.total_amount,
            planTier: tier,
            status: 'PAID',
          },
        });

        return { status: 'success' as const, user: updatedUser };
      });

      if (result.status === 'duplicate') {
        console.log('[Payments] Duplicate payment webhook safely acknowledged', { chargeId: payment.telegram_payment_charge_id });
        return;
      }

      if (result.status === 'suspended') {
        await ctx.reply(
          `⚠️ <b>Payment received</b>, but your account is currently suspended.\n` +
            `Please submit an /appeal to our moderation team with Payment ID: <code>${payment.telegram_payment_charge_id}</code>`,
          { parse_mode: 'HTML' }
        );
        return;
      }

      if (result.status === 'success' && result.user) {
        await ctx.reply(
          `🎉 <b>Payment Successful!</b>\n\n` +
            `Your subscription has been upgraded to <b>${result.user.plan} Plan</b> (Order #${orderNumber}).\n` +
            `• Max Call Duration: ${config.maxDuration >= 999 ? 'Unlimited' : `${config.maxDuration} minutes`}\n` +
            `• Monthly Calls: ${config.dailyLimit >= 999 ? 'Unlimited' : `${config.dailyLimit} calls/month`}\n` +
            `• Recording Storage: ${config.retentionDays} days\n\n` +
            `Thank you for supporting PairTalk!`,
          { parse_mode: 'HTML' }
        );
      } else {
        console.error('[Payments] User not found after successful payment', { telegramId: telegramId.toString() });
        await ctx.reply(
          `⚠️ Payment received, but we could not locate your user profile.\n` +
            `Please contact support with your payment ID: <code>${payment.telegram_payment_charge_id}</code>`,
          { parse_mode: 'HTML' }
        );
      }
    } catch (err) {
      console.error('[Payments] Error handling successful_payment:', err);
      await ctx.reply(`Payment received! Subscription processing complete.`);
    }
  });

  // /paysupport Command
  if (typeof (bot as any).command === 'function') {
    (bot as any).command('paysupport', async (ctx: any) => {
      const telegramId = BigInt(ctx.from?.id || 0);
      const user = await prisma.user.findUnique({ where: { telegramId } });

      if (!user) {
        await ctx.reply('Please register first with /start.');
        return;
      }

      const starsTx = await prisma.starsTransaction.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });

      const manualRequests = await prisma.manualPaymentRequest.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });

      interface UnifiedTx {
        id: string;
        orderNumber?: string;
        type: 'STARS' | 'UZS';
        plan: string;
        amountStr: string;
        status: string;
        createdAt: Date;
      }

      const combined: UnifiedTx[] = [
        ...starsTx.map((tx) => ({
          id: tx.id,
          orderNumber: tx.orderNumber || undefined,
          type: 'STARS' as const,
          plan: tx.planTier,
          amountStr: `⭐ ${tx.starsAmount} XTR`,
          status: tx.status,
          createdAt: tx.createdAt,
        })),
        ...manualRequests.map((req) => ({
          id: req.id,
          orderNumber: req.orderNumber || `A${req.id.slice(0, 4)}`,
          type: 'UZS' as const,
          plan: req.plan,
          amountStr: `💳 ${req.uzsAmount.toLocaleString()} UZS`,
          status: req.status,
          createdAt: req.createdAt,
        })),
      ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      let historyText = '<b>Recent Transactions:</b>\n';
      if (combined.length === 0) {
        historyText += '<i>No payment transactions recorded for this account.</i>\n';
      } else {
        combined.slice(0, 15).forEach((tx) => {
          const dateStr = tx.createdAt.toISOString().slice(0, 16).replace('T', ' ');
          const statusIcon = tx.status === 'APPROVED' || tx.status === 'SUCCESS' ? '✅' : tx.status === 'PENDING' ? '⏳' : '❌';
          const orderPrefix = tx.orderNumber ? `[#${tx.orderNumber}] ` : '';
          historyText += `• ${tx.amountStr} — <b>${tx.plan}</b>: ${statusIcon} <code>${tx.status}</code> (${orderPrefix}${dateStr})\n`;
        });
      }

      const adminContact = env.MANUAL_PAYMENT_ADMIN_USERNAME ? `@${env.MANUAL_PAYMENT_ADMIN_USERNAME.replace(/^@/, '')}` : '@PairTalkSupport';
      const inlineKb = new InlineKeyboard().text('⭐ View Plans & Pricing', 'show_plans');

      await ctx.reply(
        `🛡️ <b>Payment & Billing Support</b>\n\n` +
          `${historyText}\n` +
          `📌 <b>Refund & Dispute Information</b>:\n` +
          `• <b>Telegram Stars</b>: In-app digital Stars refunds can be requested within 48 hours for service disruptions.\n` +
          `• <b>Card Payments (UZS)</b>: Verified manual card refunds are processed by admin review.\n` +
          `• <b>Revocation</b>: Processing a refund automatically reverts account entitlements to the FREE tier.\n\n` +
          `For billing inquiries or disputes, contact Admin: ${adminContact}`,
        { parse_mode: 'HTML', reply_markup: inlineKb }
      );
    });
  }

  // In-bot receipt ingest for users submitting manual payment receipts (photos, documents, PDFs)
  bot.on(['message:photo', 'message:document'], async (ctx, next) => {
    try {
      const telegramId = BigInt(ctx.from.id);
      const pendingPlan = ctx.session.pendingPaymentPlan;

      let pendingRequest = await prisma.manualPaymentRequest.findFirst({
        where: { telegramId, status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
      });

      if (!pendingPlan && !pendingRequest) {
        return next();
      }

      const user = await prisma.user.findUnique({ where: { telegramId } });
      if (!user) {
        return next();
      }

      const planTier = pendingPlan || pendingRequest?.plan || 'PLUS';
      const plans = getPlansConfig();
      const config = plans[planTier as keyof typeof plans] || plans.PLUS;
      const orderNumber = pendingRequest?.orderNumber || await generateOrderNumber('A');

      const isPhoto = Boolean(ctx.message?.photo && ctx.message.photo.length > 0);
      let fileId = '';
      let fileUniqueId = '';
      let fileName: string | undefined = undefined;
      let mimeType: string | undefined = undefined;
      let fileSize = 0;

      if (isPhoto && ctx.message?.photo) {
        const highestRes = ctx.message.photo[ctx.message.photo.length - 1];
        fileId = highestRes.file_id;
        fileUniqueId = highestRes.file_unique_id;
        fileSize = highestRes.file_size || 0;
        mimeType = 'image/jpeg';
        fileName = `receipt_${orderNumber}.jpg`;
      } else if (ctx.message?.document) {
        const doc = ctx.message.document;
        fileId = doc.file_id;
        fileUniqueId = doc.file_unique_id;
        fileSize = doc.file_size || 0;
        fileName = doc.file_name;
        mimeType = doc.mime_type;
      }

      if (!fileId) {
        return next();
      }

      console.log(`[Payments] RECEIPT_RECEIVED`, {
        orderNumber,
        userId: user.id,
        telegramId: ctx.from.id,
        mimeType: mimeType || 'unknown',
        fileSize,
        fileName: fileName || 'unnamed',
        isPhoto,
      });

      // Strict Authoritative Validation (P0-A)
      const validation = validateReceipt({
        isPhoto,
        mimeType,
        fileName,
        fileSize,
        orderNumber,
      });

      if (!validation.valid) {
        console.log(`[Payments] RECEIPT_REJECTED`, {
          orderNumber,
          category: validation.category,
          reason: validation.reason,
        });

        await ctx.reply(validation.userMessage, { parse_mode: 'HTML' });
        return;
      }

      console.log(`[Payments] RECEIPT_VALIDATED`, {
        orderNumber,
        category: validation.category,
        fileId,
        fileUniqueId,
        mimeType: validation.mimeType,
        fileName: validation.fileName,
      });

      const proofMeta = {
        fileId,
        fileUniqueId,
        fileName: validation.fileName,
        mimeType: validation.mimeType,
        fileSize: validation.fileSize,
        messageId: ctx.message?.message_id,
        telegramId: ctx.from.id,
        orderNumber,
        uploadedAt: new Date().toISOString(),
      };

      if (!pendingRequest) {
        const res = await createManualPaymentRequest({
          userId: user.id,
          telegramId,
          alias: user.alias,
          plan: planTier,
          uzsAmount: config.uzsPrice,
        });
        if (res.success && res.request) {
          pendingRequest = res.request as any;
        }
      }

      if (pendingRequest) {
        await prisma.manualPaymentRequest.update({
          where: { id: pendingRequest.id },
          data: { paymentProof: JSON.stringify(proofMeta), orderNumber },
        });
      }

      ctx.session.pendingPaymentPlan = undefined;
      ctx.session.step = 'idle';

      console.log(`[Payments] RECEIPT_ATTACHED`, { orderNumber, requestId: pendingRequest?.id });

      await ctx.reply(
        `✅ <b>Payment Receipt Received!</b>\n\n` +
          `Your receipt (<b>${validation.fileName}</b>) has been submitted for Order #<b>${orderNumber}</b>.\n` +
          `Our administration team will verify your payment and activate your <b>${planTier} Plan</b> subscription shortly.\n\n` +
          `Thank you for practicing with us!`,
        { parse_mode: 'HTML' }
      );

      // P0-B: Download file bytes via Main Bot so Bot B can upload raw bytes (InputFile) to admin
      console.log(`[Payments] ADMIN_NOTIFICATION_STARTED`, { orderNumber });
      try {
        const downloadedReceipt = await downloadTelegramReceiptFile(ctx.api, fileId);

        await sendAdminPaymentNotification(ctx.api as any, {
          orderNumber,
          userAlias: user.alias,
          telegramId: user.telegramId,
          plan: planTier,
          uzsAmount: config.uzsPrice,
          paymentMethod: 'MANUAL_UZS',
          receiptBuffer: downloadedReceipt?.buffer || null,
          receiptFileName: validation.fileName,
          receiptMimeType: validation.mimeType,
          createdAt: pendingRequest?.createdAt || new Date(),
          status: 'PENDING',
        });

        console.log(`[Payments] ADMIN_NOTIFICATION_SENT`, { orderNumber });
      } catch (notifyErr) {
        const rawErr = notifyErr instanceof Error ? notifyErr.message : String(notifyErr);
        const sanitizedErr = rawErr.replace(/bot\d+:[a-zA-Z0-9_-]+/g, '[REDACTED_TOKEN]');
        console.error(`[Payments] ADMIN_NOTIFICATION_FAILED`, {
          orderNumber,
          error: sanitizedErr,
        });
      }
    } catch (err) {
      console.error('[Payments] Error handling receipt message:', err);
      return next();
    }
  });
}
