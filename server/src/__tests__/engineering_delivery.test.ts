import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { env } from '../config/env';
import { prisma } from '../config/database';
import { recoverRecordingDeliveries } from '../services/recordingDelivery';
import { purgeExpiredRecordings } from '../services/storage';
import { EgressStatus } from 'livekit-server-sdk';

const provider=vi.hoisted(()=>({configured:true,download:vi.fn(),remove:vi.fn(),info:vi.fn()}));
vi.mock('../services/s3Storage',()=>({isS3Configured:()=>provider.configured,getS3ObjectBuffer:provider.download,deleteS3Object:provider.remove}));
vi.mock('../config/livekit',()=>({getAudioEgressInfo:provider.info}));
beforeEach(async()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-08T10:00:00Z'));
  provider.configured=true;
  vi.clearAllMocks();await prisma.recordingDelivery.deleteMany();await prisma.callSession.deleteMany();await prisma.user.deleteMany();
  provider.download.mockResolvedValue({buffer:Buffer.from('synthetic audio'),size:15});provider.remove.mockResolvedValue();provider.info.mockResolvedValue(null);
});
afterEach(()=>vi.useRealTimers());
async function fixture(age=0) {
  const a=await prisma.user.create({data:{telegramId:BigInt(crypto.randomInt(10000000,90000000)),alias:'Recorder A',plan:'FREE'}});
  const b=await prisma.user.create({data:{telegramId:BigInt(crypto.randomInt(10000000,90000000)),alias:'Recorder B',plan:'PRO'}});
  const call=await prisma.callSession.create({data:{roomName:crypto.randomUUID(),userAId:a.id,userBId:b.id,status:'COMPLETED',endedAt:new Date(Date.now()-age*86400000)}});
  const segment=await prisma.recordingSegment.create({data:{callId:call.id,objectKey:'recordings/'+call.id+'.mp3',egressId:crypto.randomUUID(),ownerIds:[a.id,b.id],status:'READY',expiresAt:new Date(Date.now()+30*86400000)}});
  return {a,b,call,segment};
}
it('delivers actual audio only to its saved owners and does not resend confirmed jobs',async()=>{
  const {a,b}=await fixture();
  const bot={api:{sendAudio:vi.fn().mockResolvedValue({message_id:42})}};
  await recoverRecordingDeliveries(bot as any);
  expect(bot.api.sendAudio).toHaveBeenCalledTimes(2);
  expect(new Set(bot.api.sendAudio.mock.calls.map(args=>args[0]))).toEqual(new Set([a.telegramId.toString(),b.telegramId.toString()]));
  expect(bot.api.sendAudio.mock.calls[0][1]).toHaveProperty('fileData');
  await recoverRecordingDeliveries(bot as any);expect(bot.api.sendAudio).toHaveBeenCalledTimes(2);
});
it('expires a retry after the recipient retention ends while keeping a longer-lived co-owner delivery',async()=>{
  const {a,b}=await fixture(2);const bot={api:{sendAudio:vi.fn().mockResolvedValue({message_id:42})}};
  await recoverRecordingDeliveries(bot as any);
  expect(bot.api.sendAudio).toHaveBeenCalledOnce();expect(bot.api.sendAudio.mock.calls[0][0]).toBe(b.telegramId.toString());
  const jobs=await prisma.recordingDelivery.findMany({where:{userId:a.id}});expect(jobs[0].status).toBe('EXPIRED');
});
it('keeps failed Telegram delivery durable, retries, and recovers a missed completion webhook',async()=>{
  const {segment}=await fixture();await prisma.recordingSegment.update({where:{id:segment.id},data:{status:'RECORDING'}});
  provider.info.mockResolvedValue({status:EgressStatus.EGRESS_COMPLETE,fileResults:[{filename:segment.objectKey,size:15}]});
  const bot={api:{sendAudio:vi.fn().mockRejectedValueOnce(new Error('Synthetic Telegram outage')).mockResolvedValue({message_id:42})}};
  await recoverRecordingDeliveries(bot as any);
  expect((await prisma.recordingSegment.findUnique({where:{id:segment.id}}))?.status).toBe('READY');
  expect(await prisma.recordingDelivery.count({where:{status:'QUEUED'}})).toBe(1);
  await vi.advanceTimersByTimeAsync(5000);await recoverRecordingDeliveries(bot as any);
  expect(await prisma.recordingDelivery.count({where:{status:'DONE'}})).toBe(2);
});
it('purges the expired latest segment while preserving an earlier longer-lived segment',async()=>{
  const {a,call,segment}=await fixture(2);
  const latest=await prisma.recordingSegment.create({data:{callId:call.id,objectKey:'recordings/latest.mp3',egressId:crypto.randomUUID(),ownerIds:[a.id],status:'READY',expiresAt:new Date(Date.now()-86400000)}});
  await prisma.callSession.update({where:{id:call.id},data:{recordingUrl:latest.objectKey,recordedByUserId:a.id,recordingKeys:[segment.objectKey,latest.objectKey],recordingExpiresAt:latest.expiresAt}});
  await purgeExpiredRecordings();
  expect(provider.remove).toHaveBeenCalledOnce();expect(provider.remove).toHaveBeenCalledWith(latest.objectKey);
  expect((await prisma.recordingSegment.findUnique({where:{id:segment.id}}))?.status).toBe('READY');
  expect((await prisma.callSession.findUnique({where:{id:call.id}}))?.recordingKeys).toContain(segment.objectKey);
});

it('sends local audio when object storage is disabled and refuses a path outside the recording root',async()=>{
  vi.useRealTimers();const base=await fs.mkdtemp(path.join(os.tmpdir(),'pairtalk-audio-test-')),previous=env.RECORDINGS_DIR;
  env.RECORDINGS_DIR=path.join(base,'recordings');provider.configured=false;await fs.mkdir(env.RECORDINGS_DIR);
  try {
    const {segment}=await fixture();await fs.writeFile(path.join(env.RECORDINGS_DIR,path.basename(segment.objectKey)),'local synthetic audio');
    const bot={api:{sendAudio:vi.fn().mockResolvedValue({message_id:42})}};await recoverRecordingDeliveries(bot as any);
    expect(bot.api.sendAudio).toHaveBeenCalledTimes(2);expect(provider.download).not.toHaveBeenCalled();
    await fs.writeFile(path.join(base,'outside.mp3'),'private fixture');
    await prisma.recordingDelivery.deleteMany();await prisma.recordingSegment.update({where:{id:segment.id},data:{objectKey:'../outside.mp3'}});bot.api.sendAudio.mockClear();
    await recoverRecordingDeliveries(bot as any);expect(bot.api.sendAudio).not.toHaveBeenCalled();expect(await prisma.recordingDelivery.count({where:{status:'QUEUED'}})).toBe(2);
  } finally {env.RECORDINGS_DIR=previous;provider.configured=true;await fs.unlink(path.join(base,'outside.mp3')).catch(()=>{});const files=await fs.readdir(path.join(base,'recordings'));for(const file of files)await fs.unlink(path.join(base,'recordings',file));await fs.rmdir(path.join(base,'recordings'));await fs.rmdir(base);}
});
