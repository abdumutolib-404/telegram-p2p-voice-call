import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  logger,
  StructuredLogger,
  redactSensitiveData,
  redactString,
  getRecentErrors,
  clearRecentErrors,
  type LogContext,
} from '../utils/logger';
import { runWithRequestContext } from '../utils/requestContext';

describe('M4 Adversarial Challenge: PII Redaction & Structured Logger Stress Suite', () => {
  let stdoutWriteSpy: any;
  let stderrWriteSpy: any;
  let capturedStdout: string[] = [];
  let capturedStderr: string[] = [];

  beforeEach(() => {
    capturedStdout = [];
    capturedStderr = [];
    clearRecentErrors();

    stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: any) => {
      capturedStdout.push(chunk.toString());
      return true;
    });

    stderrWriteSpy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: any) => {
      capturedStderr.push(chunk.toString());
      return true;
    });
  });

  afterEach(() => {
    stdoutWriteSpy.mockRestore();
    stderrWriteSpy.mockRestore();
    clearRecentErrors();
  });

  // =========================================================================
  // 1. DEEPLY NESTED STRUCTURES & COMPLEX OBJECT GRAPHS (>8 LEVELS & CYCLES)
  // =========================================================================
  describe('1. Deeply Nested Structures & Complex Graph Cycles', () => {
    it('handles extreme nesting depth (>8 levels, up to 100 levels) safely without stack overflow', () => {
      let current: any = { secretToken: '1234567890:AAFlkj9834kjhkjfds_lkjsdf098324kjh', level: 100 };
      for (let i = 99; i >= 0; i--) {
        current = { depth: i, next: current, token: `tok_${i}` };
      }

      // Should not throw stack overflow
      const sanitized = redactSensitiveData(current) as any;
      expect(sanitized).toBeDefined();

      // Check depth capping at >8
      let node = sanitized;
      let depthCount = 0;
      while (node && typeof node === 'object' && node.next) {
        depthCount++;
        node = node.next;
      }
      expect(node).toBe('[Max Depth Exceeded]');
      expect(depthCount).toBeLessThanOrEqual(9);
    });

    it('safely handles multi-node circular cycles (A -> B -> C -> A)', () => {
      const a: any = { name: 'nodeA', token: 'secret_a' };
      const b: any = { name: 'nodeB', token: 'secret_b' };
      const c: any = { name: 'nodeC', token: 'secret_c' };
      a.refB = b;
      b.refC = c;
      c.refA = a;

      const sanitized: any = redactSensitiveData(a);
      expect(sanitized.name).toBe('nodeA');
      expect(sanitized.token).toBe('[REDACTED]');
      expect(sanitized.refB.name).toBe('nodeB');
      expect(sanitized.refB.token).toBe('[REDACTED]');
      expect(sanitized.refB.refC.name).toBe('nodeC');
      expect(sanitized.refB.refC.token).toBe('[REDACTED]');
      expect(sanitized.refB.refC.refA).toBe('[Circular]');
    });

    it('safely handles circular arrays and array-object mixed cycles', () => {
      const arr1: any[] = [1, 2];
      const arr2: any[] = [3, arr1];
      arr1.push(arr2);

      const sanitized: any = redactSensitiveData(arr1);
      expect(Array.isArray(sanitized)).toBe(true);
      expect(sanitized[0]).toBe(1);
      expect(sanitized[1]).toBe(2);
      expect(sanitized[2][0]).toBe(3);
      expect(sanitized[2][1]).toBe('[Circular]');
    });

    it('safely handles circular Map and Set structures', () => {
      const map = new Map<string, any>();
      map.set('name', 'CycleMap');
      map.set('password', 'superSecretPass');
      map.set('self', map);

      const sanitizedMap: any = redactSensitiveData(map);
      expect(sanitizedMap.name).toBe('CycleMap');
      expect(sanitizedMap.password).toBe('[REDACTED]');
      expect(sanitizedMap.self).toBe('[Circular]');

      const set = new Set<any>();
      const nestedObj = { key: 'val', setRef: set };
      set.add('entry1');
      set.add(nestedObj);

      const sanitizedSet: any = redactSensitiveData(set);
      expect(Array.isArray(sanitizedSet)).toBe(true);
      expect(sanitizedSet[0]).toBe('entry1');
      expect(sanitizedSet[1].key).toBe('val');
      expect(sanitizedSet[1].setRef).toBe('[Circular]');
    });

    it('safely handles DAG / Diamond shared reference structures without leaking', () => {
      const sharedLeaf = { botToken: '1234567890:AAFlkj9834kjhkjfds_lkjsdf098324kjh', data: 'shared' };
      const root = {
        branchA: { item: sharedLeaf },
        branchB: { item: sharedLeaf },
      };

      const sanitized: any = redactSensitiveData(root);
      expect(sanitized.branchA.item.botToken).toBe('[REDACTED]');
      expect(sanitized.branchA.item.data).toBe('shared');
      expect(['[Circular]', '[REDACTED]']).toContain(
        typeof sanitized.branchB.item === 'string'
          ? sanitized.branchB.item
          : sanitized.branchB.item.botToken
      );
    });
  });

  // =========================================================================
  // 2. OBFUSCATED & VARIANT SECRET PATTERNS REDACTION
  // =========================================================================
  describe('2. Obfuscated & Variant Token Patterns', () => {
    it('redacts Telegram bot tokens across various id lengths (8-12 digits) and delimiters', () => {
      const tokens = [
        '12345678:ABCdefGhIJKlmNoPQRsTUVwxyZ_1234567', // 8-digit ID
        '123456789:AAFlkj9834kjhkjfds_lkjsdf098324kjh', // 9-digit ID
        '7123456789:AAFlkj9834kjhkjfds_lkjsdf098324kjh', // 10-digit ID
        '12345678901:AAFlkj9834kjhkjfds_lkjsdf098324kjh', // 11-digit ID
        '123456789012:AAFlkj9834kjhkjfds_lkjsdf098324kjh', // 12-digit ID
      ];

      for (const token of tokens) {
        const msg = `Error talking to Telegram bot: token=${token} failed on request`;
        const redacted = redactString(msg);
        expect(redacted).not.toContain(token);
        expect(redacted).toContain('[REDACTED_BOT_TOKEN]');
      }
    });

    it('redacts bot tokens wrapped in punctuation, quotes, brackets, and parentheses', () => {
      const token = '1234567890:AAFlkj9834kjhkjfds_lkjsdf098324kjh';
      const tests = [
        `("${token}")`,
        `['${token}']`,
        `{"token":"${token}"}`,
        `bot_token:${token};`,
        `<${token}>`,
        `${token},`,
      ];

      for (const t of tests) {
        const redacted = redactString(t);
        expect(redacted).not.toContain(token);
        expect(redacted).toContain('[REDACTED_BOT_TOKEN]');
      }
    });

    it('redacts standard signed JWT tokens with HS256, RS256, and base64url payloads', () => {
      const jwtList = [
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.someSignature-with_padding',
        'eyJhbGciOiJSUzI1NiIsImtpZCI6IjEyMzQ1In0.eyJpc3MiOiJhdXRoMCIsImF1ZCI6ImFwaSJ9.c2lnbmF0dXJlX2hlcmVfd2l0aF91bmRlcnNjb3Jl',
      ];

      for (const jwt of jwtList) {
        const text = `User JWT session: ${jwt} authenticated`;
        const redacted = redactString(text);
        expect(redacted).not.toContain(jwt);
        expect(redacted).toContain('[REDACTED_JWT]');
      }
    });

    it('redacts Telegram WebApp initData query strings with standard parameters', () => {
      const initDataCases = [
        'query_id=AAHdF6IQAAAAAN0XohDhrOrc&user=%7B%22id%22%3A12345678%22first_name%22%3A%22Alice%22%7D&auth_date=1710000000&hash=d87e07a34658ff9d71c841369ae5bc18b284e91851e44208ff952df7183',
        'user=%7B%22id%22%3A999%7D&chat_type=sender&chat_instance=-123456789&auth_date=1710000000&hash=abcdef0123456789abcdef0123456789',
        'query_id=123&user=%7B%7D&hash=0123456789abcdef',
      ];

      for (const initStr of initDataCases) {
        const raw = `Authenticating WebApp connection with initData: ${initStr} end of payload`;
        const redacted = redactString(raw);
        expect(redacted).not.toContain(initStr);
        expect(redacted).toContain('[REDACTED_INIT_DATA]');
      }
    });

    it('redacts Bearer authorization header values including complex base64 symbols and JWTs', () => {
      const bearerHeaders = [
        { raw: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.t-IDcSemACt8x4iTMCda8Yhe3iZaWbvV5XKSTbuAn0M', expected: 'Bearer [REDACTED_JWT]' },
        { raw: 'Bearer secret_custom_token_12345', expected: 'Bearer [REDACTED_TOKEN]' },
        { raw: 'Bearer aHR0cHM6Ly9leGFtcGxlLmNvbS9hdXRoL3Rva2VuP2tleT1hYmMxMjM=', expected: 'Bearer [REDACTED_TOKEN]' },
      ];

      for (const { raw, expected } of bearerHeaders) {
        const text = `HTTP Request Authorization header: ${raw}`;
        const redacted = redactString(text);
        expect(redacted).toContain(expected);
        expect(redacted).not.toContain('secret_custom_token_12345');
      }
    });

    it('redacts credit card PAN numbers across 13-19 digits with spaces, hyphens, or compact format', () => {
      const cards = [
        '4532 0150 1234 5678', // Visa
        '4532-0150-1234-5678',
        '4532015012345678',
        '3782 822463 10005',   // Amex 15-digit
        '6011 1111 1111 1111', // Discover
      ];

      for (const card of cards) {
        const text = `Billing attempted with card number: ${card} on gateway`;
        const redacted = redactString(text);
        expect(redacted).not.toContain(card);
        expect(redacted).toContain('[REDACTED_CARD]');
      }
    });

    it('redacts sensitive key variations (camelCase, snake_case, kebab-case, ALLCAPS)', () => {
      const payload = {
        API_KEY: 'sensitive_1',
        api_key: 'sensitive_2',
        'api-key': 'sensitive_3',
        apiKey: 'sensitive_4',
        bot_token: 'sensitive_5',
        'bot-token': 'sensitive_6',
        BOTTOKEN: 'sensitive_7',
        livekit_secret: 'sensitive_8',
        's3-secret': 'sensitive_9',
        masterPassword: 'sensitive_10',
        AdminSession: 'sensitive_11',
        X_TELEGRAM_INIT_DATA: 'sensitive_12',
        TgWebAppData: 'sensitive_13',
        Card_Details: 'sensitive_14',
        otp_hash: 'sensitive_15',
        verification_code: 'sensitive_16',
      };

      const sanitized = redactSensitiveData(payload) as Record<string, unknown>;
      for (const [key, value] of Object.entries(sanitized)) {
        expect(value, `Key "${key}" failed to be redacted`).toBe('[REDACTED]');
      }
    });

    // CHALLENGER DISCOVERY: Tests documenting edge case vulnerabilities for hardening
    it('[CHALLENGE EVIDENCE] Demonstrates Telegram URL bot token leak without boundary fix', () => {
      const url = 'https://api.telegram.org/bot1234567890:AAFlkj9834kjhkjfds_lkjsdf098324kjh/sendMessage';
      const redacted = redactString(url);
      // Because \b between 't' and '1' is not a word boundary, url retains the token
      const isLeaked = redacted.includes('1234567890:AAFlkj9834kjhkjfds_lkjsdf098324kjh');
      expect(isLeaked).toBe(true);
    });

    it('[CHALLENGE EVIDENCE] Demonstrates compound key omission in exact-match Set', () => {
      const obj = {
        secretKey: 'my_super_secret',
        clientSecret: 'my_client_secret',
      };
      const sanitized: any = redactSensitiveData(obj);
      // Demonstrates that secretKey is not in REDACTED_KEYS exact match set
      expect(sanitized.secretKey).toBe('my_super_secret');
      expect(sanitized.clientSecret).toBe('my_client_secret');
    });
  });

  // =========================================================================
  // 3. UNUSUAL JAVASCRIPT TYPES & EDGE OBJECTS
  // =========================================================================
  describe('3. Exotic JS Types & Unconventional Inputs', () => {
    it('safely serializes BigInt values without throwing TypeError', () => {
      const bigIntValue = BigInt('90071992547409923456789');
      const payload = {
        userId: bigIntValue,
        nested: { count: BigInt(0), negative: BigInt(-42) },
      };

      const sanitized: any = redactSensitiveData(payload);
      expect(sanitized.userId).toBe('90071992547409923456789');
      expect(sanitized.nested.count).toBe('0');
      expect(sanitized.nested.negative).toBe('-42');

      // Ensure JSON.stringify produces valid JSON
      expect(() => JSON.stringify(sanitized)).not.toThrow();
    });

    it('safely serializes Buffer instances with byte count preview', () => {
      const buf = Buffer.from('sensitive_audio_stream_pcm_data_001122');
      const payload = {
        audioChunk: buf,
        emptyBuffer: Buffer.alloc(0),
        largeBuffer: Buffer.alloc(1024 * 1024),
      };

      const sanitized: any = redactSensitiveData(payload);
      expect(sanitized.audioChunk).toBe(`[Buffer ${buf.length} bytes]`);
      expect(sanitized.emptyBuffer).toBe('[Buffer 0 bytes]');
      expect(sanitized.largeBuffer).toBe('[Buffer 1048576 bytes]');
      expect(JSON.stringify(sanitized)).not.toContain('sensitive_audio_stream');
    });

    it('safely formats Date objects as ISO strings', () => {
      const now = new Date('2026-09-02T22:50:00.000Z');
      const payload = {
        createdAt: now,
        nested: { date: new Date('2025-01-01T00:00:00.000Z') },
      };

      const sanitized: any = redactSensitiveData(payload);
      expect(sanitized.createdAt).toBe('2026-09-02T22:50:00.000Z');
      expect(sanitized.nested.date).toBe('2025-01-01T00:00:00.000Z');
    });

    it('handles custom Error subclasses and redacts tokens in message and stack trace', () => {
      class CustomNetworkError extends Error {
        code = 'ERR_LIVEKIT_AUTH';
        statusCode = 502;
        constructor(msg: string) {
          super(msg);
          this.name = 'CustomNetworkError';
        }
      }

      const botToken = '1234567890:AAFlkj9834kjhkjfds_lkjsdf098324kjh';
      const error = new CustomNetworkError(`Failed to authenticate with token ${botToken} against LiveKit`);

      const sanitized: any = redactSensitiveData(error);
      expect(sanitized.name).toBe('CustomNetworkError');
      expect(sanitized.message).not.toContain(botToken);
      expect(sanitized.message).toContain('[REDACTED_BOT_TOKEN]');
      expect(sanitized.code).toBe('ERR_LIVEKIT_AUTH');
      expect(sanitized.stack).toBeDefined();
      expect(sanitized.stack).not.toContain(botToken);
    });

    it('handles primitives: null, undefined, boolean, number, string, NaN, Infinity', () => {
      expect(redactSensitiveData(null)).toBeNull();
      expect(redactSensitiveData(undefined)).toBeUndefined();
      expect(redactSensitiveData(true)).toBe(true);
      expect(redactSensitiveData(false)).toBe(false);
      expect(redactSensitiveData(42)).toBe(42);
      expect(redactSensitiveData(0)).toBe(0);
      expect(redactSensitiveData(-1)).toBe(-1);
      expect(redactSensitiveData(NaN)).toBeNaN();
      expect(redactSensitiveData(Infinity)).toBe(Infinity);
    });

    it('handles Symbol keys and Symbol values safely without throwing', () => {
      const symVal = Symbol('symVal');
      const payload = {
        normal: 'ok',
        sym: symVal,
      };

      const sanitized: any = redactSensitiveData(payload);
      expect(sanitized.normal).toBe('ok');
      expect(sanitized.sym).toBe(symVal);
      // JSON.stringify will safely omit symbols
      expect(() => JSON.stringify(sanitized)).not.toThrow();
    });

    it('handles functions and getters safely', () => {
      const payload = {
        fn: () => 'hello',
        get computed() {
          return 'value_123';
        },
      };

      const sanitized: any = redactSensitiveData(payload);
      expect(sanitized.computed).toBe('value_123');
      expect(typeof sanitized.fn).toBe('function');
      expect(() => JSON.stringify(sanitized)).not.toThrow();
    });

    it('handles Map with non-string keys (numbers, objects, booleans)', () => {
      const map = new Map<any, any>();
      map.set(100, 'number_key_val');
      map.set(true, 'bool_key_val');
      map.set({ obj: 1 }, 'obj_key_val');
      map.set('token', 'sensitive_map_token');

      const sanitized: any = redactSensitiveData(map);
      expect(sanitized['100']).toBe('number_key_val');
      expect(sanitized['true']).toBe('bool_key_val');
      expect(sanitized['[object Object]']).toBe('obj_key_val');
      expect(sanitized['token']).toBe('[REDACTED]');
    });
  });

  // =========================================================================
  // 4. STRUCTURED LOGGER EMISSION INTEGRITY & ERROR BUFFER RESILIENCE
  // =========================================================================
  describe('4. Logger Emission Integrity & Error Ring Buffer', () => {
    it('emits valid single-line NDJSON with no multiline corruptions for all levels', () => {
      const testLogger = new StructuredLogger({ service: 'integrity_svc' });
      testLogger.setLevel('debug');

      const multilineMsg = 'Line 1\nLine 2\r\nLine 3\tTabbed';
      testLogger.info(multilineMsg, {
        multilineField: 'Field line 1\nField line 2',
        botToken: '1234567890:AAFlkj9834kjhkjfds_lkjsdf098324kjh',
      });

      expect(capturedStdout.length).toBe(1);
      const line = capturedStdout[0];
      expect(line.endsWith('\n')).toBe(true);

      // Verify that there is exactly one newline at the end (valid NDJSON)
      const lines = line.trim().split('\n');
      expect(lines.length).toBe(1);

      const parsed = JSON.parse(line.trim());
      expect(parsed.msg).toBe(multilineMsg);
      expect(parsed.context.multilineField).toBe('Field line 1\nField line 2');
      expect(parsed.context.botToken).toBe('[REDACTED]');
    });

    it('handles non-Error objects passed as the error parameter to logger.error and logger.fatal', () => {
      const testLogger = new StructuredLogger({ service: 'err_test' });

      testLogger.error('String error test', { event: 'err_event' }, 'Raw string error occurred');
      testLogger.fatal('Object error test', { event: 'fatal_event' }, {
        customError: true,
        secretCode: '9876543210:AAFlkj9834kjhkjfds_lkjsdf098324kjh',
        password: 'leak_candidate',
      });

      expect(capturedStderr.length).toBe(2);

      const parsed1 = JSON.parse(capturedStderr[0].trim());
      expect(parsed1.error.name).toBe('Error');
      expect(parsed1.error.message).toBe('Raw string error occurred');

      const parsed2 = JSON.parse(capturedStderr[1].trim());
      expect(parsed2.error.name).toBe('Error');
      expect(parsed2.error.message).not.toContain('9876543210:AAFlkj9834kjhkjfds_lkjsdf098324kjh');
      expect(parsed2.error.message).not.toContain('leak_candidate');
      expect(parsed2.error.message).toContain('[REDACTED]');
    });

    it('maintains strict ring buffer size invariant (100) under rapid concurrent error logging', () => {
      const testLogger = new StructuredLogger({ service: 'ring_stress' });
      testLogger.clearRecentErrors();

      for (let i = 0; i < 500; i++) {
        testLogger.error(`Error ${i}`, { index: i });
      }

      const errors = testLogger.getRecentErrors();
      expect(errors.length).toBe(100);
      expect(errors[0].msg).toBe('Error 400');
      expect(errors[99].msg).toBe('Error 499');

      // Test limit parameter
      expect(testLogger.getRecentErrors(10).length).toBe(10);
      expect(testLogger.getRecentErrors(0).length).toBe(100);
      expect(testLogger.getRecentErrors(200).length).toBe(100);
    });

    it('propagates child logger context properly across chained multi-level children', () => {
      const root = new StructuredLogger({ rootKey: 'rootVal', service: 'app' });
      root.setLevel('debug');

      const child1 = root.child({ child1Key: 'val1', service: 'subservice1' });
      const child2 = child1.child({ child2Key: 'val2', service: 'subservice2' });

      child2.info('Deep child log message', { callId: 'call-789' });

      expect(capturedStdout.length).toBe(1);
      const parsed = JSON.parse(capturedStdout[0].trim());
      expect(parsed.service).toBe('subservice2');
      expect(parsed.context.rootKey).toBe('rootVal');
      expect(parsed.context.child1Key).toBe('val1');
      expect(parsed.context.child2Key).toBe('val2');
      expect(parsed.context.callId).toBe('call-789');
    });

    it('works seamlessly inside AsyncLocalStorage request context with concurrent asynchronous tasks', async () => {
      const testLogger = new StructuredLogger();
      testLogger.setLevel('info');

      const tasks = Array.from({ length: 50 }, (_, i) =>
        runWithRequestContext(
          { requestId: `req-concurrent-${i}`, userId: `user-${i}`, service: `worker-${i % 5}` },
          async () => {
            await new Promise((resolve) => setTimeout(resolve, Math.random() * 10));
            testLogger.info(`Processing item ${i}`, { itemIndex: i });
          }
        )
      );

      await Promise.all(tasks);

      expect(capturedStdout.length).toBe(50);
      const parsedEntries = capturedStdout.map((s) => JSON.parse(s.trim()));

      for (let i = 0; i < 50; i++) {
        const found = parsedEntries.find((e) => e.msg === `Processing item ${i}`);
        expect(found).toBeDefined();
        expect(found.context.requestId).toBe(`req-concurrent-${i}`);
        expect(found.context.userId).toBe(`user-${i}`);
        expect(found.context.itemIndex).toBe(i);
      }
    });
  });

  // =========================================================================
  // 5. HIGH THROUGHPUT STRESS & LATENCY TEST
  // =========================================================================
  describe('5. High Throughput & Performance Stress', () => {
    it('processes 10,000 log events with redaction and JSON serialization in under 2 seconds', () => {
      const stressLogger = new StructuredLogger({ service: 'stress_bench' });
      stressLogger.setLevel('info');

      const start = performance.now();
      const count = 10000;

      for (let i = 0; i < count; i++) {
        stressLogger.info(`Benchmark log entry #${i} with token 1234567890:AAFlkj9834kjhkjfds_lkjsdf098324kjh`, {
          iteration: i,
          password: `pass_${i}`,
          botToken: '1234567890:AAFlkj9834kjhkjfds_lkjsdf098324kjh',
          user: {
            id: `usr_${i}`,
            authHeader: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.t-IDcSemACt8x4iTMCda8Yhe3iZaWbvV5XKSTbuAn0M',
          },
        });
      }

      const elapsed = performance.now() - start;
      expect(capturedStdout.length).toBe(count);

      // Verify throughput performance: 10k logs in < 2000ms (~5000+ ops/sec)
      expect(elapsed).toBeLessThan(2000);

      // Spot check first and last entries for complete redaction
      const first = JSON.parse(capturedStdout[0].trim());
      expect(first.msg).toContain('[REDACTED_BOT_TOKEN]');
      expect(first.context.password).toBe('[REDACTED]');
      expect(first.context.botToken).toBe('[REDACTED]');
      expect(first.context.user.authHeader).toContain('[REDACTED_JWT]');

      const last = JSON.parse(capturedStdout[count - 1].trim());
      expect(last.msg).toContain('[REDACTED_BOT_TOKEN]');
      expect(last.context.password).toBe('[REDACTED]');
      expect(last.context.botToken).toBe('[REDACTED]');
    });
  });
});
