import { Bot, InlineKeyboard } from 'grammy';
import { MyContext } from '../types';
import { prisma } from '../../config/database';
import { getPlansConfig, formatPriceDisplay, createManualPaymentRequest, getEffectiveEntitlement, isDowngrade } from '../../services/plan';
import { checkRateLimit } from '../../services/rateLimitMatrix';
import { env } from '../../config/env';

export function setupPaymentHandlers(bot: Bot<MyContext>) {
  // Callback: select_plan:PLUS or select_plan:PRO
  bot.callbackQuery(/^select_plan:(PLUS|PRO)$/, async (ctx) => {
    const tier = ctx.match[1] as 'PLUS' | 'PRO';
    const plans = getPlansConfig();
    const planConfig = plans[tier];
    const formattedUzs = planConfig.uzsPrice.toLocaleString('en-US');

    const inlineKb = new InlineKeyboard()
      .text(`⭐ Telegram Stars (${planConfig.starsPrice} XTR)`, `buy_plan:${tier}`)
      .row()
      .text(`💳 Pay with Card (${formattedUzs} UZS)`, `manual_pay:${tier}`)
      .row()
      .text('⬅️ Back to Plans', 'show_plans');

    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      `💎 *Upgrade to ${tier} Plan*\n\n` +
        `• Max Call Duration: *${planConfig.maxDuration} mins*\n` +
        `• Daily Limit: *${planConfig.dailyLimit >= 999 ? 'Unlimited' : `${planConfig.dailyLimit} calls/day`}*\n` +
        `• Recording Storage: *${planConfig.retentionDays} days*\n\n` +
        `Choose your preferred payment method:`,
      { parse_mode: 'Markdown', reply_markup: inlineKb }
    );
  });

  // Callback: show_plans (overview)
  bot.callbackQuery('show_plans', async (ctx) => {
    const telegramId = BigInt(ctx.from.id);
    const user = await prisma.user.findUnique({ where: { telegramId } });
    const entitlement = user ? getEffectiveEntitlement(user) : getEffectiveEntitlement({ plan: 'FREE' });

    const inlineKb = new InlineKeyboard()
      .text(`⚡ PLUS (${formatPriceDisplay('PLUS')})`, 'select_plan:PLUS')
      .row()
      .text(`🚀 PRO (${formatPriceDisplay('PRO')})`, 'select_plan:PRO');

    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      `⭐ *Subscription Plans & Pricing*\n\n` +
        `Current Plan: *${entitlement.planDisplayName}*\n\n` +
        `🆓 *FREE Plan*\n` +
        `• Duration: 15 mins | Limit: 3 calls/day | Retention: 1 day\n\n` +
        `⚡ *PLUS Plan* (${formatPriceDisplay('PLUS')})\n` +
        `• Duration: 30 mins | Limit: 10 calls/day | Retention: 7 days\n\n` +
        `🚀 *PRO Plan* (${formatPriceDisplay('PRO')})\n` +
        `• Duration: 60 mins | Limit: Unlimited (∞) | Retention: 30 days\n\n` +
        `Select a plan to choose payment method:`,
      { parse_mode: 'Markdown', reply_markup: inlineKb }
    );
  });

  // Callback: buy_plan:PLUS or buy_plan:PRO (Telegram Stars)
  bot.callbackQuery(/^buy_plan:(PLUS|PRO)$/, async (ctx) => {
    const tier = ctx.match[1] as 'PLUS' | 'PRO';
    const plans = getPlansConfig();
    const planConfig = plans[tier];

    const rl = await checkRateLimit('PAYMENT_INVOICE', String(ctx.from.id));
    if (!rl.allowed) {
      await ctx.answerCallbackQuery({ text: rl.error?.message || 'Please wait a moment.', show_alert: true });
      return;
    }

    try {
      await ctx.answerCallbackQuery();

      const telegramId = BigInt(ctx.from.id);
      const user = await prisma.user.findUnique({ where: { telegramId } });

      if (user) {
        const isSuspended =
          user.isBanned ||
          user.isPermanentlyBanned ||
          Boolean(user.bannedUntil && new Date(user.bannedUntil) > new Date());

        if (isSuspended) {
          await ctx.reply('🚫 Your account is currently suspended and cannot purchase subscriptions.');
          return;
        }

        if (user.plan === 'PRO' && tier === 'PLUS') {
          await ctx.reply('ℹ️ You are already subscribed to the highest tier (*PRO Plan*).', { parse_mode: 'Markdown' });
          return;
        }
      }

      const maxDurText = planConfig.maxDuration >= 999 ? 'Unlimited' : `${planConfig.maxDuration}m`;
      const dailyLimText = planConfig.dailyLimit >= 999 ? 'Unlimited' : `${planConfig.dailyLimit} calls/day`;

      await ctx.replyWithInvoice(
        `IELTS P2P ${tier} Plan Subscription`,
        `Upgrade to ${tier} Plan (${maxDurText} call limit, ${dailyLimText}, ${planConfig.retentionDays}d recording storage).`,
        `plan_purchase:${tier}:${ctx.from.id}:${Date.now()}`,
        'XTR', // Currency for Telegram Stars
        [{ label: `${tier} Plan Subscription`, amount: planConfig.starsPrice }],
        { provider_token: '' } // provider_token must be empty string for Telegram Stars
      );
    } catch (err) {
      console.error('[Payments] Failed to send Stars invoice:', err);
      await ctx.reply('⚠️ Unable to open payment invoice right now. Please try again later.');
    }
  });

  // Callback: manual_pay:PLUS or manual_pay:PRO (Card / UZS Manual)
  bot.callbackQuery(/^manual_pay:(PLUS|PRO)$/, async (ctx) => {
    const tier = ctx.match[1] as 'PLUS' | 'PRO';
    const telegramId = BigInt(ctx.from.id);
    const plans = getPlansConfig();
    const config = plans[tier];

    const user = await prisma.user.findUnique({ where: { telegramId } });
    if (!user) {
      await ctx.answerCallbackQuery({ text: 'Please start the bot first (/start)', show_alert: true });
      return;
    }

    if (user.isBanned || user.isPermanentlyBanned) {
      await ctx.answerCallbackQuery({ text: '🚫 Suspended accounts cannot purchase plans.', show_alert: true });
      return;
    }

    const res = await createManualPaymentRequest({
      userId: user.id,
      telegramId,
      alias: user.alias,
      plan: tier,
      uzsAmount: config.uzsPrice,
    });

    if (!res.success || !res.request) {
      await ctx.answerCallbackQuery({
        text: res.error?.message || 'Unable to create payment request.',
        show_alert: true,
      });
      return;
    }

    const request = res.request;
    const formattedAmount = config.uzsPrice.toLocaleString('en-US');
    const adminContact = env.ADMIN_TELEGRAM_IDS?.[0] ? `@id${env.ADMIN_TELEGRAM_IDS[0]}` : '@IELTS_P2P_Admin';
    const cardDetails = '💳 `8600 1234 5678 9012` (Humo/Uzcard - IELTS Partner)';

    const inlineKb = new InlineKeyboard()
      .text('❌ Cancel Request', `cancel_manual_pay:${request.id}`)
      .row()
      .text('⬅️ Back to Plans', 'show_plans');

    await ctx.answerCallbackQuery();
    await ctx.reply(
      `📋 *Manual Card Payment Request (#${request.id.slice(0, 8)})*\n\n` +
        `You have requested the *${tier} Plan* subscription.\n\n` +
        `💵 *Amount Due*: *${formattedAmount} UZS*\n` +
        `💳 *Card / Payment Requisites*:\n${cardDetails}\n\n` +
        `📌 *Instructions*:\n` +
        `1. Transfer exact amount (*${formattedAmount} UZS*) to the card above.\n` +
        `2. Save the transaction receipt or screenshot.\n` +
        `3. Send your receipt with Request ID \`${request.id}\` to Admin: ${adminContact}.\n\n` +
        `_Your subscription will be activated upon verification._`,
      { parse_mode: 'Markdown', reply_markup: inlineKb }
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
      const tier = parts[1] as 'PLUS' | 'PRO';
      const invoiceBuyerId = parts[2];

      if (tier !== 'PLUS' && tier !== 'PRO') {
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
    const tier = parts[1] as 'PLUS' | 'PRO';
    const invoiceBuyerId = parts[2];
    const telegramId = BigInt(ctx.from?.id || 0);

    if (tier !== 'PLUS' && tier !== 'PRO') {
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
          `⚠️ Payment received, but your account is currently suspended.\n` +
            `Please submit an /appeal to our moderation team with Payment ID: \`${payment.telegram_payment_charge_id}\``,
          { parse_mode: 'Markdown' }
        );
        return;
      }

      if (result.status === 'success' && result.user) {
        await ctx.reply(
          `🎉 *Payment Successful!*\n\n` +
            `Your subscription has been upgraded to *${result.user.plan} Plan*.\n` +
            `• Max Call Duration: ${config.maxDuration >= 999 ? 'Unlimited' : `${config.maxDuration} minutes`}\n` +
            `• Daily Limit: ${config.dailyLimit >= 999 ? 'Unlimited' : `${config.dailyLimit} calls/day`}\n` +
            `• Recording Storage: ${config.retentionDays} days\n\n` +
            `Thank you for supporting IELTS Speaking P2P!`,
          { parse_mode: 'Markdown' }
        );
      } else {
        console.error('[Payments] User not found after successful payment', { telegramId: telegramId.toString() });
        await ctx.reply(
          `⚠️ Payment received, but we could not locate your user profile.\n` +
            `Please contact support with your payment ID: \`${payment.telegram_payment_charge_id}\``,
          { parse_mode: 'Markdown' }
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
        take: 3,
      });

      const manualRequests = await prisma.manualPaymentRequest.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        take: 3,
      });

      let historyText = '*Recent Transactions*:\n';
      if (starsTx.length === 0 && manualRequests.length === 0) {
        historyText += '_No payment transactions found._\n';
      }

      starsTx.forEach((tx) => {
        const date = tx.createdAt.toISOString().split('T')[0];
        historyText += `• ⭐ Stars: *${tx.planTier}* (${tx.starsAmount} XTR) — \`${tx.status}\` on ${date}\n`;
      });

      manualRequests.forEach((req) => {
        const date = req.createdAt.toISOString().split('T')[0];
        historyText += `• 💳 UZS: *${req.plan}* (${req.uzsAmount.toLocaleString()} UZS) — \`${req.status}\` on ${date}\n`;
      });

      const adminContact = env.ADMIN_TELEGRAM_IDS?.[0] ? `@id${env.ADMIN_TELEGRAM_IDS[0]}` : '@IELTS_P2P_Admin';
      const inlineKb = new InlineKeyboard().text('⭐ View Plans & Pricing', 'show_plans');

      await ctx.reply(
        `🛡️ *Payment & Billing Support*\n\n` +
          `${historyText}\n` +
          `📌 *Refund & Dispute Information*:\n` +
          `• *Telegram Stars*: In-app digital Stars refunds can be requested within 48 hours for service disruptions.\n` +
          `• *Card Payments (UZS)*: Verified manual card refunds are processed by admin review.\n` +
          `• *Revocation*: Processing a refund automatically reverts account entitlements to the FREE tier.\n\n` +
          `For billing inquiries or disputes, contact Admin: ${adminContact}`,
        { parse_mode: 'Markdown', reply_markup: inlineKb }
      );
    });
  }

  // In-bot receipt ingest for users with PENDING manual payment requests
  bot.on(['message:photo', 'message:document'], async (ctx, next) => {
    try {
      const telegramId = BigInt(ctx.from.id);
      const pendingRequest = await prisma.manualPaymentRequest.findFirst({
        where: { telegramId, status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
      });

      if (!pendingRequest) {
        return next();
      }

      let fileId = '';
      let mimeType = 'image/jpeg';

      if (ctx.message?.photo && ctx.message.photo.length > 0) {
        const highestRes = ctx.message.photo[ctx.message.photo.length - 1];
        fileId = highestRes.file_id;
        mimeType = 'image/jpeg';
      } else if (ctx.message?.document) {
        fileId = ctx.message.document.file_id;
        mimeType = ctx.message.document.mime_type || 'application/octet-stream';
      }

      if (!fileId) {
        return next();
      }

      const proofStr = `tg_file:${fileId}:${mimeType}`;
      await prisma.manualPaymentRequest.update({
        where: { id: pendingRequest.id },
        data: { paymentProof: proofStr },
      });

      await ctx.reply(
        `✅ *Payment Receipt Received!*\n\n` +
          `Your receipt has been attached to Request ID \`${pendingRequest.id.slice(0, 8)}\`.\n` +
          `Our administration team will verify your transaction and activate your *${pendingRequest.plan} Plan* within 15–30 minutes.\n\n` +
          `Thank you for practicing with us!`,
        { parse_mode: 'Markdown' }
      );

      // Notify configured admins
      if (env.ADMIN_TELEGRAM_IDS && env.ADMIN_TELEGRAM_IDS.length > 0) {
        const adminId = env.ADMIN_TELEGRAM_IDS[0];
        const alertCaption =
          `🧾 *NEW MANUAL PAYMENT RECEIPT*\n\n` +
          `• *User*: ${pendingRequest.alias} (\`ID: ${telegramId}\`)\n` +
          `• *Plan*: ${pendingRequest.plan}\n` +
          `• *Amount*: ${pendingRequest.uzsAmount.toLocaleString()} UZS\n` +
          `• *Request ID*: \`${pendingRequest.id}\``;

        try {
          if (ctx.message?.photo) {
            await ctx.api.sendPhoto(adminId, fileId, {
              caption: alertCaption,
              parse_mode: 'Markdown',
            });
          } else {
            await ctx.api.sendDocument(adminId, fileId, {
              caption: alertCaption,
              parse_mode: 'Markdown',
            });
          }
        } catch (notifyErr) {
          console.warn('[Payments] Failed to forward receipt to admin chat:', notifyErr);
        }
      }
    } catch (err) {
      console.error('[Payments] Error handling receipt message:', err);
      return next();
    }
  });
}
