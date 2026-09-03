import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createServer } from 'node:http';
import * as net from 'node:net';
import { Server as SocketIOServer } from 'socket.io';
import { io as ClientSocket, Socket as ClientSocketType } from 'socket.io-client';
import { requestIdMiddleware } from '../middleware/requestId';
import {
  requestContextStorage,
  getRequestContext,
  getRequestId,
  getUserId,
  setRequestContextUserId,
  updateRequestContext,
  runWithRequestContext,
} from '../utils/requestContext';
import { setupSignaling } from '../socket/signaling';
import { logger, getRecentErrors, clearRecentErrors } from '../utils/logger';

describe('Milestone M4 Challenger 2: Concurrency, Context Bleeding & Injection Stress Test', () => {
  let stdoutWriteSpy: any;
  let stderrWriteSpy: any;
  const capturedLogs: string[] = [];

  beforeEach(() => {
    capturedLogs.length = 0;
    clearRecentErrors();

    stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: any) => {
      capturedLogs.push(chunk.toString());
      return true;
    });
    stderrWriteSpy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: any) => {
      capturedLogs.push(chunk.toString());
      return true;
    });
  });

  afterEach(() => {
    stdoutWriteSpy.mockRestore();
    stderrWriteSpy.mockRestore();
  });

  // =========================================================================
  // Section 1: AsyncLocalStorage Concurrency & Context Isolation Tests
  // =========================================================================
  describe('Async Continuation Isolation & High Concurrency', () => {
    it('prevents context bleeding across 200 concurrent HTTP requests with interleaved async tasks and mutations', async () => {
      const app = express();
      app.use(requestIdMiddleware);

      // Endpoint with random delay and context modifications simulating real async pipeline
      app.get('/concurrent-op/:idx', async (req, res) => {
        const idx = req.params.idx;
        const initialReqId = getRequestId();
        const initialStore = getRequestContext();

        expect(initialReqId).toBeDefined();
        expect(initialStore?.requestId).toBe(initialReqId);

        // Mutate context with request-specific userId and metadata
        const assignedUserId = `user_${idx}_${Date.now()}`;
        setRequestContextUserId(assignedUserId);
        updateRequestContext({ requestIndex: idx, tag: `tag_${idx}` });

        // First async boundary (timer)
        const delay1 = Math.floor(Math.random() * 25) + 5;
        await new Promise((resolve) => setTimeout(resolve, delay1));

        // Verify context integrity after first async boundary
        const midReqId = getRequestId();
        const midUser = getUserId();
        const midStore = getRequestContext();

        if (midReqId !== initialReqId || midUser !== assignedUserId) {
          throw new Error(`Context bleeding detected at mid-point for idx ${idx}: expected user ${assignedUserId}, got ${midUser}`);
        }

        // Second async boundary (nested promise / microtasks)
        await Promise.resolve().then(async () => {
          await new Promise((resolve) => setTimeout(resolve, Math.floor(Math.random() * 15) + 1));
          updateRequestContext({ nestedCompleted: true });
        });

        // Final verification before response
        const finalReqId = getRequestId();
        const finalUser = getUserId();
        const finalStore = getRequestContext();

        res.json({
          requestIndex: idx,
          initialReqId,
          finalReqId,
          assignedUserId,
          finalUser,
          nestedCompleted: finalStore?.nestedCompleted,
          customTag: finalStore?.tag,
        });
      });

      const totalRequests = 200;
      const requestPromises = Array.from({ length: totalRequests }, async (_, i) => {
        const isCustomHeader = i % 2 === 0;
        const customId = isCustomHeader ? `custom-trace-${i}-abcd` : undefined;

        let reqBuilder = request(app).get(`/concurrent-op/${i}`);
        if (customId) {
          reqBuilder = reqBuilder.set('X-Request-ID', customId);
        }

        const res = await reqBuilder;
        return { index: i, customId, res };
      });

      const results = await Promise.all(requestPromises);

      // Thorough validation of all 200 responses
      expect(results.length).toBe(totalRequests);

      const seenRequestIds = new Set<string>();
      const seenUserIds = new Set<string>();

      for (const { index, customId, res } of results) {
        expect(res.status).toBe(200);
        const headerReqId = res.headers['x-request-id'];
        expect(headerReqId).toBeDefined();

        if (customId) {
          expect(headerReqId).toBe(customId);
          expect(res.body.initialReqId).toBe(customId);
        } else {
          expect(headerReqId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
        }

        // Check response body correlation matches response header exactly
        expect(res.body.requestIndex).toBe(String(index));
        expect(res.body.initialReqId).toBe(headerReqId);
        expect(res.body.finalReqId).toBe(headerReqId);
        expect(res.body.finalUser).toBe(res.body.assignedUserId);
        expect(res.body.nestedCompleted).toBe(true);
        expect(res.body.customTag).toBe(`tag_${index}`);

        // Ensure no duplicate request IDs across generated IDs
        expect(seenRequestIds.has(headerReqId)).toBe(false);
        seenRequestIds.add(headerReqId);

        // Ensure user IDs were completely isolated
        expect(seenUserIds.has(res.body.assignedUserId)).toBe(false);
        seenUserIds.add(res.body.assignedUserId);
      }
    });

    it('handles nested runWithRequestContext cleanly without corrupting parent scope', () => {
      const parentCtx = {
        requestId: 'parent-req-123',
        userId: 'user-parent',
        service: 'api',
      };

      const childCtx = {
        requestId: 'child-req-456',
        userId: 'user-child',
        service: 'worker',
      };

      runWithRequestContext(parentCtx, () => {
        expect(getRequestId()).toBe('parent-req-123');
        expect(getUserId()).toBe('user-parent');

        // Nested child execution
        runWithRequestContext(childCtx, () => {
          expect(getRequestId()).toBe('child-req-456');
          expect(getUserId()).toBe('user-child');
          updateRequestContext({ extraChild: true });
          expect(getRequestContext()?.extraChild).toBe(true);
        });

        // Parent context must be completely preserved
        expect(getRequestId()).toBe('parent-req-123');
        expect(getUserId()).toBe('user-parent');
        expect(getRequestContext()?.extraChild).toBeUndefined();
      });

      // Outside context must be undefined
      expect(getRequestId()).toBeUndefined();
      expect(getRequestContext()).toBeUndefined();
    });

    it('safely handles context accessors outside of active async storage', () => {
      expect(getRequestId()).toBeUndefined();
      expect(getUserId()).toBeUndefined();
      expect(getRequestContext()).toBeUndefined();

      // Calling setters outside context should not throw
      expect(() => setRequestContextUserId('orphan_user')).not.toThrow();
      expect(() => updateRequestContext({ orphanKey: 'value' })).not.toThrow();
    });

    it('preserves request correlation and logs correctly when route throws errors', async () => {
      const app = express();
      app.use(requestIdMiddleware);
      app.get('/error-500', (req, res) => {
        setRequestContextUserId('user-error-500');
        res.status(500).json({ error: 'Internal Server Error' });
      });
      app.get('/warn-400', (req, res) => {
        setRequestContextUserId('user-warn-400');
        res.status(400).json({ error: 'Bad Request' });
      });

      const res500 = await request(app).get('/error-500').set('X-Request-ID', 'err-500-req');
      expect(res500.status).toBe(500);
      expect(res500.headers['x-request-id']).toBe('err-500-req');

      const res400 = await request(app).get('/warn-400').set('X-Request-ID', 'warn-400-req');
      expect(res400.status).toBe(400);
      expect(res400.headers['x-request-id']).toBe('warn-400-req');

      // Check log emissions from captured stdout/stderr
      const logs = capturedLogs.map((s) => {
        try {
          return JSON.parse(s.trim());
        } catch {
          return null;
        }
      });

      const log500 = logs.find((l) => l?.context?.requestId === 'err-500-req');
      expect(log500).toBeDefined();
      expect(log500.levelName).toBe('error');
      expect(log500.context.statusCode).toBe(500);
      expect(log500.context.userId).toBe('user-error-500');

      const log400 = logs.find((l) => l?.context?.requestId === 'warn-400-req');
      expect(log400).toBeDefined();
      expect(log400.levelName).toBe('warn');
      expect(log400.context.statusCode).toBe(400);
      expect(log400.context.userId).toBe('user-warn-400');

      // Check ring buffer
      const recentErrors = getRecentErrors();
      expect(recentErrors.some((e) => e.requestId === 'err-500-req')).toBe(true);
    });
  });

  // =========================================================================
  // Section 2: Header Injection, CRLF, Extreme Lengths & Special Chars Stress
  // =========================================================================
  describe('Header Injection & Malicious X-Request-ID Stress Tests', () => {
    let app: express.Express;
    let liveServer: any;
    let serverPort: number;

    beforeEach(async () => {
      app = express();
      app.use(requestIdMiddleware);
      app.get('/test-header', (req, res) => {
        res.json({
          requestId: getRequestId(),
          idProperty: (req as any).id,
          requestIdProperty: (req as any).requestId,
        });
      });

      liveServer = createServer(app);
      await new Promise<void>((resolve) => {
        liveServer.listen(0, () => {
          const addr = liveServer.address();
          serverPort = typeof addr === 'object' && addr ? addr.port : 3000;
          resolve();
        });
      });
    });

    afterEach(async () => {
      if (liveServer && liveServer.listening) {
        await new Promise<void>((resolve) => liveServer.close(() => resolve()));
      }
    });

    it('sanitizes headers sent via raw TCP HTTP socket and guarantees injection safety', async () => {
      const rawPayloads = [
        { header: 'X-Request-ID: <script>alert(1)</script>', expectFallback: true },
        { header: 'X-Request-ID: legit_123', expectFallback: false, expected: 'legit_123' },
        { header: 'X-Request-ID: \r\nSet-Cookie: evil=1', expectFallback: true },
        { header: 'X-Correlation-ID: evil; DROP TABLE users', expectFallback: true },
      ];

      for (const item of rawPayloads) {
        const responseData = await new Promise<string>((resolve, reject) => {
          const client = net.createConnection({ port: serverPort }, () => {
            client.write(`GET /test-header HTTP/1.1\r\nHost: localhost\r\n${item.header}\r\nConnection: close\r\n\r\n`);
          });

          let data = '';
          client.on('data', (chunk) => {
            data += chunk.toString();
          });
          client.on('end', () => resolve(data));
          client.on('error', (err) => reject(err));
        });

        if (responseData.includes('200 OK')) {
          const match = responseData.match(/X-Request-ID:\s*([^\r\n]+)/i);
          expect(match).not.toBeNull();
          const extractedId = match![1].trim();

          // Must NOT contain CRLF or injected content
          expect(extractedId).not.toContain('\r');
          expect(extractedId).not.toContain('\n');
          expect(extractedId).not.toContain('<script>');
          expect(extractedId).not.toContain('DROP');

          if (item.expectFallback) {
            expect(extractedId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
          } else {
            expect(extractedId).toBe(item.expected);
          }
        } else {
          expect(responseData).toContain('400 Bad Request');
        }
      }
    });

    it('directly sanitizes mock Request objects containing CRLF, injection, and extreme characters', () => {
      const dirtyValues = [
        'legit\r\nSet-Cookie: evil',
        'dirty\nInjected: true',
        'dirty\rInjected: true',
        'A'.repeat(129),
        'A'.repeat(5000),
        'A'.repeat(100000),
        '<script>alert(1)</script>',
        "'; DROP TABLE users; --",
        "' OR '1'='1",
        '../../../etc/passwd',
        '..\\..\\windows\\system32',
        'null\x00byte',
        'ansi_\x1b[31m_red',
        'unicode_🚀_rocket',
        'japanese_日本語_id',
        'spaces in middle of id',
        'tab\tid',
        'quote"id',
        'backtick`id`',
        'curly{brace}',
        'brackets[index]',
        'slash/in/id',
        'backslash\\in\\id',
        'pipe|in|id',
        'dollar$id',
        '',
        '   ',
      ];

      for (const dirty of dirtyValues) {
        let capturedHeader: string | undefined;
        let nextCalled = false;

        const mockReq: any = {
          headers: { 'x-request-id': dirty },
          method: 'GET',
          url: '/test',
        };

        const mockRes: any = {
          setHeader: vi.fn((key: string, val: string) => {
            if (key === 'X-Request-ID') {
              capturedHeader = val;
            }
          }),
          on: vi.fn(),
          statusCode: 200,
        };

        const next = () => {
          nextCalled = true;
          // Verify getRequestId inside context is clean
          const activeId = getRequestId();
          expect(activeId).toBeDefined();
          expect(activeId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
        };

        requestIdMiddleware(mockReq, mockRes, next);

        expect(nextCalled).toBe(true);
        expect(capturedHeader).toBeDefined();
        // Middleware must have rejected dirty value and generated a clean UUIDv4
        expect(capturedHeader).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
        expect(mockReq.id).toBe(capturedHeader);
        expect(mockReq.requestId).toBe(capturedHeader);
      }
    });

    it('prioritizes X-Request-ID over X-Correlation-ID and safely handles multi-value/array headers', () => {
      // 1. Both headers present: X-Request-ID should take precedence
      let capturedHeader: string | undefined;
      const mockReq: any = {
        headers: {
          'x-request-id': 'req-primary-123',
          'x-correlation-id': 'corr-secondary-456',
        },
        method: 'GET',
        url: '/test',
      };
      const mockRes: any = {
        setHeader: vi.fn((key: string, val: string) => {
          if (key === 'X-Request-ID') capturedHeader = val;
        }),
        on: vi.fn(),
      };
      requestIdMiddleware(mockReq, mockRes, () => {});
      expect(capturedHeader).toBe('req-primary-123');

      // 2. Array headers (e.g. repeated header in HTTP request)
      const mockReqArray: any = {
        headers: {
          'x-request-id': ['id-first', 'id-second'],
        },
        method: 'GET',
        url: '/test',
      };
      let capturedArrayHeader: string | undefined;
      const mockResArray: any = {
        setHeader: vi.fn((key: string, val: string) => {
          if (key === 'X-Request-ID') capturedArrayHeader = val;
        }),
        on: vi.fn(),
      };
      requestIdMiddleware(mockReqArray, mockResArray, () => {});
      // Array header is safely rejected (typeof incoming !== 'string') and falls back to UUIDv4
      expect(capturedArrayHeader).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });

    it('rejects extreme lengths over HTTP wire (>128 chars, 500, 1000 chars) without ReDoS', async () => {
      const lengths = [129, 200, 500, 1000];

      for (const len of lengths) {
        const giantId = 'a'.repeat(len);
        const startTime = Date.now();

        const res = await request(app)
          .get('/test-header')
          .set('X-Request-ID', giantId);

        const duration = Date.now() - startTime;
        expect(duration).toBeLessThan(1000); // Resolves immediately with no ReDoS

        expect(res.status).toBe(200);
        const headerId = res.headers['x-request-id'];
        expect(headerId.length).toBe(36); // Replaced with UUIDv4
        expect(headerId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
      }
    });

    it('handles exact boundary length of 128 characters correctly', async () => {
      // 128 valid characters
      const exact128 = 'a'.repeat(128);
      const res = await request(app)
        .get('/test-header')
        .set('X-Request-ID', exact128);

      expect(res.status).toBe(200);
      expect(res.headers['x-request-id']).toBe(exact128);
      expect(res.body.requestId).toBe(exact128);

      // 129 characters should be rejected and replaced with UUIDv4
      const over128 = 'a'.repeat(129);
      const resOver = await request(app)
        .get('/test-header')
        .set('X-Request-ID', over128);

      expect(resOver.status).toBe(200);
      expect(resOver.headers['x-request-id']).not.toBe(over128);
      expect(resOver.headers['x-request-id'].length).toBe(36);
      expect(resOver.headers['x-request-id']).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });

    it('accepts safe characters over HTTP wire (alphanumeric, hyphens, underscores, dots, colons)', async () => {
      const safeCustomIds = [
        'trace-123.456_789:serviceA',
        'ABCDEF-abcdef-0123456789',
        'client.req.id:v1_final',
        '00000000-0000-4000-8000-000000000000',
      ];

      for (const safeId of safeCustomIds) {
        const res = await request(app)
          .get('/test-header')
          .set('X-Request-ID', safeId);

        expect(res.status).toBe(200);
        expect(res.headers['x-request-id']).toBe(safeId);
        expect(res.body.requestId).toBe(safeId);
      }
    });

    it('rejects whitespace-only or empty header values over HTTP wire', async () => {
      const emptyHeaders = ['', ' ', '   \t   '];

      for (const emptyVal of emptyHeaders) {
        const res = await request(app)
          .get('/test-header')
          .set('X-Request-ID', emptyVal);

        expect(res.status).toBe(200);
        const headerId = res.headers['x-request-id'];
        expect(headerId.length).toBe(36);
        expect(headerId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
      }
    });

    it('guarantees NDJSON log formatting remains valid single-line JSON under malicious inputs', async () => {
      const appWithLogging = express();
      appWithLogging.use(requestIdMiddleware);
      appWithLogging.get('/test-log-injection', (req, res) => {
        logger.info('Log inside request with potential injection chars: \r\n{"fake":"log"}\n', {
          maliciousKey: 'val\r\n\t"break":true',
        });
        res.status(200).send('OK');
      });

      await request(appWithLogging)
        .get('/test-log-injection')
        .set('X-Request-ID', 'safe-header-inject-test');

      // Verify all lines in captured logs are valid individual JSON objects
      for (const rawLine of capturedLogs) {
        const trimmed = rawLine.trim();
        if (!trimmed) continue;
        // Every single line MUST parse cleanly as JSON with no multi-line breakage
        expect(() => JSON.parse(trimmed)).not.toThrow();
        const parsed = JSON.parse(trimmed);
        expect(parsed.timestamp).toBeDefined();
        expect(typeof parsed.level).toBe('number');
      }
    });
  });

  // =========================================================================
  // Section 3: WebSocket Tracing & Signaling Concurrency Stress Tests
  // =========================================================================
  describe('WebSocket Tracing & Signaling Concurrency Stress Tests', () => {
    let httpServer: any;
    let io: SocketIOServer;
    let port: number;
    let clientSockets: ClientSocketType[] = [];

    beforeEach(async () => {
      clientSockets = [];

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

    it('isolates traceId across 30 concurrent WebSocket connections with mixed handshake sources', async () => {
      const totalClients = 30;
      const expectedTraceIds = new Map<number, string>();

      const connectionPromises = Array.from({ length: totalClients }, async (_, i) => {
        const userId = `concurrent-ws-user-${i}`;
        let client: ClientSocketType;

        if (i < 10) {
          // auth.traceId
          const customTrace = `auth-trace-${i}-xyz`;
          expectedTraceIds.set(i, customTrace);
          client = ClientSocket(`http://localhost:${port}`, {
            auth: { userId, traceId: customTrace },
            transports: ['websocket'],
          });
        } else if (i < 20) {
          // headers.x-trace-id
          const customTrace = `header-x-trace-${i}-xyz`;
          expectedTraceIds.set(i, customTrace);
          client = ClientSocket(`http://localhost:${port}`, {
            auth: { userId },
            extraHeaders: { 'x-trace-id': customTrace },
            transports: ['websocket'],
          });
        } else {
          // no traceId supplied (should generate UUIDv4)
          client = ClientSocket(`http://localhost:${port}`, {
            auth: { userId },
            transports: ['websocket'],
          });
        }

        clientSockets.push(client);
        return new Promise<void>((resolve, reject) => {
          client.on('connect', () => resolve());
          client.on('connect_error', (err) => reject(err));
        });
      });

      await Promise.all(connectionPromises);

      // Verify logs captured distinct traceIds for all 30 clients
      const authLogs = capturedLogs
        .map((s) => {
          try {
            return JSON.parse(s.trim());
          } catch {
            return null;
          }
        })
        .filter((entry) => entry && entry.context?.event === 'socket:auth_success');

      expect(authLogs.length).toBe(totalClients);

      for (let i = 0; i < totalClients; i++) {
        const userId = `concurrent-ws-user-${i}`;
        const userLog = authLogs.find((l) => l.context?.userId === userId);
        expect(userLog).toBeDefined();

        if (expectedTraceIds.has(i)) {
          expect(userLog?.context?.traceId).toBe(expectedTraceIds.get(i));
        } else {
          expect(userLog?.context?.traceId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
        }
      }
    });

    it('properly tracks and isolates rapid interleaved signaling packets across concurrent rooms', async () => {
      // Create 4 clients in 2 separate rooms (2 clients per room)
      const clients: ClientSocketType[] = [];
      const userIds = ['alice-r1', 'bob-r1', 'charlie-r2', 'david-r2'];
      const traces = ['trace-alice-1', 'trace-bob-1', 'trace-charlie-2', 'trace-david-2'];

      for (let i = 0; i < 4; i++) {
        const client = ClientSocket(`http://localhost:${port}`, {
          auth: { userId: userIds[i], traceId: traces[i] },
          transports: ['websocket'],
        });
        clientSockets.push(client);
        clients.push(client);
      }

      await Promise.all(
        clients.map(
          (c) =>
            new Promise<void>((resolve) => {
              c.on('connect', () => resolve());
            })
        )
      );

      // We can manually test signaling message routing and requestId correlation
      const receivedPacketsAlice: any[] = [];
      const receivedPacketsCharlie: any[] = [];

      clients[0].on('candidate', (data) => receivedPacketsAlice.push(data));
      clients[2].on('candidate', (data) => receivedPacketsCharlie.push(data));

      // Rapidly fire packets from bob (room1) and david (room2)
      const packetCount = 20;
      for (let p = 0; p < packetCount; p++) {
        clients[1].emit('candidate', {
          roomName: 'room-1',
          requestId: `bob-req-${p}`,
          candidate: { sdpMid: 'audio', candidate: `cand-bob-${p}` },
        });

        clients[3].emit('candidate', {
          roomName: 'room-2',
          requestId: `david-req-${p}`,
          candidate: { sdpMid: 'audio', candidate: `cand-david-${p}` },
        });

        // Also test packets WITHOUT custom requestId
        clients[1].emit('candidate', {
          roomName: 'room-1',
          candidate: { sdpMid: 'video', candidate: `cand-bob-auto-${p}` },
        });
      }

      // Allow packet processing
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Parse captured packet logs
      const candidateLogs = capturedLogs
        .map((s) => {
          try {
            return JSON.parse(s.trim());
          } catch {
            return null;
          }
        })
        .filter((entry) => entry && (entry.context?.event === 'webrtc:candidate' || entry.context?.event === 'socket:candidate'));

      expect(candidateLogs.length).toBeGreaterThanOrEqual(packetCount * 3);

      // Verify that bob's candidate logs always have traceId = trace-bob-1 and bob's user
      const bobLogs = candidateLogs.filter((l) => l.context?.userId === 'bob-r1');
      expect(bobLogs.length).toBeGreaterThan(0);
      for (const log of bobLogs) {
        expect(log.context.traceId).toBe('trace-bob-1');
        expect(log.context.requestId).toBeDefined();
      }

      // Verify that david's candidate logs always have traceId = trace-david-2 and david's user
      const davidLogs = candidateLogs.filter((l) => l.context?.userId === 'david-r2');
      expect(davidLogs.length).toBeGreaterThan(0);
      for (const log of davidLogs) {
        expect(log.context.traceId).toBe('trace-david-2');
        expect(log.context.requestId).toBeDefined();
      }

      // Verify that each custom requestId was correctly tracked
      const sampleBobLog = bobLogs.find((l) => l.context?.requestId === 'bob-req-5');
      expect(sampleBobLog).toBeDefined();
      expect(sampleBobLog?.context?.traceId).toBe('trace-bob-1');

      const sampleDavidLog = davidLogs.find((l) => l.context?.requestId === 'david-req-5');
      expect(sampleDavidLog).toBeDefined();
      expect(sampleDavidLog?.context?.traceId).toBe('trace-david-2');
    });

    it('handles malformed, null, or corrupted signaling payloads gracefully without server crash', async () => {
      const client = ClientSocket(`http://localhost:${port}`, {
        auth: { userId: 'malformed-test-user', traceId: 'trace-malformed-user' },
        transports: ['websocket'],
      });
      clientSockets.push(client);

      await new Promise<void>((resolve) => {
        client.on('connect', () => resolve());
      });

      // Send malformed payloads across all signaling event types
      const badPayloads = [null, undefined, '', 12345, true, [], {}, { roomName: 123 }, { roomName: '' }];

      for (const payload of badPayloads) {
        client.emit('offer', payload);
        client.emit('answer', payload);
        client.emit('candidate', payload);
        client.emit('leave', payload);
        client.emit('toggle_record', payload);
      }

      await new Promise((resolve) => setTimeout(resolve, 80));

      // Socket must remain connected and responsive
      expect(client.connected).toBe(true);

      // Client can still send a valid payload afterwards
      client.emit('leave', { roomName: 'valid-room', requestId: 'req-after-malformed' });

      await new Promise((resolve) => setTimeout(resolve, 50));

      const logs = capturedLogs.map((s) => {
        try {
          return JSON.parse(s.trim());
        } catch {
          return null;
        }
      });

      const recoveredLog = logs.find((l) => l?.context?.requestId === 'req-after-malformed');
      expect(recoveredLog).toBeDefined();
      expect(recoveredLog.context.traceId).toBe('trace-malformed-user');
    });
  });
});
