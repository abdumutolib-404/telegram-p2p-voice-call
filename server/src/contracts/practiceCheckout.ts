import type { PracticeCatalog, PracticePack } from './practicePacks';
export interface PracticeCheckoutSnapshot {
  orderId:string;requestId:string;currency:'XTR'|'UZS';
  pack:PracticePack;catalog:PracticeCatalog;discountPercent:number;
  stars:number;uzs:number;expiresAt:string;campaignId?:string;serverNow:string;
}
