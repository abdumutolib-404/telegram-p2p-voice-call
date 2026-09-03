import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logger, StructuredLogger, getRecentErrors, clearRecentErrors } from '../utils/logger';
import { runWithRequestContext } from '../utils/requestContext';

describe('StructuredLogger Unit Tests', () => {
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

  it('formats log entries as single-line NDJSON with required fields', () => {
    const testLogger = new StructuredLogger({ service: 'test_service' });
    testLogger.setLevel('debug');

    testLogger.info('User joined voice room', { event: 'user_joined', roomId: 'room-123' });

    expect(capturedStdout.length).toBe(1);
    const line = capturedStdout[0];
    expect(line.endsWith('\n')).toBe(true);

    const parsed = JSON.parse(line.trim());
    expect(parsed.time).toBeDefined();
    expect(new Date(parsed.time).toISOString()).toBe(parsed.time);
    expect(parsed.level).toBe(20);
    expect(parsed.levelName).toBe('info');
    expect(parsed.msg).toBe('User joined voice room');
    expect(parsed.context).toEqual({
      service: 'test_service',
      event: 'user_joined',
      roomId: 'room-123',
    });
  });

  it('routes debug, info, and warn to stdout; routes error and fatal to stderr', () => {
    const testLogger = new StructuredLogger();
    testLogger.setLevel('debug');

    testLogger.debug('debug message');
    testLogger.info('info message');
    testLogger.warn('warn message');
    testLogger.error('error message');
    testLogger.fatal('fatal message');

    expect(capturedStdout.length).toBe(3);
    expect(capturedStderr.length).toBe(2);

    const stdoutLevels = capturedStdout.map((s) => JSON.parse(s.trim()).levelName);
    expect(stdoutLevels).toEqual(['debug', 'info', 'warn']);

    const stderrLevels = capturedStderr.map((s) => JSON.parse(s.trim()).levelName);
    expect(stderrLevels).toEqual(['error', 'fatal']);
  });

  it('filters out messages below the active log level threshold', () => {
    const testLogger = new StructuredLogger();
    testLogger.setLevel('warn');

    testLogger.debug('should not be logged');
    testLogger.info('should not be logged');
    testLogger.warn('should be logged');
    testLogger.error('should be logged');

    expect(capturedStdout.length).toBe(1);
    expect(capturedStderr.length).toBe(1);

    expect(JSON.parse(capturedStdout[0].trim()).levelName).toBe('warn');
    expect(JSON.parse(capturedStderr[0].trim()).levelName).toBe('error');
  });

  it('reads active requestId and userId from AsyncLocalStorage request context', async () => {
    const testLogger = new StructuredLogger();
    testLogger.setLevel('info');

    await runWithRequestContext(
      { requestId: 'req-uuid-1234', userId: 'user-777', service: 'custom_api' },
      async () => {
        testLogger.info('Testing async context propagation', { event: 'context_test' });
      }
    );

    expect(capturedStdout.length).toBe(1);
    const parsed = JSON.parse(capturedStdout[0].trim());
    expect(parsed.context.requestId).toBe('req-uuid-1234');
    expect(parsed.context.userId).toBe('user-777');
    expect(parsed.context.service).toBe('custom_api');
  });

  it('creates child logger inheriting parent context and merging child context', () => {
    const rootLogger = new StructuredLogger({ service: 'root_service', env: 'test' });
    rootLogger.setLevel('info');

    const childLogger = rootLogger.child({ module: 'payment_processor', service: 'billing' });
    childLogger.info('Processed transaction', { txId: 'tx-999', amount: 500 });

    expect(capturedStdout.length).toBe(1);
    const parsed = JSON.parse(capturedStdout[0].trim());
    expect(parsed.context).toEqual({
      service: 'billing',
      env: 'test',
      module: 'payment_processor',
      txId: 'tx-999',
      amount: 500,
    });
  });

  it('captures errors and populates the in-memory error ring buffer up to capacity', () => {
    const testLogger = new StructuredLogger();
    testLogger.clearRecentErrors();

    const sampleError = new Error('Database connection failed');
    sampleError.name = 'DbConnectionError';

    testLogger.error('Critical failure encountered', { event: 'db_failure' }, sampleError);

    const recentErrors = testLogger.getRecentErrors();
    expect(recentErrors.length).toBe(1);
    expect(recentErrors[0].levelName).toBe('error');
    expect(recentErrors[0].msg).toBe('Critical failure encountered');
    expect(recentErrors[0].error?.name).toBe('DbConnectionError');
    expect(recentErrors[0].error?.message).toBe('Database connection failed');
    expect(recentErrors[0].error?.stack).toBeDefined();

    // Fill ring buffer past 100 entries to test ring capacity capping
    for (let i = 0; i < 120; i++) {
      testLogger.error(`Error iteration ${i}`, { index: i });
    }

    const cappedErrors = testLogger.getRecentErrors();
    expect(cappedErrors.length).toBe(100);
    expect(cappedErrors[cappedErrors.length - 1].msg).toBe('Error iteration 119');

    // Test clearRecentErrors
    testLogger.clearRecentErrors();
    expect(testLogger.getRecentErrors().length).toBe(0);
  });
});
