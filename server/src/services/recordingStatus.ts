import crypto from 'node:crypto';
import type { Server } from 'socket.io';
import { EgressStatus } from 'livekit-server-sdk';
import { getAudioEgressInfo } from '../config/livekit';
import { pubClient, createRedisSubscriber } from '../config/redis';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { prisma } from '../config/database';

export type RoomRecordingState = 'on' | 'off' | 'unknown';
const channel = 'pairtalk:recording-state';
const source = crypto.randomUUID();
let emitLocal: ((room: string, payload: unknown) => void) | undefined;
let subscriber: ReturnType<typeof createRedisSubscriber>;

export function setupRecordingStatus(io: Server): void {
  observations.clear();
  emitLocal = (room, payload) => (io.local ?? io).to(room).emit('room_recording_status', payload);
  subscriber?.disconnect();
  subscriber = createRedisSubscriber();
  if (!subscriber) return;
  const client = subscriber;
  const subscribe = () => { void client.subscribe(channel).catch(error => logger.warn('Recording status subscription failed', { service: 'signaling' }, error)); };
  if (client.status === 'ready') subscribe(); else client.once('ready', subscribe);
  if (client.status === 'wait') void client.connect().catch(() => undefined);
  client.on('message', (topic, message) => {
    if (topic !== channel) return;
    try {
      const payload = JSON.parse(message);
      if (payload.source !== source && typeof payload.roomName === 'string' && payload.roomName.length <= 128 &&
          ['on', 'off', 'unknown'].includes(payload.state)) emitLocal?.(payload.roomName, payload);
    } catch { /* Ignore malformed internal notifications. */ }
  });
}

export async function publishRoomRecordingState(roomName: string, state: RoomRecordingState, updatedAt = Date.now()): Promise<void> {
  observations.clear();
  const payload = { roomName, state, updatedAt, source };
  emitLocal?.(roomName, payload);
  if (env.NODE_ENV === 'test') return;
  try { if (!pubClient) throw new Error('Recording notification publisher unavailable'); await pubClient.publish(channel, JSON.stringify(payload)); }
  catch (error) { logger.warn('Recording status publication failed', { service: 'signaling', roomName }, error); }
}

export async function publishRoomRecordingSnapshot(roomName: string, egressId: string | null): Promise<void> {
  const observedAt = Date.now();
  const state = await getRoomRecordingState(egressId);
  const current = await prisma.callSession.findUnique({where:{roomName}});
  if (!current || current.status !== 'ACTIVE') return;
  await publishRoomRecordingState(roomName,current.egressId === egressId ? state : 'unknown',observedAt);
}

const observations = new Map<string, Promise<RoomRecordingState>>();
export async function getRoomRecordingState(egressId: string | null): Promise<RoomRecordingState> {
  if (!egressId) return 'off';
  const existing = observations.get(egressId);
  if (existing) return existing;
  if (observations.size >= 256) return 'unknown';
  const observed = observeEgress(egressId);
  observations.set(egressId, observed);
  void observed.finally(() => {const timer=setTimeout(()=>{if(observations.get(egressId)===observed)observations.delete(egressId);},1000);timer.unref();}).catch(()=>undefined);
  return observed;
}

async function observeEgress(egressId: string): Promise<RoomRecordingState> {
  const info = await getAudioEgressInfo(egressId);
  if (!info) return 'unknown';
  return [EgressStatus.EGRESS_COMPLETE, EgressStatus.EGRESS_FAILED, EgressStatus.EGRESS_ABORTED, EgressStatus.EGRESS_LIMIT_REACHED].includes(info.status) ? 'off' : 'on';
}

export async function stopRecordingStatus(): Promise<void> {
  const client = subscriber;
  subscriber = null;
  emitLocal = undefined;
  if (client) { try { await client.quit(); } catch { client.disconnect(); } }
}
