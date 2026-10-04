import { beforeEach, expect, it, vi } from 'vitest';
import { logger } from '../src/services/logger';

beforeEach(() => { logger.clearLogs(); });

it('redacts credentials from diagnostic messages, details, exports, and console output', () => {
  const consoleOutput = vi.spyOn(console, 'error').mockImplementation(() => {});
  logger.error('HTTP', 'GET /api/calls/active?tgWebAppData=synthetic-telegram-secret&token=synthetic-voice-secret&sessionId=visible-session', {
    nested: { authorization: 'synthetic-header-secret', safe: 'token=synthetic-nested-secret' },
  });
  const output = logger.exportLogs() + JSON.stringify(consoleOutput.mock.calls);
  for (const secret of ['synthetic-telegram-secret', 'synthetic-voice-secret', 'synthetic-header-secret', 'synthetic-nested-secret']) {
    expect(output).not.toContain(secret);
  }
  expect(output).toContain('visible-session');
  expect(output).toContain('[REDACTED]');
});
