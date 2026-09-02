import { Bot, InlineKeyboard, Keyboard } from 'grammy';
import crypto from 'node:crypto';
import { MyContext } from '../types';
import { prisma } from '../../config/database';
import { env } from '../../config/env';
import { getPaidUserProfile } from '../../services/plan';
import { bindReferral } from '../../services/referralService';
import { renderPlanSelection, renderPlansOverview } from '../handlers/payments';
import { handleRefundRequest } from '../handlers/refund';

export const getMainMenuKeyboard = () => {
  return new Keyboard()
    .webApp('📞 Find Partner', env.MINI_APP_URL)
    .text('👤 Profile')
    .row()
    .text('👥 Invite Friends')
    .text('🏆 Hall of Fame')
    .row()
    .text('📁 Recordings')
    .text('⭐ Plans')
    .row()
    .text('📞 Direct Call')
    .text('💬 Support')
    .row()
    .text('🔐 Privacy Policy')
    .text('📜 Community Guidelines')
    .resized();
};

export function calculateOverallBand(fc: number, lr: number, gra: number, p: number): number {
  const avg = (fc + lr + gra + p) / 4;
  return Math.round(avg * 2) / 2;
}

export function generateUniqueAlias(): string {
  const hex = crypto.randomBytes(4).toString('hex');
  return `P2P-${hex.toUpperCase()}`;
}

export function setupStartCommand(bot: Bot<MyContext>) {
  bot.command('start', async (ctx) => {
    const fromId = ctx.from?.id;
    if (!fromId) return;
    const telegramId = BigInt(fromId);

    // Always reset any in-progress form/session state on /start
    ctx.session.step = 'idle';
    ctx.session.pendingPaymentPlan = undefined;
    ctx.session.pendingRefundManualReqId = undefined;

    const startPayload = typeof ctx.match === 'string' ? ctx.match.trim() : '';
    if (startPayload.startsWith('ref_')) {
      const guestName = ctx.from?.first_name || (ctx.from?.username ? `@${ctx.from.username}` : undefined);
      await bindReferral(telegramId, startPayload, bot, guestName).catch((e) => console.warn('[Start] bindReferral error:', e));
    }

    let user = await prisma.user.findUnique({
      where: { telegramId },
    });

    if (user && user.onboarded) {
      // 1. Deep Link: Plan Upgrade from Mini App (e.g. /start upgrade_plus)
      if (startPayload.startsWith('upgrade_')) {
        const tier = startPayload.replace('upgrade_', '').toUpperCase();
        if (tier === 'PLUS' || tier === 'PRO' || tier === 'BOSS') {
          await renderPlanSelection(ctx, tier as 'PLUS' | 'PRO' | 'BOSS');
          return;
        }
      }

      // 2. Deep Link: Direct Refund Request (e.g. /start refund)
      if (startPayload === 'refund') {
        await handleRefundRequest(ctx);
        return;
      }

      // 3. Deep Link: Plans Matrix Overview (e.g. /start plans)
      if (startPayload === 'plans') {
        await renderPlansOverview(ctx);
        return;
      }

      const keyboard = getMainMenuKeyboard();
      await ctx.reply(
        `👋 <b>Welcome to PairTalk!</b>\n\n` +
          `🎙️ Practice English by talking to real learners.\n` +
          `🤝 Find a speaking partner and start a voice call.\n` +
          `⭐ Improve your fluency through regular conversations.\n\n` +
          `Choose an option below to get started:`,
        { parse_mode: 'HTML', reply_markup: keyboard }
      );
      return;
    }

    // Start Onboarding Step 1: FC
    ctx.session.step = 'fc';
    const inlineKb = new InlineKeyboard();
    for (const s of [5, 6, 7, 8, 9]) {
      inlineKb.text(String(s), `set_sub_fc:${s}`);
    }

    await ctx.reply(
      `🎯 <b>Welcome to PairTalk Speaking Partner Match!</b>\n\n` +
        `Let's evaluate your sub-scores to pair you with complementary partners.\n\n` +
        `<b>Step 1/4: Select your Fluency & Coherence (FC) score:</b>`,
      { parse_mode: 'HTML', reply_markup: inlineKb }
    );
  });
}
