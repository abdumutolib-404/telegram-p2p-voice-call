import { reconcileRecordingCredits } from './credits';
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { Bot } from 'grammy';
import { InputFile } from 'grammy';
import type { MyContext } from '../bot/types';
import { prisma } from '../config/database';
import { getS3ObjectBuffer, isS3Configured } from './s3Storage';
import { env } from '../config/env';
import { getAudioEgressInfo } from '../config/livekit';
import { EgressStatus } from 'livekit-server-sdk';
import { getEffectiveEntitlement } from './plan';
import { recordingDeadline } from '../utils/recordingAccess';

async function recordingBuffer(key:string):Promise<{buffer:Buffer;size:number}> {
  if (isS3Configured()) return getS3ObjectBuffer(key);
  const root=await fsp.realpath(env.RECORDINGS_DIR);
  const file=await fsp.realpath(path.resolve(root,key.replace(/^recordings[\\/]/,'')));
  const relative=path.relative(root,file);
  if (!relative || path.isAbsolute(relative) || relative==='..' || relative.startsWith('..'+path.sep)) throw new Error('Invalid recording path.');
  const stream=fs.createReadStream(file,{signal:AbortSignal.timeout(15000)}),parts:Buffer[]=[];
  let size=0;
  try {
    for await (const chunk of stream) { const part=Buffer.from(chunk);size+=part.length;if(size>50*1024*1024)throw new Error('Recording exceeds Telegram audio limit.');parts.push(part); }
    return {buffer:Buffer.concat(parts),size};
  } finally { stream.destroy(); }
}

export function recordingDeliveryStatus(delivery: { status: string; leaseUntil: Date | null }): 'SENT' | 'QUEUED' | 'UNCONFIRMED' | 'FAILED' {
  if (delivery.status === 'DONE') return 'SENT';
  if (delivery.status === 'UNCONFIRMED' || (['PROCESSING', 'SENDING'].includes(delivery.status) && (!delivery.leaseUntil || delivery.leaseUntil <= new Date()))) return 'UNCONFIRMED';
  if (delivery.status === 'FAILED') return 'FAILED';
  if (['QUEUED', 'PROCESSING', 'SENDING'].includes(delivery.status)) return 'QUEUED';
  throw new Error('Recording delivery status is unavailable.');
}

export async function recoverRecordingDeliveries(bot: Bot<MyContext>, stopped: () => boolean = () => false): Promise<void> {
  // Older PROCESSING jobs may already have sent audio. Never replay an expired
  // attempt whose outcome is unknown. Retain its owner so a late receipt can settle it.
  await prisma.recordingDelivery.updateMany({where:{status:{in:['PROCESSING','SENDING']},OR:[{leaseUntil:{lte:new Date()}},{leaseUntil:null}]},data:{status:'UNCONFIRMED',leaseUntil:null,failure:'Delivery outcome is uncertain. Check Telegram before any further send.'}});
  // Polling covers a missed webhook, including earlier segments of a restarted recording.
  const captures = await prisma.recordingSegment.findMany({where:{status:'RECORDING',call:{status:{in:['COMPLETED','CANCELLED']}}},take:10});
  for (const capture of captures) {
    if (stopped()) return;
    const info = await getAudioEgressInfo(capture.egressId);
    if (info?.status === EgressStatus.EGRESS_COMPLETE && info.fileResults?.some(file => file.filename===capture.objectKey && Number(file.size)>0)) {
      await prisma.recordingSegment.updateMany({where:{id:capture.id,status:'RECORDING'},data:{status:'READY'}});
    } else if (info && [EgressStatus.EGRESS_FAILED,EgressStatus.EGRESS_ABORTED].includes(info.status)) {
      await prisma.recordingSegment.updateMany({where:{id:capture.id,status:'RECORDING'},data:{status:'FAILED'}});
    }
  }
  await reconcileRecordingCredits();
  const ready = await prisma.recordingSegment.findMany({where:{status:'READY',expiresAt:{gt:new Date()},deliveries:{none:{}}},take:20,orderBy:{createdAt:'asc'}});
  for (const segment of ready.filter(item => !item.egressId.startsWith('legacy:'))) await prisma.$transaction(async tx => {
    for (const userId of segment.ownerIds) await tx.recordingDelivery.upsert({where:{segmentId_userId:{segmentId:segment.id,userId}},create:{segmentId:segment.id,userId},update:{}});
  });
  const now = new Date();
  const eligible = {status:'QUEUED',nextAttemptAt:{lte:now}};
  const jobs = await prisma.recordingDelivery.findMany({where:eligible,take:5,orderBy:{nextAttemptAt:'asc'}});
  for (const job of jobs) {
    if (stopped()) return;
    const owner = crypto.randomUUID();
    const claim = await prisma.recordingDelivery.updateMany({where:{...eligible,segmentId:job.segmentId,userId:job.userId},data:{status:'PROCESSING',owner,leaseUntil:new Date(Date.now()+120000),attempts:{increment:1}}});
    if (claim.count!==1) continue;
    const key = {segmentId:job.segmentId,userId:job.userId,status:'PROCESSING',owner};
    let sending = false;
    let confirmedMessageId: number | undefined;
    try {
      const [segment,user] = await Promise.all([prisma.recordingSegment.findUnique({where:{id:job.segmentId}}),prisma.user.findUnique({where:{id:job.userId}})]);
      if (!segment || !user || segment.status!=='READY' || !segment.ownerIds.includes(user.id) || !segment.expiresAt || recordingDeadline(segment,user.id)<=Date.now()) {
        await prisma.recordingDelivery.updateMany({where:key,data:{status:'EXPIRED',owner:null,leaseUntil:null}}); continue;
      }
      const call = await prisma.callSession.findUnique({where:{id:segment.callId}});
      if (!call || !['COMPLETED','CANCELLED'].includes(call.status) || Date.now()-(call.endedAt??call.createdAt).getTime()>=getEffectiveEntitlement(user).retentionDays*86400000) {
        await prisma.recordingDelivery.updateMany({where:key,data:{status:'EXPIRED',owner:null,leaseUntil:null}});continue;
      }
      const file = await recordingBuffer(segment.objectKey);
      if (!file.size) throw new Error('Audio is not available yet.');
      if (stopped()) throw new Error('Worker is stopping.');
      const dispatch = await prisma.recordingDelivery.updateMany({where:key,data:{status:'SENDING',leaseUntil:new Date(Date.now()+120000)}});
      if (dispatch.count !== 1) continue;
      sending = true;
      const sent = await bot.api.sendAudio(user.telegramId.toString(),new InputFile(file.buffer,'PairTalk-recording.mp3'),{caption:'Your PairTalk practice recording. Download it to keep your own copy.'});
      if (!Number.isSafeInteger(sent.message_id) || sent.message_id <= 0) throw new Error('Delivery acknowledgement is unavailable.');
      confirmedMessageId = sent.message_id;
      await prisma.recordingDelivery.updateMany({where:{...key,status:{in:['SENDING','UNCONFIRMED']}},data:{status:'DONE',telegramMessageId:confirmedMessageId,owner:null,leaseUntil:null,failure:null}});
      // A temporary file is eligible for deletion only after every owner has a
      // confirmed receipt. Stored copies and legacy owners keep their deadlines.
      if((segment.creditOwnerIds?.length??0)===segment.ownerIds.length && (segment.storedOwnerIds?.length??0)===0){
        const deliveries=await prisma.recordingDelivery.findMany({where:{segmentId:segment.id}});
        if(segment.ownerIds.every(id=>deliveries.some(item=>item.userId===id&&item.status==='DONE')))await prisma.recordingSegment.update({where:{id:segment.id},data:{expiresAt:new Date()}});
      }
    } catch (error) {
      const response = error as { error_code?: number; parameters?: { retry_after?: number } } | null;
      const seconds = response?.parameters?.retry_after;
      const rateLimited = sending && confirmedMessageId === undefined && response?.error_code === 429 && Number.isInteger(seconds) && seconds! > 0 && seconds! <= 900 && job.attempts < 2;
      const rejected = sending && confirmedMessageId === undefined && [400,401,403,404,413,429].includes(response?.error_code ?? 0);
      const retry = !sending || rateLimited;
      const status = confirmedMessageId !== undefined ? 'DONE' : retry ? 'QUEUED' : rejected ? 'FAILED' : 'UNCONFIRMED';
      await prisma.recordingDelivery.updateMany({where:{...key,status:{in:sending?['SENDING','UNCONFIRMED']:['PROCESSING']}},data:{
        status, owner:null, leaseUntil:null,
        ...(confirmedMessageId !== undefined ? {telegramMessageId:confirmedMessageId} : {}),
        nextAttemptAt:new Date(Date.now()+(rateLimited?seconds!*1000:Math.min(900000,5000*2**Math.min(job.attempts,8)))),
        failure:status==='DONE'?null:retry?'Audio delivery unavailable; retry scheduled.':rejected?'Telegram rejected this audio delivery.':'Delivery outcome is uncertain. Check Telegram before any further send.',
      }});
    }
  }
}
