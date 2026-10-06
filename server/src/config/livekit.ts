import {
  AccessToken,
  EgressClient,
  RoomServiceClient,
  EncodedFileOutput,
  EncodedFileType,
  S3Upload,
  EgressInfo,
  EgressStatus,
  ServerError,
} from 'livekit-server-sdk';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { env } from './env';
import { logger } from '../utils/logger';

export interface EgressResult {
  readonly egressId: string;
  readonly relativeUrl: string;
}

export let egressClient: EgressClient | null = null;
export let roomServiceClient: RoomServiceClient | null = null;

try {
  egressClient = new EgressClient(env.LIVEKIT_HOST, env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET);
  roomServiceClient = new RoomServiceClient(env.LIVEKIT_HOST, env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, { requestTimeout: 2, failover: false });
} catch (error: unknown) {
  logger.error('LiveKit client initialization failed', {
    service: 'livekit',
    event: 'livekit_client_init_failed',
  }, error);
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
  const namespace = crypto.createHash('sha256').update(roomName ?? '').digest('hex').slice(0, 32);
  return `${year}-${month}-${day}_${hour}-${min}-${sec}_${namespace}_${crypto.randomUUID()}.mp3`;
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

/** Uncertain provider state must never authorize cancellation of a call on another gateway. */
export async function areCallParticipantsPresent(roomName: string, userIds: readonly string[]): Promise<boolean> {
  return await countCallParticipants(roomName, userIds) > 0;
}

export async function countCallParticipants(roomName: string, userIds: readonly string[]): Promise<number> {
  if (!roomServiceClient) throw new Error('Room presence service is unavailable.');
  try {
    const participants = await roomServiceClient.listParticipants(roomName);
    return new Set(participants.filter(participant => userIds.includes(participant.identity)).map(participant => participant.identity)).size;
  } catch (error) {
    if (error instanceof ServerError && error.code === 'not_found') return 0;
    throw error;
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
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 60 || ttlSeconds > 7200) throw new RangeError('Invalid token TTL');

  try {
    const accessToken = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
      identity: participantIdentity,
      name: participantName,
      ttl: ttlSeconds,
    });
    // Allow microphone bootstrap, but no conversation or data before durable readiness.
    accessToken.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: false, canPublishData: false });
    return await accessToken.toJwt();
  } catch (error: unknown) {
    logger.error('LiveKit token generation failed', {
      service: 'livekit',
      event: 'livekit_token_generation_failed',
      roomName,
      participantIdentity,
    }, error);
    throw error;
  }
}

export async function enableCallSubscriptions(roomName: string, identities: string[]): Promise<void> {
  if (!roomServiceClient) throw new Error('Media authorization is unavailable');
  const client = roomServiceClient;
  const results = await Promise.allSettled(identities.map(identity =>
    client.updateParticipant(roomName, identity, {
      permission: { canPublish: true, canSubscribe: true, canPublishData: true },
    })));
  const failure = results.find(result => result.status === 'rejected');
  if (failure?.status === 'rejected') throw failure.reason;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Starts audio-only RoomComposite Egress for two-way mixed call recording.
 */
export async function startAudioEgress(roomName: string, prepare?: (key: string) => Promise<void>): Promise<EgressResult> {
  if (!roomName || roomName.length > 128) throw new TypeError('Invalid roomName');
  if (!egressClient) {
    const err = new Error('LiveKit Egress is disabled (no credentials configured).');
    err.name = 'EGRESS_DISABLED';
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
  if (prepare) await prepare(relativeUrl);

  try {
    if (!hasS3) {
      await fs.mkdir(env.RECORDINGS_DIR, { recursive: true });
    }

    const info = await withTimeout(
      egressClient.startRoomCompositeEgress(roomName, output, { audioOnly: true }),
      10000,
      'LiveKit startRoomCompositeEgress timeout (10s)'
    );

    logger.info('LiveKit Egress started', {
      service: 'livekit',
      event: 'egress_started',
      roomName,
      egressId: info.egressId,
      status: info.status,
    });

    return { egressId: info.egressId, relativeUrl };
  } catch (error: unknown) {
    logger.warn('LiveKit Egress start failed', {
      service: 'livekit',
      event: 'egress_start_failed',
      roomName,
    }, error);
    throw error;
  }
}

/**
 * Stops an active Egress job and returns the final EgressInfo.
 */
export async function stopAudioEgress(egressId: string): Promise<EgressInfo | null> {
  if (!egressId || !egressClient) return null;
  try {
    const info = await withTimeout(
      egressClient.stopEgress(egressId),
      5000,
      'LiveKit stopEgress timeout (5s)'
    );
    logger.info('LiveKit Egress stopped', {
      service: 'livekit',
      event: 'egress_stopped',
      egressId,
      status: info?.status,
    });
    return info;
  } catch (error: unknown) {
    logger.warn('LiveKit Egress stop failed', {
      service: 'livekit',
      event: 'egress_stop_failed',
      egressId,
    }, error);
    return null;
  }
}

/**
 * Fetches current status and metadata of an Egress job.
 */
export async function getAudioEgressInfo(egressId: string): Promise<EgressInfo | null> {
  if (!egressId || !egressClient) return null;
  try {
    const list = await withTimeout(
      egressClient.listEgress({ egressId }),
      5000,
      'LiveKit listEgress timeout (5s)'
    );
    return list && list.length > 0 ? list[0] : null;
  } catch (error: unknown) {
    logger.warn('LiveKit get Egress info failed', {
      service: 'livekit',
      event: 'get_egress_info_failed',
      egressId,
    }, error);
    return null;
  }
}

function cryptoRandomSuffix(): string {
  const bytes = new Uint8Array(6);
  crypto.randomFillSync(bytes);
  return Buffer.from(bytes).toString('hex');
}
