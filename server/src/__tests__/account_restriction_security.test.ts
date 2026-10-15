import crypto from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { prisma } from '../config/database';
import { roomServiceClient, egressClient } from '../config/livekit';
import { registerReadyParticipant } from '../services/mediaAuthorization';
import { changeRecordingIntent } from '../services/recordingLifecycle';
import { moderationService } from '../services/moderation';
import { recoverRestrictedCalls } from '../services/restrictionEffects';

afterEach(async () => {
  vi.restoreAllMocks();
  await prisma.callSession.deleteMany();
  await prisma.notificationJob.deleteMany();
  await prisma.user.deleteMany();
});
async function fixture() {
  const users = await Promise.all([0,1].map(() => prisma.user.create({ data: {
    telegramId: BigInt('0x' + crypto.randomBytes(6).toString('hex')), alias: 'Restriction fixture', plan: 'PLUS', dailyLimit: 100,
  } })));
  const call = await prisma.callSession.create({ data: { roomName: crypto.randomUUID(), userAId: users[0].id,
    userBId: users[1].id, mediaAuthorizedAt: new Date(Date.now() - 15000),
    activeRecorderIds: users[0].id, recordedByUserId: users[0].id, egressId: 'synthetic-egress',
  } });
  return { users, call };
}
it('denies readiness for either restricted participant and permits an expired suspension', async () => {
  const { users, call } = await fixture();
  await prisma.user.update({where:{id:users[1].id},data:{bannedUntil:new Date(Date.now()+60000)}});
  expect(await registerReadyParticipant(call.id,users[0].id)).toBe(false);
  await prisma.user.update({where:{id:users[1].id},data:{isBanned:true,bannedUntil:new Date(Date.now()-60000)}});
  expect(await registerReadyParticipant(call.id,users[0].id)).toBe(true);
});
it('does not let an already enrolled recorder restart after suspension', async () => {
  const { users, call } = await fixture();
  await prisma.recordingUsage.create({data:{callId:call.id,userId:users[0].id}});
  await prisma.user.update({where:{id:users[0].id},data:{isBanned:true}});
  await expect(changeRecordingIntent(call.id,users[0].id,true,call.egressId!)).rejects.toThrow('unavailable');
  expect(await changeRecordingIntent(call.id,users[0].id,false,call.egressId!)).toEqual({stopped:true});
});
it('commits a plain notice and closes media even when recording cleanup must retry', async () => {
  const { users, call } = await fixture();
  const close = vi.spyOn(roomServiceClient!,'deleteRoom').mockResolvedValue();
  const stop = vi.spyOn(egressClient!,'stopEgress').mockRejectedValue(new Error('Synthetic unavailable'));
  vi.spyOn(egressClient!,'listEgress').mockRejectedValue(new Error('Synthetic unavailable'));
  await moderationService.banUser(users[0].id,true,undefined,'Reason with _ [] < > * formatting');
  const terminal = await prisma.callSession.findUnique({where:{id:call.id}});
  expect(terminal?.status).toBe('COMPLETED');
  expect(terminal?.restrictionCleanupPending).toBe(true);
  expect(close).toHaveBeenCalledWith(call.roomName);
  const notices = await prisma.notificationJob.findMany({where:{telegramId:users[0].telegramId.toString()}});
  expect(notices).toHaveLength(1);
  expect(notices[0].optionsJson).toBeNull();
  expect(notices[0].text).toContain('Reason with _ [] < > * formatting');
  stop.mockResolvedValue({} as never);
  await recoverRestrictedCalls();
  expect((await prisma.callSession.findUnique({where:{id:call.id}}))?.restrictionCleanupPending).toBe(false);
  expect(await prisma.postCallJob.count({where:{callId:call.id}})).toBe(1);
});
it('reconciles a ban committed before a process interruption and ignores a restored account', async () => {
  const { users, call } = await fixture();
  vi.spyOn(roomServiceClient!,'deleteRoom').mockResolvedValue();
  vi.spyOn(egressClient!,'stopEgress').mockResolvedValue({} as never);
  await recoverRestrictedCalls();
  expect((await prisma.callSession.findUnique({where:{id:call.id}}))?.status).toBe('ACTIVE');
  await prisma.user.update({where:{id:users[1].id},data:{isPermanentlyBanned:true}});
  await recoverRestrictedCalls();
  expect((await prisma.callSession.findUnique({where:{id:call.id}}))?.status).toBe('COMPLETED');
});

it('advances past persistent cleanup failures to close later rooms', async () => {
  const {users}=await fixture();
  const close=vi.spyOn(roomServiceClient!,'deleteRoom').mockResolvedValue();
  vi.spyOn(egressClient!,'stopEgress').mockRejectedValue(new Error('Synthetic persistent failure'));
  vi.spyOn(egressClient!,'listEgress').mockRejectedValue(new Error('Synthetic persistent failure'));
  for(let index=0;index<51;index++) await prisma.callSession.create({data:{id:`cleanup-${String(index).padStart(3,'0')}`,
    roomName:`cleanup-room-${index}`,userAId:users[0].id,userBId:users[1].id,status:'COMPLETED',restrictionCleanupPending:true,
    egressId:index<50?'failed-egress':null}});
  await recoverRestrictedCalls();
  await recoverRestrictedCalls();
  expect(close).toHaveBeenCalledWith('cleanup-room-50');
  expect((await prisma.callSession.findUnique({where:{id:'cleanup-050'}}))?.restrictionCleanupPending).toBe(false);
});
