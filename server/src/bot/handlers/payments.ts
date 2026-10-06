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
import { escapeHtml } from '../../utils/sanitize';
import { logger } from '../../utils/logger';
import { lockRow } from '../../utils/transactionLock';
import { completeStarsRefund } from '../../services/starsRefund';

async function editMessageOrCaption(ctx: MyContext, text: string, other?: Record<string, unknown>) {
  const isPhotoMessage = Boolean(ctx.callbackQuery?.message && 'photo' in ctx.callbackQuery.message);

  if (isPhotoMessage) {
    try {
      return await ctx.editMessageCaption({
        caption: text,
        parse_mode: 'HTML',
        ...other,
      });
    } catch (captionErr: unknown) {
      const errDesc = captionErr instanceof Error ? captionErr.message : String((captionErr as { description?: string })?.description || '');
      if (errDesc.includes('message is not modified')) {
        return;
      }
      try {
        await ctx.deleteMessage().catch(() => {});
        return await ctx.reply(text, { parse_mode: 'HTML', ...other });
      } catch {
        return await ctx.reply(text, { parse_mode: 'HTML', ...other });
      }
    }
  }

  try {
    return await ctx.editMessageText(text, { parse_mode: 'HTML', ...other });
  } catch (textErr: unknown) {
    const errDesc = textErr instanceof Error ? textErr.message : String((textErr as { description?: string })?.description || '');
    if (errDesc.includes('message is not modified')) {
      return;
    }
    if (errDesc.includes('there is no text in the message to edit')) {
      try {
        return await ctx.editMessageCaption({
          caption: text,
          parse_mode: 'HTML',
          ...other,
        });
      } catch {
        return await ctx.reply(text, { parse_mode: 'HTML', ...other });
      }
    }
    throw textErr;
  }
}

export async function renderPlanSelection(ctx: MyContext, tier: 'PLUS' | 'PRO' | 'BOSS') {
  const plans = getPlansConfig();
  const planConfig = plans[tier];
  if (!planConfig) {
    if (ctx.callbackQuery) {
      await ctx.answerCallbackQuery({ text: 'Unknown plan selected.' });
    } else {
      await ctx.reply('Unknown plan selected. Type /plans to view available tiers.');
    }
    return;
  }

  const fromId = ctx.from?.id;
  if (fromId) {
    const telegramId = BigInt(fromId);
    const user = await prisma.user.findUnique({ where: { telegramId } });
    if (user) {
      const profile = getPaidUserProfile(user);
      if (profile.isActivePaid) {
        if (profile.plan === tier) {
          const msg = `You already have an active ${escapeHtml(profile.plan)} plan. You cannot purchase the same tier again while it is active.`;
          if (ctx.callbackQuery) {
            await ctx.answerCallbackQuery({ text: `You already have an active ${profile.plan} plan. You cannot purchase the same tier again while it is active.`, show_alert: true });
          } else {
            await ctx.reply(`⚠️ <b>Active Subscription</b>\n\n${msg}`, { parse_mode: 'HTML' });
          }
          return;
        }
        if (isDowngrade(profile.plan, tier)) {
          const msg = `You have an active ${escapeHtml(profile.plan)} plan. Downgrading to ${escapeHtml(tier)} is not supported while your current subscription is active.`;
          if (ctx.callbackQuery) {
            await ctx.answerCallbackQuery({ text: `You have an active ${profile.plan} plan. Downgrading to ${tier} is not supported while your current subscription is active.`, show_alert: true });
          } else {
            await ctx.reply(`⚠️ <b>Downgrade Not Supported</b>\n\n${msg}`, { parse_mode: 'HTML' });
          }
          return;
        }
      }

      const pendingRequest = await prisma.manualPaymentRequest.findFirst({
        where: { telegramId, status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
      });

      if (pendingRequest) {
        const orderNum = pendingRequest.orderNumber || `A${pendingRequest.id.slice(0, 4)}`;
        const msg = `⏳ You already have a pending request for ${escapeHtml(pendingRequest.plan)} Plan (Order #${escapeHtml(orderNum)}) awaiting verification. Please wait for approval or cancel it before requesting another.`;
        if (ctx.callbackQuery) {
          await ctx.answerCallbackQuery({ text: `⏳ You already have a pending request for ${pendingRequest.plan} Plan (Order #${orderNum}) awaiting verification. Please wait for approval or cancel it before requesting another.`, show_alert: true });
        } else {
          await ctx.reply(msg, { parse_mode: 'HTML' });
        }
        return;
      }
    }
  }

  const formattedUzs = planConfig.uzsPrice.toLocaleString('en-US');

  const inlineKb = new InlineKeyboard()
    .text(`⭐ Telegram Stars (${planConfig.starsPrice} Stars)`, `buy_plan:${tier}`)
    .row()
    .text(`💳 Pay with Card (${formattedUzs} UZS)`, `manual_pay:${tier}`)
    .row()
    .text('⬅️ Back to Plans', 'show_plans');

  if (ctx.callbackQuery) {
    await ctx.answerCallbackQuery().catch(() => undefined);
  }

  const text =
    `💎 <b>Upgrade to ${tier} Plan</b>\n\n` +
    `• Max Call Duration: <b>${planConfig.maxDuration} mins</b>\n` +
    `• Monthly Calls: <b>${planConfig.dailyLimit >= 999 ? 'Unlimited' : `${planConfig.dailyLimit} calls/month`}</b>\n` +
    `• Recording Storage: <b>${planConfig.retentionDays} days</b>\n\n` +
    `⚠️ <i>Note: Prices in UZS and Stars may slightly differ due to local and platform taxes.</i>\n\n` +
    `Choose your preferred payment method:`;

  await editMessageOrCaption(ctx, text, { reply_markup: inlineKb });
}

export async function renderPlansOverview(ctx: MyContext) {
  ctx.session.pendingPaymentPlan = undefined;
  ctx.session.step = 'idle';

  const telegramId = ctx.from?.id ? BigInt(ctx.from.id) : null;
  const user = telegramId ? await prisma.user.findUnique({ where: { telegramId } }) : null;
  const profile = user ? getPaidUserProfile(user) : getPaidUserProfile({ plan: 'FREE' });

  const pendingRequest = telegramId
    ? await prisma.manualPaymentRequest.findFirst({
        where: { telegramId, status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
      })
    : null;

  const inlineKb = new InlineKeyboard();

  if (pendingRequest) {
    inlineKb
      .text('✖️ Cancel Pending Request', `cancel_manual_pay:${pendingRequest.id}`)
      .row();
  } else {
    inlineKb
      .text(`⚡ PLUS (${formatPriceDisplay('PLUS')})`, 'select_plan:PLUS')
      .row()
      .text(`🚀 PRO (${formatPriceDisplay('PRO')})`, 'select_plan:PRO')
      .row()
      .text(`👑 BOSS (${formatPriceDisplay('BOSS')})`, 'select_plan:BOSS');
  }

  let pendingBanner = '';
  if (pendingRequest) {
    const orderNum = pendingRequest.orderNumber || `A${pendingRequest.id.slice(0, 4)}`;
    pendingBanner =
      `⏳ <b>Active Pending Request:</b>\n` +
      `• <b>Plan</b>: ${escapeHtml(pendingRequest.plan)}\n` +
      `• <b>Order</b>: <code>#${escapeHtml(orderNum)}</code>\n` +
      `• <b>Status</b>: <i>Under Review by Administrators</i>\n` +
      `<i>You cannot submit another payment request until this one is approved, rejected, or cancelled.</i>\n\n`;
  }

  if (ctx.callbackQuery) {
    await ctx.answerCallbackQuery().catch(() => undefined);
  }

  await editMessageOrCaption(
    ctx,
    `⭐ <b>Subscription Plans & Pricing</b>\n\n` +
      `Current Plan: <b>${escapeHtml(profile.planDisplayName)}</b>\n` +
      (profile.isActivePaid && profile.expiration ? `Expires: <code>${escapeHtml(profile.expiration)}</code>\n\n` : '\n') +
      pendingBanner +
      `🆓 <b>FREE Plan</b> (0 UZS / 0 Stars)\n` +
      `• Max Call Duration: 15 minutes\n` +
      `• Monthly Calls: 3\n` +
      `• Monthly Recordings: 1\n` +
      `• Recording Retention: 1 day\n\n` +
      `⚡ <b>PLUS Plan</b> (${formatPriceDisplay('PLUS')})\n` +
      `• Max Call Duration: 30 minutes\n` +
      `• Monthly Calls: 10\n` +
      `• Monthly Recordings: 3 (7-day retention)\n` +
      `• Matchmaking: Priority Queue\n\n` +
      `🚀 <b>PRO Plan</b> (${formatPriceDisplay('PRO')})\n` +
      `• Max Call Duration: 60 minutes\n` +
      `• Monthly Calls: 25\n` +
      `• Monthly Recordings: 7 (30-day retention)\n` +
      `• Matchmaking: Fast-Track High Priority\n\n` +
      `👑 <b>BOSS Plan</b> (${formatPriceDisplay('BOSS')})\n` +
      `• Max Call Duration: 90 minutes\n` +
      `• Monthly Calls: 50\n` +
      `• Monthly Recordings: 15 (90-day retention)\n` +
      `• Matchmaking: VIP Top-Priority Queue\n\n` +
      `🛡️ <b>Refund Policy:</b>\n` +
      `Eligible within 48 hours of purchase OR if less than 10% of monthly call allowance has been used.\n\n` +
      `⚠️ <b>Tax Notice:</b> Prices in UZS and Stars may slightly differ due to local and platform taxes.\n\n` +
      (pendingRequest ? `<i>Manage your pending payment request below:</i>` : `Select a plan to choose payment method:`),
    { reply_markup: inlineKb }
  );
}

export function setupPaymentHandlers(bot: Bot<MyContext>) {
  // Callback: select_plan:PLUS, PRO, or BOSS
  bot.callbackQuery(/^select_plan:(PLUS|PRO|BOSS)$/, async (ctx) => {
    const tier = ctx.match[1] as 'PLUS' | 'PRO' | 'BOSS';
    await renderPlanSelection(ctx, tier);
  });

  // Callback: show_plans (overview)
  bot.callbackQuery('show_plans', async (ctx) => {
    await renderPlansOverview(ctx);
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
          if (profile.plan === tier) {
            await ctx.answerCallbackQuery({
              text: `You already have an active ${profile.plan} plan. You cannot purchase the same tier again while it is active.`,
              show_alert: true,
            });
            return;
          }
          if (isDowngrade(profile.plan, tier)) {
            await ctx.answerCallbackQuery({
              text: `You have an active ${profile.plan} plan. Downgrading to ${tier} is not supported while your current subscription is active.`,
              show_alert: true,
            });
            return;
          }
        }

        const pendingRequest = await prisma.manualPaymentRequest.findFirst({
          where: { telegramId, status: 'PENDING' },
          orderBy: { createdAt: 'desc' },
        });

        if (pendingRequest) {
          const orderNum = pendingRequest.orderNumber || `A${pendingRequest.id.slice(0, 4)}`;
          await ctx.answerCallbackQuery({
            text: `⏳ You have a pending request for ${pendingRequest.plan} Plan (Order #${orderNum}) awaiting review. You cannot purchase a plan until your current request is approved, rejected, or cancelled.`,
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
      logger.error('Failed to send Stars invoice', {
        service: 'bot',
        event: 'stars_invoice_send_failed',
        tier,
      }, err);
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
      if (profile.plan === tier) {
        await ctx.answerCallbackQuery({
          text: `You already have an active ${profile.plan} plan. You cannot purchase the same tier again while it is active.`,
          show_alert: true,
        });
        return;
      }
      if (isDowngrade(profile.plan, tier)) {
        await ctx.answerCallbackQuery({
          text: `You have an active ${profile.plan} plan. Downgrading to ${tier} is not supported while your current subscription is active.`,
          show_alert: true,
        });
        return;
      }
    }

    const pendingRequest = await prisma.manualPaymentRequest.findFirst({
      where: { telegramId, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    });

    if (pendingRequest) {
      const orderNum = pendingRequest.orderNumber || `A${pendingRequest.id.slice(0, 4)}`;
      await ctx.answerCallbackQuery({
        text: `⏳ You already have a pending payment request for ${pendingRequest.plan} Plan (Order #${orderNum}) awaiting review. Please wait for approval/rejection or cancel it before sending another.`,
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
        `You are subscribing to the <b>${escapeHtml(tier)} Plan</b>.\n\n` +
        `💵 <b>Amount Due</b>: <b>${formattedAmount} UZS</b>\n` +
        `💳 <b>Card Requisites</b>:\n<code>${escapeHtml(cardDetails)}</code>\n\n` +
        `📌 <b>Instructions</b>:\n` +
        `${escapeHtml(instructions)}\n` +
        `Support: ${escapeHtml(adminUsername)}\n\n` +
        `<i>Send your receipt (photo or PDF) right here in this chat to submit your request for verification.</i>`,
      { parse_mode: 'HTML', reply_markup: inlineKb }
    );
  });

  // Callback: cancel_manual_pay:<id> (F1 Fix: IDOR & Status Precondition Protection)
  bot.callbackQuery(/^cancel_manual_pay:(.+)$/, async (ctx) => {
    const requestId = ctx.match[1];
    const telegramId = BigInt(ctx.from.id);
    try {
      const updated = await prisma.manualPaymentRequest.updateMany({
        where: {
          id: requestId,
          telegramId,
          status: 'PENDING',
        },
        data: { status: 'REJECTED', adminNote: 'Cancelled by user' },
      });

      if (updated.count === 0) {
        await ctx.answerCallbackQuery({ text: 'Unable to cancel this request.', show_alert: true });
        return;
      }

      await ctx.answerCallbackQuery({ text: 'Payment request cancelled.' });
      await editMessageOrCaption(ctx, '❌ Your manual payment request has been cancelled.');
    } catch {
      await ctx.answerCallbackQuery({ text: 'Unable to cancel this request.', show_alert: true });
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
        await ctx.answerPreCheckoutQuery(false, { error_message: 'Invalid currency. Only Telegram Stars are supported.' });
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

      const profile = getPaidUserProfile(user);
      if (profile.isActivePaid && isDowngrade(profile.plan, tier)) {
        await ctx.answerPreCheckoutQuery(false, { error_message: 'This saved invoice is below your active plan. Please create a new invoice.' });
        return;
      }
      await ctx.answerPreCheckoutQuery(true);
    } catch (err) {
      logger.error('Pre-checkout query error', {
        service: 'bot',
        event: 'pre_checkout_query_failed',
      }, err);
      await ctx.answerPreCheckoutQuery(false, { error_message: 'Checkout validation failed.' });
    }
  });

  // successful_payment Webhook
  bot.on('message:successful_payment', async (ctx) => {
    const payment = ctx.message?.successful_payment;
    if (!payment) return;

    const payload = payment.invoice_payload;
    if (!payload || !payload.startsWith('plan_purchase:')) {
      logger.error('Invalid or missing invoice payload structure', {
        service: 'bot',
        event: 'invalid_invoice_payload',
        payload,
      });
      return;
    }

    if (payment.currency !== 'XTR') {
      logger.error('Non-XTR payment received in successful_payment', {
        service: 'bot',
        event: 'invalid_currency_received',
        currency: payment.currency,
      });
      return;
    }

    const parts = payload.split(':');
    const tier = parts[1] as 'PLUS' | 'PRO' | 'BOSS';
    const invoiceBuyerId = parts[2];
    const orderNumber = parts[3] || 'A0';
    const telegramId = BigInt(ctx.from?.id || 0);

    if (tier !== 'PLUS' && tier !== 'PRO' && tier !== 'BOSS') {
      logger.error('Unsupported subscription tier in payload', {
        service: 'bot',
        event: 'unsupported_tier_in_payload',
        tier,
      });
      return;
    }

    if (String(ctx.from?.id) !== invoiceBuyerId) {
      logger.error('Buyer ID mismatch in successful_payment', {
        service: 'bot',
        event: 'buyer_id_mismatch',
        actual: ctx.from?.id,
        invoiceBuyerId,
      });
      return;
    }

    const plans = getPlansConfig();
    const config = plans[tier];

    if (payment.total_amount !== config.starsPrice) {
      logger.error('Payment amount mismatch', {
        service: 'bot',
        event: 'payment_amount_mismatch',
        received: payment.total_amount,
        expected: config.starsPrice,
      });
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

        let user = await tx.user.findUnique({ where: { telegramId } });
        if (!user) {
          return { status: 'user_not_found' as const, user: null };
        }
        await lockRow(tx, 'User', user.id);
        user = await tx.user.findUnique({ where: { telegramId } });
        if (!user) return { status: 'user_not_found' as const, user: null };
        if (await tx.starsTransaction.findUnique({ where: { telegramPaymentId: payment.telegram_payment_charge_id } })) {
          return { status: 'duplicate' as const, user: null };
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

        const profile = getPaidUserProfile(user);
        if (profile.isActivePaid && isDowngrade(profile.plan, tier)) {
          const purchase = await tx.starsTransaction.create({ data: {
            orderNumber, userId: user.id, telegramPaymentId: payment.telegram_payment_charge_id,
            starsAmount: payment.total_amount, planTier: tier, status: 'REFUND_PROCESSING', entitlementApplied: false,
            refundRequestedAt: new Date(), refundAdminId: 'SYSTEM', refundReason: 'Saved invoice is below the active subscription',
          } });
          return { status: 'incompatible' as const, user, transactionId: purchase.id };
        }
        const targetTier = tier;
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
        logger.info('Duplicate payment webhook safely acknowledged', {
          service: 'bot',
          event: 'duplicate_payment_acknowledged',
          chargeId: payment.telegram_payment_charge_id,
        });
        return;
      }

      if (result.status === 'incompatible') {
        try {
          await completeStarsRefund(result.transactionId, bot.api);
          await ctx.reply('This saved invoice is below your active plan. Your payment has been refunded and your current plan is unchanged.');
        } catch (error) {
          logger.warn('Stale invoice refund requires reconciliation', { service: 'payments', transactionId: result.transactionId }, error);
          await ctx.reply(`Your current plan is unchanged. Refund confirmation is pending; contact support with Payment ID: ${payment.telegram_payment_charge_id}`);
        }
        return;
      }
      if (result.status === 'suspended') {
        await ctx.reply(
          `⚠️ <b>Payment received</b>, but your account is currently suspended.\n` +
            `Please submit an /appeal to our moderation team with Payment ID: <code>${escapeHtml(payment.telegram_payment_charge_id)}</code>`,
          { parse_mode: 'HTML' }
        );
        return;
      }

      if (result.status === 'success' && result.user) {
        await ctx.reply(
          `🎉 <b>Payment Successful!</b>\n\n` +
            `Your subscription has been upgraded to <b>${escapeHtml(result.user.plan)} Plan</b> (Order #${escapeHtml(orderNumber)}).\n` +
            `• Max Call Duration: ${config.maxDuration >= 999 ? 'Unlimited' : `${config.maxDuration} minutes`}\n` +
            `• Monthly Calls: ${config.dailyLimit >= 999 ? 'Unlimited' : `${config.dailyLimit} calls/month`}\n` +
            `• Recording Storage: ${config.retentionDays} days\n\n` +
            `Thank you for supporting PairTalk!`,
          { parse_mode: 'HTML' }
        );
      } else {
        logger.error('User not found after successful payment', {
          service: 'bot',
          event: 'user_not_found_post_payment',
          telegramId: telegramId.toString(),
        });
        await ctx.reply(
          `⚠️ Payment received, but we could not locate your user profile.\n` +
            `Please contact support with your payment ID: <code>${escapeHtml(payment.telegram_payment_charge_id)}</code>`,
          { parse_mode: 'HTML' }
        );
      }
    } catch (err) {
      logger.error('Error handling successful_payment', {
        service: 'bot',
        event: 'successful_payment_handler_error',
      }, err);
      await ctx.reply(`Payment received! Subscription processing complete.`);
    }
  });

  // /paysupport Command
  if (typeof (bot as { command?: unknown }).command === 'function') {
    bot.command('paysupport', async (ctx) => {
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
        amountStr: `⭐ ${tx.starsAmount} Stars`,
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
      combined.slice(0, 5).forEach((tx) => {
        const dateStr = tx.createdAt.toISOString().slice(0, 16).replace('T', ' ');
        const statusIcon = tx.status === 'APPROVED' || tx.status === 'SUCCESS' ? '✅' : tx.status === 'PENDING' ? '⏳' : '❌';
        const orderPrefix = tx.orderNumber ? `[#${escapeHtml(tx.orderNumber)}] ` : '';
        historyText += `• ${escapeHtml(tx.amountStr)} — <b>${escapeHtml(tx.plan)}</b>: ${statusIcon} <code>${escapeHtml(tx.status)}</code> (${orderPrefix}${dateStr})\n`;
      });
    }

    const adminContact = env.MANUAL_PAYMENT_ADMIN_USERNAME ? `@${env.MANUAL_PAYMENT_ADMIN_USERNAME.replace(/^@/, '')}` : '@PairTalkSupport';
    const policyUrl = env.PRIVACY_POLICY_URL || `${env.MINI_APP_URL}/privacy`;
    const inlineKb = new InlineKeyboard()
      .text('💸 Request Refund', 'request_refund')
      .row()
      .webApp('📜 View Refund Policy', policyUrl)
      .row()
      .text('⭐ View Plans & Pricing', 'show_plans');

    await ctx.reply(
      `🛡️ <b>Payment & Billing Support</b>\n\n` +
        `${historyText}\n` +
        `🛡️ <b>100% Refund Eligibility Policy</b>:\n` +
        `• <b>Eligibility Criteria</b>: A full refund is eligible if requested within <b>48 hours (2 days)</b> of purchase <b>AND</b> if less than <b>10% of monthly call allowance</b> has been used (0 calls on PLUS, ≤ 2 calls on PRO, ≤ 4 calls on BOSS).\n` +
        `• <b>Telegram Stars</b>: Instant automatic refund executed via <code>/refund</code> in the bot.\n` +
        `• <b>Card Payments (UZS)</b>: Verified card refunds are submitted via <code>/refund</code> and processed to your card in 1–3 business days.\n` +
        `• <b>Entitlement Reversion</b>: Processing a refund automatically reverts account limits to the Free tier.\n\n` +
        `For billing inquiries, receipt verification, or manual support: ${escapeHtml(adminContact)}`,
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

      // If user ALREADY submitted a receipt for a pending request:
      if (pendingRequest && pendingRequest.paymentProof) {
        ctx.session.pendingPaymentPlan = undefined;
        ctx.session.step = 'idle';

        const orderNum = pendingRequest.orderNumber || `A${pendingRequest.id.slice(0, 4)}`;
        const inlineKb = new InlineKeyboard().text('✖️ Cancel Current Request', `cancel_manual_pay:${pendingRequest.id}`);
        await ctx.reply(
          `⏳ <b>Payment Request Already Under Review</b>\n\n` +
            `You already have a pending request for the <b>${escapeHtml(pendingRequest.plan)} Plan</b> (Order #<code>${escapeHtml(orderNum)}</code>) submitted for administrator verification.\n\n` +
            `You can only have <b>one active payment request</b> at a time. Please wait for approval or rejection before submitting another.\n\n` +
            `<i>If you made a mistake and want to submit a new receipt, cancel your current request below:</i>`,
          { parse_mode: 'HTML', reply_markup: inlineKb }
        );
        return;
      }

      const user = await prisma.user.findUnique({ where: { telegramId } });
      if (!user) {
        return next();
      }

      const planTier = pendingPlan || pendingRequest?.plan || 'PLUS';
      const plans = getPlansConfig();
      const config = plans[planTier as keyof typeof plans] || plans.PLUS;
      let orderNumber = pendingRequest?.orderNumber;

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
        fileName = `receipt_${orderNumber || 'pending'}.jpg`;
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

      logger.info('Payment receipt received', {
        service: 'bot',
        event: 'receipt_received',
        orderNumber: orderNumber || 'pending',
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
        logger.info('Payment receipt rejected', {
          service: 'bot',
          event: 'receipt_rejected',
          orderNumber: orderNumber || 'pending',
          category: validation.category,
          reason: validation.reason,
        });

        await ctx.reply(validation.userMessage, { parse_mode: 'HTML' });
        return;
      }

      logger.info('Payment receipt validated', {
        service: 'bot',
        event: 'receipt_validated',
        orderNumber: orderNumber || 'pending',
        category: validation.category,
        fileId,
        fileUniqueId,
        mimeType: validation.mimeType,
        fileName: validation.fileName,
      });

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
        } else {
          ctx.session.pendingPaymentPlan = undefined;
          ctx.session.step = 'idle';
          logger.warn('Manual payment request rejected', {
            service: 'bot',
            event: 'manual_payment_rejected',
            userId: user.id,
            error: res.error,
          });
          await ctx.reply(
            `⚠️ <b>Unable to Process Payment Request</b>\n\n` +
              `${escapeHtml(res.error?.message || 'Failed to submit payment request.')}`,
            { parse_mode: 'HTML' }
          );
          return;
        }
      }

      const authoritativeRequest = pendingRequest;
      if (!authoritativeRequest || !authoritativeRequest.orderNumber) {
        ctx.session.pendingPaymentPlan = undefined;
        ctx.session.step = 'idle';
        await ctx.reply(`⚠️ <b>Unable to Process Receipt</b>\n\nFailed to create payment record in database.`, { parse_mode: 'HTML' });
        return;
      }

      orderNumber = authoritativeRequest.orderNumber;

      const receiptFileName = validation.category === 'PHOTO'
        ? `receipt_${orderNumber}.jpg`
        : (validation.fileName || `receipt_${orderNumber}.pdf`);

      const proofMeta = {
        fileId,
        fileUniqueId,
        fileName: receiptFileName,
        mimeType: validation.mimeType,
        fileSize: validation.fileSize,
        messageId: ctx.message?.message_id,
        telegramId: ctx.from.id,
        orderNumber,
        uploadedAt: new Date().toISOString(),
      };

      await prisma.manualPaymentRequest.update({
        where: { id: authoritativeRequest.id },
        data: { paymentProof: JSON.stringify(proofMeta), orderNumber },
      });

      ctx.session.pendingPaymentPlan = undefined;
      ctx.session.step = 'idle';

      logger.info('Payment receipt attached', {
        service: 'bot',
        event: 'receipt_attached',
        orderNumber,
        requestId: pendingRequest?.id,
      });

      await ctx.reply(
        `✅ <b>Payment Receipt Received!</b>\n\n` +
          `Your receipt (<b>${escapeHtml(receiptFileName)}</b>) has been submitted for Order #<b>${escapeHtml(orderNumber)}</b>.\n` +
          `Our administration team will verify your payment and activate your <b>${escapeHtml(planTier)} Plan</b> subscription shortly.\n\n` +
          `Thank you for practicing with us!`,
        { parse_mode: 'HTML' }
      );

      // P0-B: Download file bytes via Main Bot so Bot B can upload raw bytes (InputFile) to admin
      logger.info('Admin payment notification started', {
        service: 'bot',
        event: 'admin_payment_notification_started',
        orderNumber,
      });
      try {
        const downloadedReceipt = await downloadTelegramReceiptFile(ctx.api, fileId);

        await sendAdminPaymentNotification({ api: ctx.api } as unknown as Bot, {
          orderNumber,
          userAlias: user.alias,
          telegramId: user.telegramId,
          plan: planTier,
          uzsAmount: config.uzsPrice,
          paymentMethod: 'MANUAL_UZS',
          receiptBuffer: downloadedReceipt?.buffer || null,
          receiptFileName: receiptFileName,
          receiptMimeType: validation.mimeType,
          createdAt: pendingRequest?.createdAt || new Date(),
          status: 'PENDING',
        });

        logger.info('Admin payment notification sent', {
          service: 'bot',
          event: 'admin_payment_notification_sent',
          orderNumber,
        });
      } catch (notifyErr) {
        logger.error('Admin payment notification failed', {
          service: 'bot',
          event: 'admin_payment_notification_failed',
          orderNumber,
        }, notifyErr);
      }
    } catch (err) {
      logger.error('Error handling receipt message', {
        service: 'bot',
        event: 'receipt_message_handler_error',
      }, err);
      return next();
    }
  });
}
