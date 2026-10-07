import { Bot, InlineKeyboard } from 'grammy';
import crypto from 'node:crypto';
import { MyContext } from '../types';
import { prisma } from '../../config/database';
import { env } from '../../config/env';
import { hasAcceptedCurrentTerms } from '../../services/terms';
import { offerTerms } from '../handlers/terms';
import { bindReferral } from '../../services/referralService';
import { renderPlanSelection, renderPlansOverview } from '../handlers/payments';
import { handleRefundRequest } from '../handlers/refund';
import { logger } from '../../utils/logger';

export const getMainMenuKeyboard = () => {
  // Inline/menu Mini Apps receive signed launch data; reply-keyboard Mini Apps do not.
  return new InlineKeyboard()
    .webApp('Open dashboard', env.MINI_APP_URL)
    .row()
    .text('Payments', 'show_plans')
    .url('Support', 'https://t.me/PairTalkSupport');
};

import { escapeHtml } from '../../utils/sanitize';

export function calculateOverallBand(fc: number, lr: number, gra: number, p: number): number {
  const avg = (fc + lr + gra + p) / 4;
  return Math.round(avg * 2) / 2;
}

export function generateUniqueAlias(): string {
  const hex = crypto.randomBytes(4).toString('hex');
  return `P2P-${hex.toUpperCase()}`;
}

export async function bindPendingReferral(ctx: MyContext, bot: Bot<MyContext>): Promise<void> {
  const payload = ctx.session.pendingReferralPayload;
  if (!payload || !ctx.from) return;
  const user = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from.id) } });
  if (!hasAcceptedCurrentTerms(user)) return;
  ctx.session.pendingReferralPayload = undefined;
  await bindReferral(BigInt(ctx.from.id), payload, bot, escapeHtml(user!.alias)).catch(error => {
    logger.warn('Referral attribution failed after consent', { service: 'bot', event: 'start_bind_referral_failed' }, error);
  });
}

export async function beginScoreRegistration(ctx: MyContext): Promise<void> {
  ctx.session.step = 'fc';
  const keyboard = new InlineKeyboard();
  for (const score of [5, 6, 7, 8, 9]) keyboard.text(String(score), `set_sub_fc:${score}`);
  await ctx.reply('Let\'s set up your speaking profile.\n\nStep 1/4: Select your Fluency & Coherence (FC) score:', { reply_markup: keyboard });
}

export function setupStartCommand(bot: Bot<MyContext>) {
  bot.command('start', async (ctx) => {
    if (ctx.chat?.type !== 'private') { await ctx.reply('Please open a private conversation with PairTalk to register.'); return; }
    const fromId = ctx.from?.id;
    if (!fromId) return;
    const telegramId = BigInt(fromId);

    // Always reset any in-progress form/session state on /start
    ctx.session.step = 'idle';
    ctx.session.pendingPaymentPlan = undefined;
    ctx.session.pendingRefundManualReqId = undefined;

    const startPayload = typeof ctx.match === 'string' ? ctx.match.trim() : '';
    if (startPayload.startsWith('ref_') && startPayload.length <= 64) ctx.session.pendingReferralPayload = startPayload;
    const user = await prisma.user.findUnique({ where: { telegramId } });
    if (hasAcceptedCurrentTerms(user)) await bindPendingReferral(ctx, bot);

    if (user && user.onboarded) {
      // Financial support remains available even when new terms await consent.
      if (startPayload === 'refund') { await handleRefundRequest(ctx); return; }
      if (!hasAcceptedCurrentTerms(user)) { await offerTerms(ctx); return; }
      // 1. Deep Link: Plan Upgrade from Mini App (e.g. /start upgrade_plus)
      if (startPayload.startsWith('upgrade_')) {
        const tier = startPayload.replace('upgrade_', '').toUpperCase();
        if (tier === 'PLUS' || tier === 'PRO' || tier === 'BOSS') {
          await renderPlanSelection(ctx, tier as 'PLUS' | 'PRO' | 'BOSS');
          return;
        }
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

    if (!hasAcceptedCurrentTerms(user)) { await offerTerms(ctx); return; }
    await beginScoreRegistration(ctx);
  });
}
