import { Bot, InlineKeyboard, Keyboard } from 'grammy';
import crypto from 'node:crypto';
import { MyContext } from '../types';
import { prisma } from '../../config/database';
import { env } from '../../config/env';
import { getPaidUserProfile } from '../../services/plan';

export const getMainMenuKeyboard = () => {
  return new Keyboard()
    .webApp('📞 Find Partner', env.MINI_APP_URL)
    .text('👤 Profile')
    .row()
    .text('📁 Recordings')
    .text('⭐ Plans')
    .row()
    .text('📞 Direct Call')
    .text('💬 Support')
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
    const telegramId = BigInt(ctx.from?.id || 0);
    if (!telegramId) return;

    let user = await prisma.user.findUnique({
      where: { telegramId },
    });

    if (user && user.onboarded) {
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
    for (let s = 4.0; s <= 9.0; s += 0.5) {
      inlineKb.text(s.toFixed(1), `set_sub_fc:${s}`);
      if (s === 6.0 || s === 8.0) inlineKb.row();
    }

    await ctx.reply(
      `🎯 <b>Welcome to IELTS Speaking P2P Partner Match!</b>\n\n` +
        `Let's evaluate your sub-scores to pair you with complementary partners.\n\n` +
        `<b>Step 1/4: Select your Fluency & Coherence (FC) score:</b>`,
      { parse_mode: 'HTML', reply_markup: inlineKb }
    );
  });
}
