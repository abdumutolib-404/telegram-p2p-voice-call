import { describe, it, expect } from 'vitest';
import assert from 'node:assert';
import crypto from 'node:crypto';
import express from 'express';
import request from 'supertest';
import {
  logger,
  StructuredLogger,
  redactSensitiveData,
  redactString,
  getRecentErrors,
  clearRecentErrors,
  LOG_LEVEL_SEVERITY,
} from '../utils/logger';
import {
  requestContextStorage,
  getRequestContext,
  getRequestId,
  getUserId,
  setRequestContextUserId,
  updateRequestContext,
  runWithRequestContext,
} from '../utils/requestContext';
import { requestIdMiddleware } from '../middleware/requestId';

describe('Auditor Independent Forensic Integrity Audit Suite (M4)', () => {
  describe('1. PII Redaction Engine Verification', () => {
    it('redacts all known sensitive keys in nested object hierarchy', () => {
      const raw = {
        user: 'alice',
        password: 'mypassword',
        token: 'tok-123',
        botToken: 'bot-456',
        secret: 'sec-789',
        authorization: 'Bearer auth-111',
        cookie: 'cookie-222',
        initData: 'init-333',
        card: 'card-444',
        cardNumber: 'card-555',
        cvv: '123',
        pan: 'pan-666',
        pin: '0000',
        privateKey: 'pk-777',
        accessToken: 'at-888',
        refreshToken: 'rt-999',
        apiKey: 'key-000',
        nested: {
          password: 'nested-secret-pass',
          deep: {
            token: 'deep-secret-token',
            safeField: 'normal-data',
          },
        },
      };

      const sanitized: any = redactSensitiveData(raw);
      expect(sanitized.user).toBe('alice');
      expect(sanitized.password).toBe('[REDACTED]');
      expect(sanitized.token).toBe('[REDACTED]');
      expect(sanitized.botToken).toBe('[REDACTED]');
      expect(sanitized.secret).toBe('[REDACTED]');
      expect(sanitized.authorization).toBe('[REDACTED]');
      expect(sanitized.cookie).toBe('[REDACTED]');
      expect(sanitized.initData).toBe('[REDACTED]');
      expect(sanitized.card).toBe('[REDACTED]');
      expect(sanitized.cardNumber).toBe('[REDACTED]');
      expect(sanitized.cvv).toBe('[REDACTED]');
      expect(sanitized.pan).toBe('[REDACTED]');
      expect(sanitized.pin).toBe('[REDACTED]');
      expect(sanitized.privateKey).toBe('[REDACTED]');
      expect(sanitized.accessToken).toBe('[REDACTED]');
      expect(sanitized.refreshToken).toBe('[REDACTED]');
      expect(sanitized.apiKey).toBe('[REDACTED]');
      expect(sanitized.nested.password).toBe('[REDACTED]');
      expect(sanitized.nested.deep.token).toBe('[REDACTED]');
      expect(sanitized.nested.deep.safeField).toBe('normal-data');
    });

    it('redacts regex token patterns in unstructured strings', () => {
      const botMsg = 'Connecting bot 1234567890:AAFlkj9834kjhkjfds_lkjsdf098324kjh to Telegram API';
      const jwtMsg = 'Header authorization eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.someSignature-with_padding validated';
      const initDataMsg = 'Auth with query_id=AAHdF6IQAAAAAN0XohDhrOrc&user=%7B%22id%22%3A12345678%7D&hash=d87e07a34658ff9d71c841369ae5bc18b284e91851e44208ff952df7183';
      const cardMsg = 'Processed card 8600 1234 5678 9012 for payment';

      expect(redactString(botMsg)).toContain('[REDACTED_BOT_TOKEN]');
      expect(redactString(botMsg)).not.toContain('1234567890:AAFlkj9834kjhkjfds_lkjsdf098324kjh');

      expect(redactString(jwtMsg)).toContain('[REDACTED_JWT]');
      expect(redactString(jwtMsg)).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');

      expect(redactString(initDataMsg)).toContain('[REDACTED_INIT_DATA]');
      expect(redactString(initDataMsg)).not.toContain('AAHdF6IQAAAAAN0XohDhrOrc');

      expect(redactString(cardMsg)).toContain('[REDACTED_CARD]');
      expect(redactString(cardMsg)).not.toContain('8600 1234 5678 9012');
    });

    it('breaks circular references safely without infinite recursion', () => {
      const objA: any = { name: 'nodeA' };
      const objB: any = { name: 'nodeB', refA: objA };
      objA.refB = objB;

      const sanitized: any = redactSensitiveData(objA);
      expect(sanitized.name).toBe('nodeA');
      expect(sanitized.refB.name).toBe('nodeB');
      expect(sanitized.refB.refA).toBe('[Circular]');
    });

    it('serializes Buffer, BigInt, Date, and Error safely', () => {
      const err = new Error('Database connection failed');
      err.name = 'PrismaClientKnownRequestError';
      (err as any).code = 'P2002';

      const raw = {
        buffer: Buffer.from('audio_bytes'),
        bigint: BigInt(9007199254740991),
        date: new Date('2026-09-02T22:00:00.000Z'),
        error: err,
      };

      const sanitized: any = redactSensitiveData(raw);
      expect(sanitized.buffer).toBe('[Buffer 11 bytes]');
      expect(sanitized.bigint).toBe('9007199254740991');
      expect(sanitized.date).toBe('2026-09-02T22:00:00.000Z');
      expect(sanitized.error.name).toBe('PrismaClientKnownRequestError');
      expect(sanitized.error.message).toBe('Database connection failed');
      expect(sanitized.error.code).toBe('P2002');
    });
  });

  describe('2. AsyncLocalStorage RequestContext Verification', () => {
    it('maintains strict context isolation across 500 concurrent async operations with delays', async () => {
      const tasks = Array.from({ length: 500 }, (_, i) => {
        const reqId = `req-concurrent-${i}`;
        const userId = `user-concurrent-${i}`;
        const clientIp = `192.168.1.${i % 255}`;

        return runWithRequestContext(
          { requestId: reqId, userId, clientIp, service: 'api' },
          async () => {
            await new Promise((resolve) => setTimeout(resolve, Math.floor(Math.random() * 15)));
            expect(getRequestId()).toBe(reqId);
            expect(getUserId()).toBe(userId);

            updateRequestContext({ stage: `stage_${i}` });
            await new Promise((resolve) => setTimeout(resolve, Math.floor(Math.random() * 15)));

            const ctx = getRequestContext();
            expect(ctx?.requestId).toBe(reqId);
            expect(ctx?.userId).toBe(userId);
            expect(ctx?.clientIp).toBe(clientIp);
            expect(ctx?.stage).toBe(`stage_${i}`);
          }
        );
      });

      await Promise.all(tasks);
    });

    it('returns undefined outside active storage without throwing', () => {
      expect(getRequestContext()).toBeUndefined();
      expect(getRequestId()).toBeUndefined();
      expect(getUserId()).toBeUndefined();
      expect(() => setRequestContextUserId('nobody')).not.toThrow();
      expect(() => updateRequestContext({ test: 123 })).not.toThrow();
    });
  });

  describe('3. StructuredLogger Architecture Verification', () => {
    it('emits structured NDJSON with required fields and correct numeric severity', () => {
      let captured = '';
      const stdoutWrite = process.stdout.write;
      process.stdout.write = (chunk: any) => {
        captured += chunk.toString();
        return true;
      };

      try {
        const testLogger = new StructuredLogger({ service: 'voice_sfu' });
        testLogger.setLevel('debug');
        testLogger.info('User joined room', { event: 'room_joined', roomId: 'r-101' });

        expect(captured.endsWith('\n')).toBe(true);
        const parsed = JSON.parse(captured.trim());
        expect(parsed.level).toBe(20);
        expect(parsed.levelName).toBe('info');
        expect(parsed.service).toBe('voice_sfu');
        expect(parsed.msg).toBe('User joined room');
        expect(parsed.context.event).toBe('room_joined');
        expect(parsed.context.roomId).toBe('r-101');
        expect(new Date(parsed.time).getTime()).toBeGreaterThan(0);
      } finally {
        process.stdout.write = stdoutWrite;
      }
    });

    it('routes error and fatal logs to process.stderr and debug/info/warn to process.stdout', () => {
      let stdoutBuf = '';
      let stderrBuf = '';
      const stdoutWrite = process.stdout.write;
      const stderrWrite = process.stderr.write;

      process.stdout.write = (chunk: any) => {
        stdoutBuf += chunk.toString();
        return true;
      };
      process.stderr.write = (chunk: any) => {
        stderrBuf += chunk.toString();
        return true;
      };

      try {
        const testLogger = new StructuredLogger();
        testLogger.setLevel('debug');

        testLogger.debug('d_msg');
        testLogger.info('i_msg');
        testLogger.warn('w_msg');
        testLogger.error('e_msg');
        testLogger.fatal('f_msg');

        const stdoutEntries = stdoutBuf.trim().split('\n').map((l) => JSON.parse(l).levelName);
        const stderrEntries = stderrBuf.trim().split('\n').map((l) => JSON.parse(l).levelName);

        expect(stdoutEntries).toEqual(['debug', 'info', 'warn']);
        expect(stderrEntries).toEqual(['error', 'fatal']);
      } finally {
        process.stdout.write = stdoutWrite;
        process.stderr.write = stderrWrite;
      }
    });

    it('captures errors in the ring buffer up to 100 entries and drops oldest on overflow', () => {
      const testLogger = new StructuredLogger();
      testLogger.clearRecentErrors();

      expect(testLogger.getRecentErrors().length).toBe(0);

      for (let i = 0; i < 150; i++) {
        testLogger.error(`Error msg ${i}`, { index: i }, new Error(`Err obj ${i}`));
      }

      const errors = testLogger.getRecentErrors();
      expect(errors.length).toBe(100);
      expect(errors[0].msg).toBe('Error msg 50');
      expect(errors[99].msg).toBe('Error msg 149');
      expect(errors[99].error?.message).toBe('Err obj 149');

      testLogger.clearRecentErrors();
      expect(testLogger.getRecentErrors().length).toBe(0);
    });
  });

  describe('4. HTTP Middleware & Express Integration Verification', () => {
    it('generates UUIDv4, populates AsyncLocalStorage, and sets X-Request-ID response header', async () => {
      const app = express();
      app.use(requestIdMiddleware);
      app.get('/test-mw', (req, res) => {
        res.json({
          reqId: getRequestId(),
          userId: getUserId(),
          context: getRequestContext(),
        });
      });

      const res = await request(app).get('/test-mw');
      expect(res.status).toBe(200);
      const headerId = res.headers['x-request-id'];
      expect(headerId).toBeDefined();
      expect(res.body.reqId).toBe(headerId);
      expect(res.body.context.requestId).toBe(headerId);
      expect(res.body.context.service).toBe('api');
    });

    it('sanitizes headers and falls back safely on excessively long values', async () => {
      const app = express();
      app.use(requestIdMiddleware);
      app.get('/test-sanitize', (req, res) => {
        res.json({ reqId: getRequestId() });
      });

      const validCustom = 'custom-trace-id-123.456:abc';
      const res1 = await request(app).get('/test-sanitize').set('X-Request-ID', validCustom);
      expect(res1.status).toBe(200);
      expect(res1.headers['x-request-id']).toBe(validCustom);
      expect(res1.body.reqId).toBe(validCustom);

      const longId = 'a'.repeat(200);
      const res2 = await request(app).get('/test-sanitize').set('X-Request-ID', longId);
      expect(res2.status).toBe(200);
      expect(res2.headers['x-request-id']).not.toBe(longId);
      expect(res2.headers['x-request-id'].length).toBeLessThanOrEqual(36);
    });
  });
});
