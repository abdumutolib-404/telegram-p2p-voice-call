export type ReminderCategory='INACTIVITY'|'CHECKOUT'|'PEAK'|'CHANNEL';
export interface NotificationPreferences {
  inactivity:boolean;checkout:boolean;peak:boolean;channel:boolean;
  quietHours:boolean;quietStart:number;quietEnd:number;
}
export type ReminderContext=
  |{kind:'INACTIVITY';activityAt:string}
  |{kind:'CHECKOUT';orderId:string}
  |{kind:'PEAK';sampledAt:string;threshold:number}
  |{kind:'CHANNEL';broadcastId?:string;messageId?:number;topicRevision?:string};
export function isNotificationPreferences(value:unknown):value is NotificationPreferences {
  if(!value||typeof value!=='object')return false;
  const p=value as NotificationPreferences;
  return ['inactivity','checkout','peak','channel','quietHours'].every(key=>typeof p[key as keyof NotificationPreferences]==='boolean')&&[p.quietStart,p.quietEnd].every(n=>Number.isInteger(n)&&n>=0&&n<=23)&&(!p.quietHours||p.quietStart!==p.quietEnd);
}
export function quietUntil(preferences:Pick<NotificationPreferences,'quietHours'|'quietStart'|'quietEnd'>,now=new Date()):Date|null {
  if(!preferences.quietHours)return null;
  const local=new Date(now.getTime()+5*3600000);
  const hour=local.getUTCHours(),start=preferences.quietStart,end=preferences.quietEnd;
  const quiet=start<end?hour>=start&&hour<end:hour>=start||hour<end;
  if(!quiet)return null;
  const wake=new Date(local);
  wake.setUTCHours(end,0,0,0);
  if(wake.getTime()<=local.getTime())wake.setUTCDate(wake.getUTCDate()+1);
  return new Date(wake.getTime()-5*3600000);
}
export const optionalNotificationPreviews=[
  {category:'INACTIVITY',title:'Practice reminder',text:'Ready for another speaking session? Open PairTalk when you have time.'},
  {category:'CHECKOUT',title:'Unpaid checkout',text:'Your practice pack is waiting. Review the existing checkout before it expires.'},
  {category:'PEAK',title:'Peak activity',text:'More learners are practising now. Open PairTalk to search near your level.'},
  {category:'CHANNEL',title:'Channel announcement',text:'A new PairTalk announcement is available in @pairtalk.'},
] as const;
