import { Bot, InlineKeyboard } from 'grammy';
import { env } from '../../config/env';
import type { MyContext } from '../types';

export function dashboardKeyboard(view = 'practice', callId?: string): InlineKeyboard {
  const url = new URL(env.MINI_APP_URL);
  url.searchParams.set('view', view);
  if (callId && /^[a-f0-9-]{36}$/i.test(callId)) url.searchParams.set('call', callId);
  return new InlineKeyboard().webApp('Open dashboard', url.toString());
}
export function setupDashboardNavigation(bot: Bot<MyContext>): void {
  const open = async (ctx: MyContext) => {
    await ctx.reply('Calls, recordings, ratings, reports and account settings are now in your dashboard. Register with /start first.', { reply_markup: dashboardKeyboard() });
  };
  bot.command(['dashboard', 'profile', 'recordings', 'favorites', 'leaderboard', 'referrals'], open);
  bot.hears(['👤 Profile', '👥 Invite Friends', '👥 Referrals', '🏆 Hall of Fame', '🏆 Leaderboard', '📁 Recordings', '📞 Direct Call', '👥 Favorites', '🔐 Privacy Policy', '🔐 Privacy & Refunds', '📜 Community Guidelines', '📜 Guidelines', '📞 Find Partner'], open);
  // Messages sent by older releases remain useful without retaining two user interfaces.
  bot.callbackQuery(/^(?:toggle_dnd$|mute_surge_alerts$|view_hall_of_fame$|get_my_invite_link$|favorite_partner:|remove_favorite:|direct_call:|call_favorite:|accept_direct:|decline_direct:|cancel_direct:|rate_call:|report_partner:|play_rec[:_]|play_recording[:_])/, async ctx => {
    await ctx.answerCallbackQuery();
    const data = ctx.callbackQuery.data;
    const call = data.match(/(?:rate_call|report_partner|play_rec|play_recording|favorite_partner)[:_]([a-f0-9-]{36})/i)?.[1];
    const view = call ? 'history' : /direct|favorite/.test(data) ? 'partners' : /hall|invite/.test(data) ? 'community' : 'account';
    await ctx.reply('This action has moved to your dashboard.', { reply_markup: dashboardKeyboard(view, call) });
  });
}
