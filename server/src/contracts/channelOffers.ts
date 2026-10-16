import { isPracticeCatalog, quotePracticePack, type PracticeCatalog, type PracticePack } from './practicePacks';
export interface ChannelOffer {
  id:string;pack:PracticePack;catalog:PracticeCatalog;percent:number;
  originalStars:number;originalUzs:number;stars:number;uzs:number;
  maximumClaims:number;remaining:number;held:number;claimStatus:string|null;
  status:string;expiresAt:string;channelUrl:string;
}
export interface AdminChannelOffer extends ChannelOffer {
  messageState:string;telegramMessageId:number|null;failure:string|null;createdAt:string;
}
export function isChannelOffer(value:unknown):value is ChannelOffer {
  if(!value||typeof value!=='object')return false;
  const o=value as ChannelOffer;
  if(typeof o.id!=='string'||!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(o.id)||typeof o.percent!=='number'||o.percent<=0||!isPracticeCatalog(o.catalog)||typeof o.expiresAt!=='string'||!Number.isFinite(Date.parse(o.expiresAt))||![o.maximumClaims,o.remaining,o.held].every(n=>Number.isSafeInteger(n)&&n>=0)||o.maximumClaims<1||o.remaining>o.maximumClaims)return false;
  if(!['DRAFT','ACTIVE','SOLD_OUT','EXPIRED','DISABLED'].includes(o.status)||![null,'HELD','CLAIMED'].includes(o.claimStatus)||o.channelUrl!=='https://t.me/pairtalk')return false;
  try{const q=quotePracticePack(o.pack,o.catalog.prices,o.percent);return q.originalStars===o.originalStars&&q.originalUzs===o.originalUzs&&q.stars===o.stars&&q.uzs===o.uzs;}catch{return false;}
}
