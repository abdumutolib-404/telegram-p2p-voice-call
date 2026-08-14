import { AccessToken, EgressClient, RoomServiceClient, EncodedFileOutput, EncodedFileType } from 'livekit-server-sdk';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { env } from './env';

export interface EgressResult {
  readonly egressId: string;
  readonly relativeUrl: string;
}

let egressClient: EgressClient | null = null;
let roomServiceClient: RoomServiceClient | null = null;
try {
  egressClient = new EgressClient(env.LIVEKIT_HOST, env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET);
  roomServiceClient = new RoomServiceClient(env.LIVEKIT_HOST, env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET);
} catch (error: unknown) {
  console.error('[LiveKit] client_init_failed', {
    error: error instanceof Error ? error.message : 'unknown_error',
  });
}

export async function deleteLiveKitRoom(roomName: string): Promise<void> {
  if (!roomName || !roomServiceClient) return;
  try {
    const deletePromise = roomServiceClient.deleteRoom(roomName);
    const timeoutPromise = new Promise<void>((resolve) => setTimeout(resolve, 1500));
    await Promise.race([deletePromise, timeoutPromise]);
  } catch {
    // Room may already have ended or been closed
  }
}

export async function generateLiveKitToken(
  roomName: string,
  participantIdentity: string,
  participantName: string,
  ttlSeconds: number,
): Promise<string> {
  if (!roomName || roomName.length > 128) throw new TypeError('Invalid roomName');
  if (!participantIdentity || participantIdentity.length > 128) throw new TypeError('Invalid participantIdentity');
  if (!participantName || participantName.length > 128) throw new TypeError('Invalid participantName');
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 60 || ttlSeconds > 3600) throw new RangeError('Invalid token TTL');

  try {
    const accessToken = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
      identity: participantIdentity,
      name: participantName,
      ttl: ttlSeconds,
    });
    accessToken.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true });
    return await accessToken.toJwt();
  } catch (error: unknown) {
    console.error('[LiveKit] token_generation_failed', {
      roomName,
      participantIdentity,
      error: error instanceof Error ? error.message : 'unknown_error',
    });
    throw error;
  }
}

export async function startAudioEgress(roomName: string): Promise<EgressResult> {
  if (!roomName || roomName.length > 128) throw new TypeError('Invalid roomName');
  if (!egressClient) {
    throw new Error('LiveKit Egress client is uninitialized or unavailable');
  }

  const safeRoomName = roomName.replace(/[^a-zA-Z0-9_-]/g, '_');
  const fileName = `${safeRoomName}_${Date.now()}_${cryptoRandomSuffix()}.mp3`;
  const filepath = path.join(env.RECORDINGS_DIR, fileName);
  const relativeUrl = `recordings/${fileName}`;

  try {
    await fs.mkdir(env.RECORDINGS_DIR, { recursive: true });
    const output = new EncodedFileOutput({ fileType: EncodedFileType.MP3, filepath });
    const info = await egressClient.startRoomCompositeEgress(roomName, output, { audioOnly: true });
    return { egressId: info.egressId, relativeUrl };
  } catch (error: unknown) {
    console.error('[LiveKit] Real audio egress start failed:', error instanceof Error ? error.message : error);
    throw error;
  }
}

export async function stopAudioEgress(egressId: string): Promise<void> {
  if (!egressId || !egressClient) return;
  try {
    await egressClient.stopEgress(egressId);
  } catch (error: unknown) {
    console.warn('[LiveKit] egress_stop_failed:', error instanceof Error ? error.message : error);
    throw error;
  }
}

function cryptoRandomSuffix(): string {
  const bytes = new Uint8Array(6);
  crypto.randomFillSync(bytes);
  return Buffer.from(bytes).toString('hex');
}
