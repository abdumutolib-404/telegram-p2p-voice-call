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

/** Called only after the dashboard has checked participant, recorder and retention access. */
export async function sendLegacyRecording(bot: Bot<MyContext>, telegramId: bigint, objectKey: string): Promise<void> {
  const file = await recordingBuffer(objectKey);
  if (!file.size || file.size > 50 * 1024 * 1024) throw new Error('Recording is unavailable for Telegram delivery.');
  await bot.api.sendAudio(telegramId.toString(), new InputFile(file.buffer, 'PairTalk-recording.mp3'), {
    caption: 'Your PairTalk practice recording. Download it to keep your own copy.',
  });
}

export async function recoverRecordingDeliveries(bot: Bot<MyContext>, stopped: () => boolean = () => false): Promise<void> {
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
  const ready = await prisma.recordingSegment.findMany({where:{status:'READY',expiresAt:{gt:new Date()},deliveries:{none:{}}},take:20,orderBy:{createdAt:'asc'}});
  for (const segment of ready) await prisma.$transaction(async tx => {
    for (const userId of segment.ownerIds) await tx.recordingDelivery.upsert({where:{segmentId_userId:{segmentId:segment.id,userId}},create:{segmentId:segment.id,userId},update:{}});
  });
  const now = new Date();
  const eligible = {OR:[{status:'QUEUED',nextAttemptAt:{lte:now}},{status:'PROCESSING',leaseUntil:{lte:now}}]};
  const jobs = await prisma.recordingDelivery.findMany({where:eligible,take:5,orderBy:{nextAttemptAt:'asc'}});
  for (const job of jobs) {
    if (stopped()) return;
    const owner = crypto.randomUUID();
    const claim = await prisma.recordingDelivery.updateMany({where:{...eligible,segmentId:job.segmentId,userId:job.userId},data:{status:'PROCESSING',owner,leaseUntil:new Date(Date.now()+120000),attempts:{increment:1}}});
    if (claim.count!==1) continue;
    const key = {segmentId:job.segmentId,userId:job.userId,status:'PROCESSING',owner};
    try {
      const [segment,user] = await Promise.all([prisma.recordingSegment.findUnique({where:{id:job.segmentId}}),prisma.user.findUnique({where:{id:job.userId}})]);
      if (!segment || !user || segment.status!=='READY' || !segment.ownerIds.includes(user.id) || !segment.expiresAt || segment.expiresAt<=new Date()) {
        await prisma.recordingDelivery.updateMany({where:key,data:{status:'EXPIRED',owner:null,leaseUntil:null}}); continue;
      }
      const call = await prisma.callSession.findUnique({where:{id:segment.callId}});
      if (!call || !['COMPLETED','CANCELLED'].includes(call.status) || Date.now()-(call.endedAt??call.createdAt).getTime()>=getEffectiveEntitlement(user).retentionDays*86400000) {
        await prisma.recordingDelivery.updateMany({where:key,data:{status:'EXPIRED',owner:null,leaseUntil:null}});continue;
      }
      const file = await recordingBuffer(segment.objectKey);
      if (!file.size) throw new Error('Audio is not available yet.');
      if (stopped()) throw new Error('Worker is stopping.');
      const sent = await bot.api.sendAudio(user.telegramId.toString(),new InputFile(file.buffer,'PairTalk-recording.mp3'),{caption:'Your PairTalk practice recording. Download it to keep your own copy.'});
      await prisma.recordingDelivery.updateMany({where:key,data:{status:'DONE',telegramMessageId:sent.message_id,owner:null,leaseUntil:null,failure:null}});
    } catch {
      await prisma.recordingDelivery.updateMany({where:key,data:{status:'QUEUED',owner:null,leaseUntil:null,nextAttemptAt:new Date(Date.now()+Math.min(900000,5000*2**Math.min(job.attempts,8))),failure:'Audio delivery unavailable; retry scheduled.'}});
    }
  }
}
