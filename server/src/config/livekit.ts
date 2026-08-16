import {
  AccessToken,
  EgressClient,
  RoomServiceClient,
  EncodedFileOutput,
  EncodedFileType,
  S3Upload,
  EgressInfo,
  EgressStatus,
} from 'livekit-server-sdk';
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

/**
 * Checks whether the environment has a valid storage configuration for Egress.
 * - LiveKit Cloud requires external S3/compatible cloud storage.
 * - Self-hosted LiveKit can use either S3 or a mounted local recordings directory.
 */
export function isRecordingStorageConfigured(): boolean {
  const isLiveKitCloud = env.LIVEKIT_HOST.includes('.livekit.cloud');
  const hasS3 = Boolean(env.S3_KEY && env.S3_SECRET && env.S3_BUCKET);
  if (isLiveKitCloud) {
    return hasS3;
  }
  return hasS3 || Boolean(env.RECORDINGS_DIR);
}

/**
 * Builds a strictly-typed EncodedFileOutput protobuf object matching LiveKit Server SDK v2.
 */
export function generateRecordingFileName(roomName?: string): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  const hour = String(now.getUTCHours()).padStart(2, '0');
  const min = String(now.getUTCMinutes()).padStart(2, '0');
  const sec = String(now.getUTCSeconds()).padStart(2, '0');
  const shortId = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `${year}-${month}-${day}_${hour}-${min}-${sec}_${shortId}.mp3`;
}

/**
 * Builds a strictly-typed EncodedFileOutput protobuf object matching LiveKit Server SDK v2.
 */
export function buildAudioEncodedFileOutput(fileName: string): { output: EncodedFileOutput; relativeUrl: string } {
  const hasS3 = Boolean(env.S3_KEY && env.S3_SECRET && env.S3_BUCKET);
  const relativeUrl = `recordings/${fileName}`;

  if (hasS3) {
    const s3 = new S3Upload({
      accessKey: env.S3_KEY!,
      secret: env.S3_SECRET!,
      bucket: env.S3_BUCKET!,
      region: env.S3_REGION || 'eu-north-1',
      endpoint: env.S3_ENDPOINT || undefined,
      forcePathStyle: env.S3_FORCE_PATH_STYLE ?? false,
    });

    const output = new EncodedFileOutput({
      fileType: EncodedFileType.MP3,
      filepath: relativeUrl,
      disableManifest: true,
      output: {
        case: 's3',
        value: s3,
      },
    });

    return { output, relativeUrl };
  }

  const filepath = path.join(env.RECORDINGS_DIR, fileName);
  const output = new EncodedFileOutput({
    fileType: EncodedFileType.MP3,
    filepath,
    disableManifest: true,
  });

  return { output, relativeUrl };
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

/**
 * Starts audio-only RoomComposite Egress for two-way mixed call recording.
 */
export async function startAudioEgress(roomName: string): Promise<EgressResult> {
  if (!roomName || roomName.length > 128) throw new TypeError('Invalid roomName');
  if (!egressClient) {
    const err = new Error('LiveKit Egress client is uninitialized or unavailable');
    err.name = 'RECORDING_UNAVAILABLE';
    throw err;
  }

  // Pre-validate cloud storage availability for LiveKit Cloud instances
  const isLiveKitCloud = env.LIVEKIT_HOST.includes('.livekit.cloud');
  const hasS3 = Boolean(env.S3_KEY && env.S3_SECRET && env.S3_BUCKET);
  if (isLiveKitCloud && !hasS3) {
    const err = new Error('Cloud recording storage is not configured (S3 credentials required for LiveKit Cloud Egress).');
    err.name = 'RECORDING_STORAGE_UNAVAILABLE';
    throw err;
  }

  const fileName = generateRecordingFileName(roomName);
  const { output, relativeUrl } = buildAudioEncodedFileOutput(fileName);

  try {
    if (!hasS3) {
      await fs.mkdir(env.RECORDINGS_DIR, { recursive: true });
    }

    const info = await egressClient.startRoomCompositeEgress(
      roomName,
      output,
      {
        audioOnly: true,
      }
    );

    console.log('[LiveKit] RECORDING_START_ACCEPTED', {
      roomName,
      egressId: info.egressId,
      status: info.status,
    });

    return { egressId: info.egressId, relativeUrl };
  } catch (error: unknown) {
    console.warn('[LiveKit] RECORDING_START_FAILED', {
      roomName,
      error: error instanceof Error ? error.message : error,
    });
    throw error;
  }
}

/**
 * Stops an active Egress job and returns the final EgressInfo.
 */
export async function stopAudioEgress(egressId: string): Promise<EgressInfo | null> {
  if (!egressId || !egressClient) return null;
  try {
    const info = await egressClient.stopEgress(egressId);
    console.log('[LiveKit] RECORDING_STOP_ACCEPTED', {
      egressId,
      status: info?.status,
    });
    return info;
  } catch (error: unknown) {
    console.warn('[LiveKit] egress_stop_failed', {
      egressId,
      error: error instanceof Error ? error.message : error,
    });
    return null;
  }
}

/**
 * Fetches current status and metadata of an Egress job.
 */
export async function getAudioEgressInfo(egressId: string): Promise<EgressInfo | null> {
  if (!egressId || !egressClient) return null;
  try {
    const list = await egressClient.listEgress({ egressId });
    return list && list.length > 0 ? list[0] : null;
  } catch (error: unknown) {
    console.warn('[LiveKit] get_egress_info_failed', {
      egressId,
      error: error instanceof Error ? error.message : error,
    });
    return null;
  }
}

function cryptoRandomSuffix(): string {
  const bytes = new Uint8Array(6);
  crypto.randomFillSync(bytes);
  return Buffer.from(bytes).toString('hex');
}
