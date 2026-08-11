import { AccessToken, EgressClient, EncodedFileOutput, EncodedFileType } from 'livekit-server-sdk';
import { env } from './env';
import fs from 'fs';
import path from 'path';

// Ensure recordings directory exists
if (!fs.existsSync(env.RECORDINGS_DIR)) {
  fs.mkdirSync(env.RECORDINGS_DIR, { recursive: true });
}

export async function generateLiveKitToken(roomName: string, participantIdentity: string, participantName: string): Promise<string> {
  const at = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
    identity: participantIdentity,
    name: participantName,
    ttl: '1h',
  });

  at.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: true,
    canSubscribe: true,
  });

  return await at.toJwt();
}

let egressClient: EgressClient | null = null;
try {
  egressClient = new EgressClient(env.LIVEKIT_HOST, env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET);
} catch (err) {
  console.warn('[LiveKit] Could not initialize EgressClient (will use mock egress in local dev):', err);
}

export async function startAudioEgress(roomName: string): Promise<{ egressId: string; relativeUrl: string }> {
  const fileName = `${roomName}_${Date.now()}.mp3`;
  const filepath = path.join(env.RECORDINGS_DIR, fileName);
  const relativeUrl = `./recordings/${fileName}`;

  if (egressClient && env.NODE_ENV === 'production') {
    try {
      const output = new EncodedFileOutput({
        fileType: EncodedFileType.MP4,
        filepath,
      });
      const info = await egressClient.startRoomCompositeEgress(roomName, { file: output });
      return { egressId: info.egressId, relativeUrl };
    } catch (err) {
      console.warn('[LiveKit Egress] Failed to start real egress, falling back to mock:', err);
    }
  }

  // Create a mock audio file for dev/test verification
  fs.writeFileSync(filepath, 'MOCK_AUDIO_RECORDING_DATA');
  return { egressId: `mock_egress_${Date.now()}`, relativeUrl };
}

export async function stopAudioEgress(egressId: string): Promise<void> {
  if (egressClient && !egressId.startsWith('mock_egress_') && env.NODE_ENV === 'production') {
    try {
      await egressClient.stopEgress(egressId);
    } catch (err) {
      console.warn('[LiveKit Egress] Failed to stop egress:', err);
    }
  }
}
