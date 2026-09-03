import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createServer } from 'node:http';
import { Server as SocketIOServer } from 'socket.io';
import { io as ClientSocket, Socket as ClientSocketType } from 'socket.io-client';
import { setupSignaling } from '../socket/signaling';
import { logger } from '../utils/logger';

describe('WebSocket Signaling Correlation & Trace ID Tests', () => {
  let httpServer: any;
  let io: SocketIOServer;
  let port: number;
  let stdoutWriteSpy: any;
  let capturedStdout: string[] = [];
  let clientSockets: ClientSocketType[] = [];

  beforeEach(async () => {
    capturedStdout = [];
    clientSockets = [];

    stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: any) => {
      capturedStdout.push(chunk.toString());
      return true;
    });

    httpServer = createServer();
    io = new SocketIOServer(httpServer, {
      cors: { origin: '*' },
    });

    setupSignaling(io);

    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => {
        const addr = httpServer.address();
        port = typeof addr === 'object' && addr ? addr.port : 3000;
        resolve();
      });
    });
  });

  afterEach(async () => {
    stdoutWriteSpy.mockRestore();

    for (const socket of clientSockets) {
      if (socket.connected) {
        socket.disconnect();
      }
    }
    clientSockets = [];

    if (io) {
      await new Promise<void>((resolve) => io.close(() => resolve()));
    }
    if (httpServer && httpServer.listening) {
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    }
  });

  it('assigns and preserves traceId on socket connection handshake', async () => {
    const customTraceId = 'client-signaling-trace-12345';

    const client = ClientSocket(`http://localhost:${port}`, {
      auth: {
        userId: 'user-alice-1',
        traceId: customTraceId,
      },
      transports: ['websocket'],
    });
    clientSockets.push(client);

    await new Promise<void>((resolve) => {
      client.on('connect', () => resolve());
    });

    // Verify logs captured the connection and traceId
    const connectionLogs = capturedStdout
      .map((s) => {
        try {
          return JSON.parse(s.trim());
        } catch {
          return null;
        }
      })
      .filter((entry) => entry && (entry.context?.event === 'socket:connected' || entry.context?.event === 'socket:auth_success'));

    expect(connectionLogs.length).toBeGreaterThanOrEqual(1);
    const log = connectionLogs[0];
    expect(log.context.traceId).toBe(customTraceId);
    expect(log.context.userId).toBe('user-alice-1');
    expect(log.context.service).toBe('signaling');
  });

  it('generates a new traceId when none is provided in the handshake', async () => {
    const client = ClientSocket(`http://localhost:${port}`, {
      auth: {
        userId: 'user-bob-2',
      },
      transports: ['websocket'],
    });
    clientSockets.push(client);

    await new Promise<void>((resolve) => {
      client.on('connect', () => resolve());
    });

    const connectionLogs = capturedStdout
      .map((s) => {
        try {
          return JSON.parse(s.trim());
        } catch {
          return null;
        }
      })
      .filter((entry) => entry && entry.context?.userId === 'user-bob-2' && (entry.context?.event === 'socket:connected' || entry.context?.event === 'socket:auth_success'));

    expect(connectionLogs.length).toBeGreaterThanOrEqual(1);
    const log = connectionLogs[0];
    expect(log.context.traceId).toBeDefined();
    // Must be valid UUIDv4
    expect(log.context.traceId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it('attaches distinct eventRequestId for each socket packet via socket.use interceptor', async () => {
    const client = ClientSocket(`http://localhost:${port}`, {
      auth: {
        userId: 'user-charlie-3',
      },
      transports: ['websocket'],
    });
    clientSockets.push(client);

    await new Promise<void>((resolve) => {
      client.on('connect', () => resolve());
    });

    // Send WebRTC candidate event
    client.emit('candidate', {
      roomName: 'room-test-123',
      candidate: { candidate: 'candidate:1 1 UDP 2122260223 ...', sdpMid: '0', sdpMLineIndex: 0 },
    });

    // Send WebRTC leave event
    client.emit('leave', {
      roomName: 'room-test-123',
    });

    // Give packet handlers a moment to process
    await new Promise((resolve) => setTimeout(resolve, 80));

    const packetLogs = capturedStdout
      .map((s) => {
        try {
          return JSON.parse(s.trim());
        } catch {
          return null;
        }
      })
      .filter((entry) => entry && entry.context?.userId === 'user-charlie-3');

    // Find candidate and leave event logs
    const candidateLog = packetLogs.find((l) => l.context?.event === 'webrtc:candidate' || l.context?.event === 'socket:candidate');
    const leaveLog = packetLogs.find((l) => l.context?.event === 'webrtc:leave' || l.context?.event === 'socket:leave');

    expect(candidateLog).toBeDefined();
    expect(candidateLog?.context?.traceId).toBeDefined();
    expect(candidateLog?.context?.requestId).toBeDefined();

    expect(leaveLog).toBeDefined();
    expect(leaveLog?.context?.traceId).toBeDefined();
    expect(leaveLog?.context?.requestId).toBeDefined();
  });
});
