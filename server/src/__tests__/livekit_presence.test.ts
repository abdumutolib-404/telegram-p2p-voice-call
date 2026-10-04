import { afterEach, describe, expect, it, vi } from 'vitest';
import { ParticipantInfo } from '@livekit/protocol';
import { ServerError } from 'livekit-server-sdk';
import { areCallParticipantsPresent, countCallParticipants, roomServiceClient } from '../config/livekit';

afterEach(() => vi.restoreAllMocks());

describe('authoritative room presence', () => {
  it('counts distinct call participants for a handshake across separate gateways', async () => {
    vi.spyOn(roomServiceClient!, 'listParticipants').mockResolvedValue([
      new ParticipantInfo({ identity: 'user-A' }), new ParticipantInfo({ identity: 'user-B' }),
      new ParticipantInfo({ identity: 'user-A' }), new ParticipantInfo({ identity: 'egress-worker' }),
    ]);
    expect(await countCallParticipants('synthetic-room', ['user-A', 'user-B'])).toBe(2);
  });
  it('recognizes a remote participant and ignores an egress identity', async () => {
    const list = vi.spyOn(roomServiceClient!, 'listParticipants');
    list.mockResolvedValue([new ParticipantInfo({ identity: 'remote-user' })]);
    expect(await areCallParticipantsPresent('synthetic-room', ['remote-user', 'other-user'])).toBe(true);
    list.mockResolvedValue([new ParticipantInfo({ identity: 'egress-worker' })]);
    expect(await areCallParticipantsPresent('synthetic-room', ['remote-user', 'other-user'])).toBe(false);
  });

  it('accepts a verified empty or missing room as empty', async () => {
    const list = vi.spyOn(roomServiceClient!, 'listParticipants').mockResolvedValue([]);
    expect(await areCallParticipantsPresent('synthetic-room', ['remote-user'])).toBe(false);
    list.mockRejectedValue(new ServerError('Not Found', 'Synthetic missing room', 404, 'not_found'));
    expect(await areCallParticipantsPresent('synthetic-room', ['remote-user'])).toBe(false);
  });

  it('propagates uncertainty when the provider is unavailable or unauthorized', async () => {
    const list = vi.spyOn(roomServiceClient!, 'listParticipants');
    for (const error of [new Error('Synthetic transport failure'), new ServerError('Unauthorized', 'Synthetic permission failure', 401, 'unauthenticated')]) {
      list.mockRejectedValue(error);
      await expect(areCallParticipantsPresent('synthetic-room', ['remote-user'])).rejects.toBe(error);
    }
  });
});
