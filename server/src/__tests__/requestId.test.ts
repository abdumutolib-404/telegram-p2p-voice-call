import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { requestIdMiddleware } from '../middleware/requestId';
import { getRequestContext, getRequestId, getUserId, setRequestContextUserId } from '../utils/requestContext';
import { logger } from '../utils/logger';

describe('HTTP Correlation & Request ID Middleware Unit & Integration Tests', () => {
  let stdoutWriteSpy: any;
  let capturedStdout: string[] = [];

  beforeEach(() => {
    capturedStdout = [];
    stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: any) => {
      capturedStdout.push(chunk.toString());
      return true;
    });
  });

  afterEach(() => {
    stdoutWriteSpy.mockRestore();
  });

  it('generates a valid UUIDv4 when no X-Request-ID header is supplied', async () => {
    const app = express();
    app.use(requestIdMiddleware);
    app.get('/test', (req, res) => {
      const activeCtx = getRequestContext();
      res.json({
        reqIdProperty: (req as any).id,
        contextRequestId: getRequestId(),
        contextStore: activeCtx,
      });
    });

    const res = await request(app).get('/test');

    expect(res.status).toBe(200);
    const responseHeaderId = res.headers['x-request-id'];
    expect(responseHeaderId).toBeDefined();
    // Verify UUIDv4 format
    expect(responseHeaderId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);

    expect(res.body.reqIdProperty).toBe(responseHeaderId);
    expect(res.body.contextRequestId).toBe(responseHeaderId);
    expect(res.body.contextStore.requestId).toBe(responseHeaderId);
    expect(res.body.contextStore.service).toBe('api');
  });

  it('reuses and preserves valid inbound X-Request-ID or X-Correlation-ID header', async () => {
    const app = express();
    app.use(requestIdMiddleware);
    app.get('/test-reuse', (req, res) => {
      res.json({ requestId: getRequestId() });
    });

    const customId = 'client-trace-abc-12345';
    const res = await request(app)
      .get('/test-reuse')
      .set('X-Request-ID', customId);

    expect(res.status).toBe(200);
    expect(res.headers['x-request-id']).toBe(customId);
    expect(res.body.requestId).toBe(customId);
  });

  it('falls back to X-Correlation-ID when X-Request-ID is absent', async () => {
    const app = express();
    app.use(requestIdMiddleware);
    app.get('/test-correlation', (req, res) => {
      res.json({ requestId: getRequestId() });
    });

    const correlationId = 'correlation-trace-789';
    const res = await request(app)
      .get('/test-correlation')
      .set('X-Correlation-ID', correlationId);

    expect(res.status).toBe(200);
    expect(res.headers['x-request-id']).toBe(correlationId);
    expect(res.body.requestId).toBe(correlationId);
  });

  it('sanitizes invalid characters and truncates excessively long header values', async () => {
    const app = express();
    app.use(requestIdMiddleware);
    app.get('/test-sanitize', (req, res) => {
      res.json({ requestId: getRequestId() });
    });

    // Inbound with illegal characters like semicolons, quotes, control chars, and > 128 chars
    const dirtyId = 'dirty_id!@#$%^&*()_+' + 'a'.repeat(200);
    const res = await request(app)
      .get('/test-sanitize')
      .set('X-Request-ID', dirtyId);

    expect(res.status).toBe(200);
    const sanitizedId = res.headers['x-request-id'];
    expect(sanitizedId.length).toBeLessThanOrEqual(128);
    expect(sanitizedId).toMatch(/^[a-zA-Z0-9_-]+$/);
  });

  it('allows downstream middleware to enrich context with userId via setRequestContextUserId', async () => {
    const app = express();
    app.use(requestIdMiddleware);
    app.use((req, res, next) => {
      // Simulate auth middleware populating user
      setRequestContextUserId('user_db_42');
      next();
    });
    app.get('/test-user-context', (req, res) => {
      res.json({
        userId: getUserId(),
        context: getRequestContext(),
      });
    });

    const res = await request(app).get('/test-user-context');
    expect(res.status).toBe(200);
    expect(res.body.userId).toBe('user_db_42');
    expect(res.body.context.userId).toBe('user_db_42');
  });

  it('emits structured NDJSON completion log on request completion', async () => {
    const app = express();
    app.use(requestIdMiddleware);
    app.get('/test-log-finish', (req, res) => {
      res.status(200).send('OK');
    });

    await request(app).get('/test-log-finish');

    // Check stdout captures
    const httpLogs = capturedStdout
      .map((s) => {
        try {
          return JSON.parse(s.trim());
        } catch {
          return null;
        }
      })
      .filter((entry) => entry && entry.context?.event === 'http_request');

    expect(httpLogs.length).toBeGreaterThanOrEqual(1);
    const log = httpLogs[0];
    expect(log.levelName).toBe('info');
    expect(log.context.method).toBe('GET');
    expect(log.context.path).toBe('/test-log-finish');
    expect(log.context.statusCode).toBe(200);
    expect(log.context.durationMs).toBeGreaterThanOrEqual(0);
    expect(log.context.requestId).toBeDefined();
    expect(log.msg).toContain('HTTP GET /test-log-finish -> 200');
  });
});
