import crypto from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ParticipantInfo } from '@livekit/protocol';
import { prisma } from '../config/database';
import { roomServiceClient } from '../config/livekit';
import { clearConnectionHandshakeTimer, scheduleConnectionHandshakeTimer, sweepZombieSessions } from '../socket/signaling';

const rooms: string[] = [];
const users: string[] = [];
beforeEach(() => { vi.useFakeTimers(); vi.spyOn(roomServiceClient!, 'deleteRoom').mockResolvedValue(); });
afterEach(async () => {
  for (const room of rooms.splice(0)) clearConnectionHandshakeTimer(room);
  vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks();
  await prisma.callSession.deleteMany();
  await prisma.user.deleteMany({ where: { id: { in: users.splice(0) } } });
});

async function fixture() {
  const participants = await Promise.all([0, 1].map(async () => {
    const value = await prisma.user.create({ data: { telegramId: BigInt('0x' + crypto.randomBytes(6).toString('hex')), alias: 'Synthetic recovery fixture', plan: 'FREE', maxDuration: 15 } });
    users.push(value.id); return value;
  }));
  const roomName = crypto.randomUUID(); rooms.push(roomName);
  const call = await prisma.callSession.create({ data: {
    roomName, userAId: participants[0].id, userBId: participants[1].id,
    status: 'ACTIVE', createdAt: new Date(Date.now() - 120000),
  } });
  return { call, participants, roomName };
}

describe('call recovery ownership', () => {
  it('preserves a remote call and uncertain provider state when local sockets are empty', async () => {
    const { call, participants } = await fixture();
    const list = vi.spyOn(roomServiceClient!, 'listParticipants').mockResolvedValue([new ParticipantInfo({ identity: participants[0].id })]);
    expect(await sweepZombieSessions()).toBe(0);
    expect((await prisma.callSession.findUnique({ where: { id: call.id } }))?.status).toBe('ACTIVE');
    list.mockRejectedValue(new Error('Synthetic provider unavailable'));
    expect(await sweepZombieSessions()).toBe(0);
    expect((await prisma.callSession.findUnique({ where: { id: call.id } }))?.status).toBe('ACTIVE');
    expect(roomServiceClient!.deleteRoom).not.toHaveBeenCalled();
  });

  it('cancels a confirmed empty room without consuming allowance', async () => {
    const { call, participants } = await fixture();
    vi.spyOn(roomServiceClient!, 'listParticipants').mockResolvedValue([]);
    expect(await sweepZombieSessions()).toBe(1);
    expect((await prisma.callSession.findUnique({ where: { id: call.id } }))?.status).toBe('CANCELLED');
    for (const participant of participants) expect((await prisma.user.findUnique({ where: { id: participant.id } }))?.dailyCallsUsed).toBe(0);
  });

  it('preserves a completed handshake across gateways and installs a duration deadline', async () => {
    const { call, participants, roomName } = await fixture();
    vi.spyOn(roomServiceClient!, 'listParticipants').mockResolvedValue(participants.map(user => new ParticipantInfo({ identity: user.id })));
    scheduleConnectionHandshakeTimer(roomName, 1);
    await vi.advanceTimersByTimeAsync(1000);
    expect((await prisma.callSession.findUnique({ where: { id: call.id } }))?.status).toBe('ACTIVE');
    expect(roomServiceClient!.deleteRoom).not.toHaveBeenCalled();
    // First authorization starts speaking time; setup does not consume it.
    await vi.advanceTimersByTimeAsync(899000);
    expect((await prisma.callSession.findUnique({ where: { id: call.id } }))?.status).toBe('ACTIVE');
    await vi.advanceTimersByTimeAsync(1000);
    expect((await prisma.callSession.findUnique({ where: { id: call.id } }))?.status).toBe('COMPLETED');
    for (const participant of participants) expect((await prisma.user.findUnique({ where: { id: participant.id } }))?.dailyCallsUsed).toBe(1);
  });

  it('retries an uncertain handshake instead of deleting a potentially live room', async () => {
    const { call, participants, roomName } = await fixture();
    const list = vi.spyOn(roomServiceClient!, 'listParticipants').mockRejectedValue(new Error('Synthetic provider unavailable'));
    scheduleConnectionHandshakeTimer(roomName, 1);
    await vi.advanceTimersByTimeAsync(1000);
    expect((await prisma.callSession.findUnique({ where: { id: call.id } }))?.status).toBe('ACTIVE');
    expect(roomServiceClient!.deleteRoom).not.toHaveBeenCalled();
    list.mockResolvedValue(participants.map(user => new ParticipantInfo({ identity: user.id })));
    await vi.advanceTimersByTimeAsync(30000);
    expect(list).toHaveBeenCalledTimes(2);
    expect((await prisma.callSession.findUnique({ where: { id: call.id } }))?.status).toBe('ACTIVE');
  });
});
