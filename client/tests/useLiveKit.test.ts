import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useLiveKit, type UseLiveKitReturn } from '../src/hooks/useLiveKit';

const fixture = vi.hoisted(() => {
  function deferred() {
    let resolve!: () => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
  }
  class MockRoom {
    readonly connection = deferred();
    microphone = { promise: Promise.resolve(), resolve: () => {} };
    readonly callbacks = new Map<string, (...args: unknown[]) => void>();
    readonly remoteParticipants = new Map();
    canPlaybackAudio = true;
    readonly localParticipant = {
      isMicrophoneEnabled: true,
      setMicrophoneEnabled: vi.fn(() => this.microphone.promise),
    };
    connect = vi.fn(() => this.connection.promise);
    startAudio = vi.fn(async () => {});
    disconnect = vi.fn(async () => { this.callbacks.get('disconnected')?.(); });
    removeAllListeners() { this.callbacks.clear(); }
    on(event: string, callback: (...args: unknown[]) => void) { this.callbacks.set(event, callback); return this; }
    constructor() { rooms.push(this); }
  }
  const rooms: MockRoom[] = [];
  return { rooms, MockRoom, deferred };
});

vi.mock('livekit-client', () => ({
  Room: fixture.MockRoom,
  RoomEvent: {
    TrackSubscribed: 'subscribed', TrackPublished: 'published', ParticipantConnected: 'joined',
    ParticipantDisconnected: 'left', TrackUnsubscribed: 'unsubscribed',
    AudioPlaybackStatusChanged: 'audio', Disconnected: 'disconnected',
  },
  Track: { Kind: { Audio: 'audio' } },
}));

let api: UseLiveKitReturn;
let root: Root;
let container: HTMLDivElement;
let mounted = false;
function Harness() { api = useLiveKit(); return null; }

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  fixture.rooms.length = 0;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root.render(createElement(Harness)));
  mounted = true;
});

afterEach(async () => {
  if (mounted) await act(async () => root.unmount());
  container.remove();
});

async function begin(token: string) {
  let operation!: Promise<void>;
  const count = fixture.rooms.length;
  await act(async () => { operation = api.connect('wss://synthetic.invalid', token); });
  await vi.waitFor(() => expect(fixture.rooms.length).toBeGreaterThan(count));
  return { operation, room: fixture.rooms.at(-1)! };
}

describe('voice connection ownership and failure handling', () => {
  it('rejects missing credentials instead of reporting connection success', async () => {
    await act(async () => { await expect(api.connect('', '')).rejects.toThrow(/required/i); });
    expect(api.isConnected).toBe(false);
  });

  it('propagates a failed connection and releases the failed room', async () => {
    const { operation, room } = await begin('failed');
    await act(async () => {
      room.connection.reject(new Error('Synthetic connection failure'));
      await expect(operation).rejects.toThrow('Synthetic connection failure');
    });
    expect(room.disconnect).toHaveBeenCalled();
    expect(api.room).toBeNull();
    expect(api.isConnected).toBe(false);
    expect(api.error).toContain('Synthetic connection failure');
  });

  it('keeps a newer room when an earlier cancelled connection finishes or emits events', async () => {
    const first = await begin('first');
    const staleDisconnect = first.room.callbacks.get('disconnected')!;
    act(() => api.disconnect());
    const second = await begin('second');
    await act(async () => { second.room.connection.resolve(); await second.operation; });
    await act(async () => {
      first.room.connection.resolve();
      await expect(first.operation).rejects.toMatchObject({ name: 'AbortError' });
      staleDisconnect();
    });
    expect(api.room).toBe(second.room);
    expect(api.isConnected).toBe(true);
    expect(second.room.disconnect).not.toHaveBeenCalled();
  });

  it('cancels a connection while microphone permission is pending', async () => {
    const pending = await begin('microphone-pending');
    const microphone = fixture.deferred();
    pending.room.microphone = microphone;
    await act(async () => { pending.room.connection.resolve(); });
    await vi.waitFor(() => expect(pending.room.localParticipant.setMicrophoneEnabled).toHaveBeenCalled());
    act(() => api.disconnect());
    await act(async () => {
      microphone.resolve();
      await expect(pending.operation).rejects.toMatchObject({ name: 'AbortError' });
    });
    expect(api.room).toBeNull();
    expect(api.isConnected).toBe(false);
    expect(api.isConnecting).toBe(false);
    expect(pending.room.disconnect).toHaveBeenCalled();
  });

  it('waits for the real connection when the same match is received twice', async () => {
    const first = await begin('duplicate');
    let duplicate!: Promise<void>;
    let duplicateDone = false;
    await act(async () => { duplicate = api.connect('wss://synthetic.invalid', 'duplicate'); void duplicate.then(() => { duplicateDone = true; }); });
    expect(duplicateDone).toBe(false);
    expect(fixture.rooms).toHaveLength(1);
    await act(async () => { first.room.connection.resolve(); await Promise.all([first.operation, duplicate]); });
    expect(api.isConnected).toBe(true);
  });

  it('releases an in-flight room on unmount and rejects its late completion', async () => {
    const pending = await begin('unmounted');
    await act(async () => root.unmount());
    mounted = false;
    expect(pending.room.disconnect).toHaveBeenCalled();
    pending.room.connection.resolve();
    await expect(pending.operation).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('does not apply a late microphone mutation to a newer room', async () => {
    const first = await begin('first-mic');
    await act(async () => { first.room.connection.resolve(); await first.operation; });
    const microphone = fixture.deferred();
    first.room.microphone = microphone;
    let muted!: Promise<void>;
    await act(async () => { muted = api.setMicMuted(true); });
    act(() => api.disconnect());
    const second = await begin('second-mic');
    await act(async () => { second.room.connection.resolve(); await second.operation; });
    await act(async () => { microphone.resolve(); await muted; });
    expect(api.room).toBe(second.room);
    expect(api.isMicMuted).toBe(false);
  });
});
