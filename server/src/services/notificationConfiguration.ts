import { z } from 'zod';
import { prisma } from '../config/database';
import type { ReminderCategory } from '../contracts/notifications';
const configSchema=z.object({inactivity:z.boolean(),checkout:z.boolean(),peak:z.boolean(),channel:z.boolean()}).strict();
export type NotificationConfiguration=z.infer<typeof configSchema>;
const defaults:NotificationConfiguration={inactivity:true,checkout:true,peak:true,channel:true};
export async function readNotificationConfiguration():Promise<NotificationConfiguration> {
  const latest=await prisma.auditLog.findFirst({where:{action:'NOTIFICATION_SETTINGS',targetId:'notifications'},orderBy:[{createdAt:'desc'},{id:'desc'}]});
  return latest?.afterState?configSchema.parse(JSON.parse(latest.afterState)):defaults;
}
export const categoryEnabled=(config:NotificationConfiguration,category:ReminderCategory)=>config[category.toLowerCase() as keyof NotificationConfiguration]===true;
export async function saveNotificationConfiguration(input:unknown,adminId:string) {
  const config=configSchema.parse(input);
  await prisma.$transaction(async tx=>{
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(736251014)::text`;
    const previous=await tx.auditLog.findFirst({where:{action:'NOTIFICATION_SETTINGS',targetId:'notifications'},orderBy:[{createdAt:'desc'},{id:'desc'}]});
    await tx.auditLog.create({data:{action:'NOTIFICATION_SETTINGS',targetId:'notifications',adminId,beforeState:previous?.afterState??JSON.stringify(defaults),afterState:JSON.stringify(config),reason:'Admin updated optional notification categories'}});
  });
  return config;
}
