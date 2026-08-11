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
      await ctx.replyWithInvoice(
        `IELTS P2P ${tier} Plan Subscription`,
        `Upgrade to ${tier} Plan (${planConfig.maxDuration}m call limit, ${planConfig.dailyLimit} calls/day, ${planConfig.retentionDays}d recording storage).`,
        `plan_purchase:${tier}:${ctx.from.id}:${Date.now()}`,
        'XTR', // Currency for Telegram Stars
        [{ label: `${tier} Plan Subscription`, amount: planConfig.starsPrice }]
      );
    } catch (err) {
      console.error('[Payments] Failed to send Stars invoice:', err);
      await ctx.reply(`Could not initiate Stars invoice: ${(err as Error).message}`);
    }
  });

  // pre_checkout_query Webhook (< 10 seconds answer requirement)
  bot.on('pre_checkout_query', async (ctx) => {
    try {
      const payload = ctx.preCheckoutQuery.invoice_payload;
      if (!payload || !payload.startsWith('plan_purchase:')) {
        await ctx.answerPreCheckoutQuery(false, { error_message: 'Invalid invoice payload format.' });
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
    const payment = ctx.message.successful_payment;
    const payload = payment.invoice_payload;
    const parts = payload.split(':');
    const tier = (parts[1] || 'PLUS') as 'PLUS' | 'PRO';
    const telegramId = BigInt(ctx.from.id);

    const plans = getPlansConfig();
    const config = plans[tier];

    try {
      // Find user in DB
      const user = await prisma.user.findUnique({ where: { telegramId } });
      if (user) {
        // Update User Plan
        await prisma.user.update({
          where: { id: user.id },
          data: {
            plan: tier,
            maxDuration: config.maxDuration,
            dailyLimit: config.dailyLimit,
          },
        });

        // Insert Stars Transaction Record (idempotent)
        try {
          await prisma.starsTransaction.create({
            data: {
              userId: user.id,
              telegramPaymentId: payment.telegram_payment_charge_id,
              starsAmount: payment.total_amount,
              planTier: tier,
            },
          });
        } catch (txErr) {
          console.warn('[Payments] Transaction already recorded or duplicate payload:', txErr);
        }
      }

      await ctx.reply(
        `🎉 *Payment Successful!*\n\n` +
          `Your subscription has been upgraded to *${tier} Plan*.\n` +
          `• Max Call Duration: ${config.maxDuration} minutes\n` +
          `• Daily Limit: ${config.dailyLimit === 9999 ? 'Unlimited' : config.dailyLimit} calls/day\n` +
          `• Recording Storage: ${config.retentionDays} days\n\n` +
          `Thank you for supporting IELTS Speaking P2P!`,
        { parse_mode: 'Markdown' }
      );
    } catch (err) {
      console.error('[Payments] Error handling successful_payment:', err);
      await ctx.reply(`Payment received! Upgrade status updated.`);
    }
  });
}
