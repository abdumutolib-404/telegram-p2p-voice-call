import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import crypto from 'node:crypto';
import { prisma } from '../config/database';
import { changeRecordingIntent, commitRecordingStart, forgetDeletedRecordingKeys } from '../services/recordingLifecycle';
import { allowancePeriodStart, getUserRecordingsUsedThisPeriod } from '../services/plan';
import { completeCallSession } from '../services/callCompletion';

beforeEach(async()=>{await prisma.callSession.deleteMany();await prisma.user.deleteMany();});
afterEach(()=>vi.useRealTimers());
async function pair() {
 const users=await Promise.all([0,1].map(i=>prisma.user.create({data:{telegramId:BigInt(770000+i),alias:crypto.randomUUID()}})));
 const call=await prisma.callSession.create({data:{roomName:crypto.randomUUID(),userAId:users[0].id,userBId:users[1].id,mediaAuthorizedAt:new Date()}});
 return {a:users[0],b:users[1],call};
}

it('file deletion cannot restore consumed recording allowance, and a same-call resume is free',async()=>{
 const {a,call}=await pair();
 expect(await commitRecordingStart(call.id,a.id,null,{egressId:'first',relativeUrl:'recordings/first.mp3'})).toBe(true);
 expect(await getUserRecordingsUsedThisPeriod(a.id,a)).toBe(1);
 await changeRecordingIntent(call.id,a.id,false,'first');
 await forgetDeletedRecordingKeys(call.id,new Set(['recordings/first.mp3']));
 expect(await getUserRecordingsUsedThisPeriod(a.id,a)).toBe(1);
 expect(await commitRecordingStart(call.id,a.id,'first',{egressId:'second',relativeUrl:'recordings/second.mp3'})).toBe(true);
 expect(await getUserRecordingsUsedThisPeriod(a.id,a)).toBe(1);
});

it('a lost egress-start race consumes no extra credit and previous segment owners are preserved',async()=>{
 const {a,b,call}=await pair();
 await commitRecordingStart(call.id,a.id,null,{egressId:'first',relativeUrl:'recordings/first.mp3'});
 expect(await commitRecordingStart(call.id,b.id,null,{egressId:'loser',relativeUrl:'recordings/loser.mp3'})).toBe(false);
 expect(await getUserRecordingsUsedThisPeriod(b.id,b)).toBe(0);
 await changeRecordingIntent(call.id,a.id,false,'first');
 await commitRecordingStart(call.id,b.id,'first',{egressId:'second',relativeUrl:'recordings/second.mp3'});
 const segments=await prisma.recordingSegment.findMany({where:{callId:call.id},orderBy:{createdAt:'asc'}});
 expect(segments.map(s=>s.ownerIds)).toEqual([[a.id],[b.id]]);
 expect((await prisma.callSession.findUnique({where:{id:call.id}}))?.recordedByUserId).toBe(b.id);
});

it('paid allowance starts at the stored purchase time rather than the calendar month',()=>{
 const start=new Date('2026-09-20T10:00:00Z');vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-08T10:00:00Z'));
 expect(allowancePeriodStart({subscriptionStartsAt:start,subscriptionExpiresAt:new Date('2026-11-19T10:00:00Z'),subscriptionDurationDays:60})).toEqual(start);
});

it('server duration excludes setup and clamps fabricated client durations',async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-08T10:00:00Z'));
 const {a,call}=await pair();
 await prisma.callSession.update({where:{id:call.id},data:{createdAt:new Date(Date.now()-60000),mediaAuthorizedAt:new Date(Date.now()-2000)}});
 await completeCallSession(call.id,{endedAt:new Date(),duration:9000});
 expect((await prisma.callSession.findUnique({where:{id:call.id}}))?.duration).toBe(2);
 expect((await prisma.user.findUnique({where:{id:a.id}}))?.dailyCallsUsed).toBe(0);
});
