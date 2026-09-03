import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { redactSensitiveData, redactString, StructuredLogger } from '../utils/logger';

describe('PII Redaction Engine Unit Tests', () => {
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

  it('redacts sensitive object keys by replacing value with [REDACTED]', () => {
    const sensitivePayload = {
      user: 'alice',
      password: 'SuperSecretPassword123!',
      token: 'secret_api_token_abc',
      botToken: '123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ_1234567',
      secret: 'my-jwt-secret-key',
      authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.t-IDcSemACt8x4iTMCda8Yhe3iZaWbvV5XKSTbuAn0M',
      cookie: 'admin_session=jwt.token.here; Path=/',
      initData: 'query_id=AAHdF6IQAAAAAN0XohDhrOrc&user=%7B%22id%22%3A12345678%7D&hash=abcdef123456',
      card: '8600123456789012',
      cardNumber: '8600 1234 5678 9012',
      cvv: '123',
      pan: '8600123456789012',
      pin: '4321',
      privateKey: '-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQD...',
      accessToken: 'access_xyz123',
      refreshToken: 'refresh_abc456',
      apiKey: 'key_live_99999',
    };

    const sanitized = redactSensitiveData(sensitivePayload);

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
  });

  it('redacts Telegram Bot tokens in arbitrary strings and log messages', () => {
    const rawMessage = 'Bot failed to connect using token 7123456789:AAFlkj9834kjhkjfds_lkjsdf098324kjh on endpoint';
    const redacted = redactString(rawMessage);

    expect(redacted).not.toContain('7123456789:AAFlkj9834kjhkjfds_lkjsdf098324kjh');
    expect(redacted).toContain('[REDACTED_BOT_TOKEN]');
  });

  it('redacts JWT tokens in arbitrary strings and log messages', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    const rawMessage = `Decoded token ${jwt} for admin auth verification`;
    const redacted = redactString(rawMessage);

    expect(redacted).not.toContain(jwt);
    expect(redacted).toContain('[REDACTED_JWT]');
  });

  it('redacts Telegram WebApp initData query strings', () => {
    const initDataStr = 'query_id=AAHdF6IQAAAAAN0XohDhrOrc&user=%7B%22id%22%3A12345678%22first_name%22%3A%22Alice%22%7D&auth_date=1710000000&hash=d87e07a34658ff9d71c841369ae5bc18b284e91851e44208ff952df7183';
    const rawMessage = `Incoming auth request with payload ${initDataStr}`;
    const redacted = redactString(rawMessage);

    expect(redacted).not.toContain(initDataStr);
    expect(redacted).toContain('[REDACTED_INIT_DATA]');
  });

  it('redacts 16-digit credit card PAN numbers in strings', () => {
    const rawMessage = 'User submitted refund to card 8600123456789012 for order #A1024';
    const redacted = redactString(rawMessage);

    expect(redacted).not.toContain('8600123456789012');
    expect(redacted).toContain('[REDACTED_CARD]');
  });

  it('safely handles circular references without throwing or hanging', () => {
    const circularObj: any = {
      name: 'CircularTest',
      nested: { level: 1 },
    };
    circularObj.nested.parent = circularObj;
    circularObj.self = circularObj;

    const sanitized = redactSensitiveData(circularObj);
    expect(sanitized.name).toBe('CircularTest');
    expect(sanitized.nested.level).toBe(1);
    expect(sanitized.nested.parent).toBe('[Circular]');
    expect(sanitized.self).toBe('[Circular]');
  });

  it('properly serializes BigInt, Buffer, Date, and Error instances', () => {
    const payload = {
      telegramId: BigInt(9876543210),
      rawBytes: Buffer.from('hello-world'),
      createdAt: new Date('2026-01-15T12:00:00Z'),
      failure: new Error('Internal service error'),
    };

    const sanitized = redactSensitiveData(payload);
    expect(sanitized.telegramId).toBe('9876543210');
    expect(sanitized.rawBytes).toBe('[Buffer 11 bytes]');
    expect(sanitized.createdAt).toBe('2026-01-15T12:00:00.000Z');
    expect(sanitized.failure).toEqual({
      name: 'Error',
      message: 'Internal service error',
      stack: expect.any(String),
    });
  });

  it('integrates PII redaction inside StructuredLogger writeLog output', () => {
    const testLogger = new StructuredLogger({ service: 'auth' });
    testLogger.setLevel('info');

    testLogger.info('Admin logged in with token eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.t-IDcSemACt8x4iTMCda8Yhe3iZaWbvV5XKSTbuAn0M', {
      botToken: '1234567890:AAHdkjshf734hkjshdfkjhsdf9832749',
      nested: {
        apiKey: 'secret_key_123',
        safeData: 'OK',
      },
    });

    expect(capturedStdout.length).toBe(1);
    const line = capturedStdout[0];
    expect(line).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
    expect(line).not.toContain('1234567890:AAHdkjshf734hkjshdfkjhsdf9832749');
    expect(line).not.toContain('secret_key_123');

    const parsed = JSON.parse(line.trim());
    expect(parsed.msg).toContain('[REDACTED_JWT]');
    expect(parsed.context.botToken).toBe('[REDACTED]');
    expect(parsed.context.nested.apiKey).toBe('[REDACTED]');
    expect(parsed.context.nested.safeData).toBe('OK');
  });
});
