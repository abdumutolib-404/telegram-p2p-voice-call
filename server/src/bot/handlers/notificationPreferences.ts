import { Bot, InlineKeyboard } from 'grammy';
import type { MyContext } from '../types';
import { env } from '../../config/env';
import { prisma } from '../../config/database';
import { stopOptionalNotifications, saveNotificationPreferences } from '../../services/optionalNotifications';
import { userNotificationPreferences } from '../../services/notificationPolicy';

export function setupNotificationPreferenceHandlers(bot:Bot<MyContext>) {
  const settings=new URL(env.MINI_APP_URL);settings.searchParams.set('view','account');
  const keyboard=()=>new InlineKeyboard().webApp('Notification settings',settings.toString()).row().text('Stop optional reminders','notifications_stop');
  bot.command('notifications',async ctx=>{
    await ctx.reply('Choose the reminders you want in Account → Your reminders. Optional reminders start off. Quiet hours default to 22:00–08:00 Asia/Tashkent. Payment receipts and necessary account notices are separate.',{reply_markup:keyboard()});
  });
  bot.command('stop_notifications',async ctx=>{
    if(ctx.from)await stopOptionalNotifications(BigInt(ctx.from.id));
    await ctx.reply('Optional reminders are off. Payment receipts and necessary account notices remain available.',{reply_markup:keyboard()});
  });
  bot.callbackQuery('notifications_stop',async ctx=>{
    await stopOptionalNotifications(BigInt(ctx.from.id));
    await ctx.answerCallbackQuery({text:'Optional reminders are off.'});
  });
  bot.callbackQuery('mute_surge_alerts',async ctx=>{
    const user=await prisma.user.findUnique({where:{telegramId:BigInt(ctx.from.id)}});
    if(user)await saveNotificationPreferences(user.id,{...userNotificationPreferences(user),peak:false});
    await ctx.answerCallbackQuery({text:'Peak-activity reminders are off.'});
  });
}
