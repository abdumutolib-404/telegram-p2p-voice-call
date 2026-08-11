import { Bot, InlineKeyboard, Keyboard } from 'grammy';
import { MyContext } from '../types';
import { prisma } from '../../config/database';
import { env } from '../../config/env';

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
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  return `P2P-Partner-${randomNum}`;
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
        `👋 *Welcome back, ${user.alias}!*\n\n` +
          `📊 *Your IELTS Band*: ${user.band.toFixed(1)}\n` +
          `• Fluency (FC): ${user.subFC.toFixed(1)}\n` +
          `• Lexical Resource (LR): ${user.subLR.toFixed(1)}\n` +
          `• Grammar (GRA): ${user.subGRA.toFixed(1)}\n` +
          `• Pronunciation (P): ${user.subP.toFixed(1)}\n` +
          `⭐ *Plan*: ${user.plan}\n\n` +
          `Choose an option from the menu below to start practicing:`,
        { parse_mode: 'Markdown', reply_markup: keyboard }
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
      `🎯 *Welcome to IELTS Speaking P2P Partner Match!*\n\n` +
        `Let's evaluate your sub-scores to pair you with complementary partners.\n\n` +
        `*Step 1/4: Select your Fluency & Coherence (FC) score:*`,
      { parse_mode: 'Markdown', reply_markup: inlineKb }
    );
  });
}
