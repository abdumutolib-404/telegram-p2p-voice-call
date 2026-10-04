import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { socketService } from '../src/services/socket';

const fixture = vi.hoisted(() => ({
  io: vi.fn(),
  socket: { connected: false, connect: vi.fn(), disconnect: vi.fn(), emit: vi.fn() },
}));
vi.mock('socket.io-client', () => ({ io: fixture.io }));
beforeEach(() => { vi.clearAllMocks(); fixture.io.mockReturnValue(fixture.socket); fixture.socket.connected = false; });
afterEach(() => socketService.disconnect());

it('reuses a connecting or reconnecting transport across application transitions', () => {
  const first = socketService.connect('synthetic-credential');
  expect(socketService.connect('synthetic-credential')).toBe(first);
  expect(fixture.io).toHaveBeenCalledTimes(1);
  expect(fixture.socket.disconnect).not.toHaveBeenCalled();
  expect(fixture.socket.connect).toHaveBeenCalledOnce();
});

it('replaces the transport when authentication changes and clears it on unmount', () => {
  socketService.connect('synthetic-old-credential');
  socketService.connect('synthetic-new-credential');
  expect(fixture.io).toHaveBeenCalledTimes(2);
  expect(fixture.socket.disconnect).toHaveBeenCalledOnce();
  socketService.disconnect();
  expect(socketService.getSocket()).toBeNull();
  expect(fixture.socket.disconnect).toHaveBeenCalledTimes(2);
});
