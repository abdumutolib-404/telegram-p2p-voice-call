import { Bot } from 'grammy';
import { MyContext } from '../types';
import { prisma } from '../../config/database';
import { getPlansConfig } from '../../services/plan';

export function setupPaymentHandlers(bot: Bot<MyContext>) {
  // Callback: buy_plan:PLUS or buy_plan:PRO
  bot.callbackQuery(/^buy_plan:(PLUS|PRO)$/, async (ctx) => {
    const tier = ctx.match[1] as 'PLUS' | 'PRO';
    const plans = getPlansConfig();
    const planConfig = plans[tier];

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
      // Atomic transaction: verify duplicate charge ID, validate user eligibility & plan transition, and update state atomically
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
            },
          });
          return { status: 'suspended' as const, user };
        }

        // Prevent accidental downgrade if already PRO and purchasing PLUS
        const finalTier = user.plan === 'PRO' && tier === 'PLUS' ? 'PRO' : tier;
        const finalConfig = plans[finalTier];

        const updatedUser = await tx.user.update({
          where: { id: user.id },
          data: {
            plan: finalTier,
            maxDuration: finalConfig.maxDuration,
            dailyLimit: finalConfig.dailyLimit,
          },
        });

        await tx.starsTransaction.create({
          data: {
            userId: user.id,
            telegramPaymentId: payment.telegram_payment_charge_id,
            starsAmount: payment.total_amount,
            planTier: tier,
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
            `Please contact support with your payment ID: \`${payment.telegram_payment_charge_id}\`\n\n` +
            `Try typing /start first, then contact an admin.`,
          { parse_mode: 'Markdown' }
        );
      }
    } catch (err) {
      console.error('[Payments] Error handling successful_payment:', err);
      await ctx.reply(`Payment received! However, an error occurred during upgrade. Please contact support.`);
    }
  });
}
