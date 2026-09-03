import { requestContextStorage, type RequestContext } from './requestContext';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LogContext {
  service?: string;
  event?: string;
  userId?: string;
  requestId?: string;
  durationMs?: number;
  [key: string]: unknown;
}

export interface StructuredLogEntry {
  time: string;
  timestamp: string;
  level: number | string;
  levelName: LogLevel;
  msg: string;
  message: string;
  service: string;
  requestId?: string;
  userId?: string;
  durationMs?: number;
  event?: string;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
    code?: string | number;
  };
  [key: string]: unknown;
}

export const LOG_LEVEL_SEVERITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  fatal: 50,
};

const REDACTED_KEYS = new Set([
  'password',
  'masterpassword',
  'adminpassword',
  'pass',
  'passwd',
  'token',
  'bottoken',
  'accesstoken',
  'refreshtoken',
  'sessiontoken',
  'adminsession',
  'secret',
  'jwtsecret',
  'livekitsecret',
  's3secret',
  'apikey',
  'privatekey',
  'jwt',
  'auth',
  'authorization',
  'xtelegraminitdata',
  'initdata',
  'tgwebappdata',
  'cookie',
  'setcookie',
  'cookies',
  'cardnumber',
  'pan',
  'cvv',
  'cvc',
  'card',
  'carddetails',
  'expiry',
  'otp',
  'otphash',
  'code',
  'verificationcode',
  'pin',
]);

const VALUE_PATTERNS = [
  { pattern: /\b\d{8,12}:[A-Za-z0-9_-]{30,45}\b/g, replacement: '[REDACTED_BOT_TOKEN]' },
  { pattern: /\beyJ[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\b/g, replacement: '[REDACTED_JWT]' },
  { pattern: /(?:query_id|user)=[^&\s]*(?:&[^&=\s]+=[^&\s]*)*&hash=[a-f0-9]{16,64}/gi, replacement: '[REDACTED_INIT_DATA]' },
  { pattern: /Bearer\s+[A-Za-z0-9-._~+/]+=*/gi, replacement: 'Bearer [REDACTED_TOKEN]' },
  { pattern: /\b(?:\d[ -]*?){13,19}\b/g, replacement: '[REDACTED_CARD]' },
];

/**
 * Applies regex pattern replacement to redact tokens and sensitive substrings within string values.
 */
export function redactString(str: string): string {
  if (typeof str !== 'string') return str;
  let result = str;
  for (const { pattern, replacement } of VALUE_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

/**
 * Recursively traverses data structures and replaces sensitive fields / values with '[REDACTED]'.
 * Protected against circular references via WeakSet.
 */
export function redactSensitiveData(data: unknown, depth = 0, seen = new WeakSet()): unknown {
  if (depth > 8) return '[Max Depth Exceeded]';
  if (data === null || data === undefined) return data;

  if (typeof data === 'string') {
    return redactString(data);
  }

  if (typeof data === 'bigint') {
    return data.toString();
  }

  if (typeof data !== 'object') {
    return data;
  }

  if (Buffer.isBuffer(data)) {
    return `[Buffer ${data.length} bytes]`;
  }

  if (data instanceof Date) {
    return data.toISOString();
  }

  if (data instanceof Error) {
    const errorWithCode = data as Error & { code?: string | number };
    return {
      name: data.name,
      message: redactString(data.message),
      stack: data.stack ? redactString(data.stack) : undefined,
      code: errorWithCode.code,
    };
  }

  if (seen.has(data)) {
    return '[Circular]';
  }
  seen.add(data);

  if (Array.isArray(data)) {
    return data.map((item) => redactSensitiveData(item, depth + 1, seen));
  }

  if (data instanceof Set) {
    return Array.from(data).map((item) => redactSensitiveData(item, depth + 1, seen));
  }

  if (data instanceof Map) {
    const obj: Record<string, unknown> = {};
    for (const [key, value] of data.entries()) {
      const keyStr = String(key);
      const normalizedKey = keyStr.toLowerCase().replace(/[-_]/g, '');
      obj[keyStr] = REDACTED_KEYS.has(normalizedKey)
        ? '[REDACTED]'
        : redactSensitiveData(value, depth + 1, seen);
    }
    return obj;
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    const normalizedKey = key.toLowerCase().replace(/[-_]/g, '');
    if (REDACTED_KEYS.has(normalizedKey)) {
      result[key] = '[REDACTED]';
    } else {
      result[key] = redactSensitiveData(value, depth + 1, seen);
    }
  }

  return result;
}

export class StructuredLogger {
  private currentLogLevel: LogLevel = 'info';
  private errorRingBuffer: StructuredLogEntry[] = [];
  private readonly maxRingBufferSize: number = 100;
  private defaultContext: LogContext = {};

  constructor(defaultContext?: LogContext) {
    if (defaultContext) {
      this.defaultContext = { ...defaultContext };
    }
    const envLevel = (process.env.LOG_LEVEL?.toLowerCase() as LogLevel) || undefined;
    if (envLevel && LOG_LEVEL_SEVERITY[envLevel] !== undefined) {
      this.currentLogLevel = envLevel;
    } else if (process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development') {
      this.currentLogLevel = 'debug';
    }
  }

  public setLevel(level: LogLevel): void {
    if (LOG_LEVEL_SEVERITY[level] !== undefined) {
      this.currentLogLevel = level;
    }
  }

  public getLevel(): LogLevel {
    return this.currentLogLevel;
  }

  public getRecentErrors(limit?: number): StructuredLogEntry[] {
    const count = limit && limit > 0 ? limit : this.errorRingBuffer.length;
    return this.errorRingBuffer.slice(-count);
  }

  public clearRecentErrors(): void {
    this.errorRingBuffer = [];
  }

  public shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_SEVERITY[level] >= LOG_LEVEL_SEVERITY[this.currentLogLevel];
  }

  private writeLog(level: LogLevel, message: string, context?: LogContext, err?: unknown): void {
    const mergedContext = { ...this.defaultContext, ...(context || {}) };

    const asyncCtx = requestContextStorage.getStore();
    const service = mergedContext.service || asyncCtx?.service || 'api';
    const requestId = mergedContext.requestId || asyncCtx?.requestId;
    const userId = mergedContext.userId || asyncCtx?.userId;

    let errorObj: StructuredLogEntry['error'] | undefined;
    if (err) {
      if (err instanceof Error) {
        const errorWithCode = err as Error & { code?: string | number };
        errorObj = {
          name: err.name,
          message: redactString(err.message),
          stack: err.stack ? redactString(err.stack) : undefined,
          code: errorWithCode.code,
        };
      } else if (typeof err === 'string') {
        errorObj = {
          name: 'Error',
          message: redactString(err),
        };
      } else {
        const sanitized = redactSensitiveData(err);
        errorObj = {
          name: 'Error',
          message: JSON.stringify(sanitized),
        };
      }
    }

    const { service: _s, requestId: _r, userId: _u, event, durationMs, ...extraContext } = mergedContext;
    const isoTime = new Date().toISOString();
    const redactedMsg = redactString(message);
    const sanitizedExtra = redactSensitiveData(extraContext) as Record<string, unknown>;
    const fullContext: LogContext = {
      service,
      ...(requestId ? { requestId } : {}),
      ...(userId ? { userId } : {}),
      ...(event ? { event } : {}),
      ...(durationMs !== undefined ? { durationMs } : {}),
      ...sanitizedExtra,
    };

    const entry: StructuredLogEntry = {
      time: isoTime,
      timestamp: isoTime,
      level: LOG_LEVEL_SEVERITY[level],
      levelName: level,
      msg: redactedMsg,
      message: redactedMsg,
      service,
      ...(requestId ? { requestId } : {}),
      ...(userId ? { userId } : {}),
      ...(event ? { event } : {}),
      ...(durationMs !== undefined ? { durationMs } : {}),
      ...(errorObj ? { error: errorObj } : {}),
      context: fullContext,
      ...(Object.keys(sanitizedExtra).length > 0 ? sanitizedExtra : {}),
    };

    if (level === 'error' || level === 'fatal') {
      this.errorRingBuffer.push(entry);
      if (this.errorRingBuffer.length > this.maxRingBufferSize) {
        this.errorRingBuffer.shift();
      }
    }

    if (!this.shouldLog(level)) return;

    const serialized = JSON.stringify(entry);
    if (level === 'error' || level === 'fatal') {
      process.stderr.write(serialized + '\n');
    } else {
      process.stdout.write(serialized + '\n');
    }
  }

  debug(message: string, context?: LogContext): void {
    this.writeLog('debug', message, context);
  }

  info(message: string, context?: LogContext): void {
    this.writeLog('info', message, context);
  }

  warn(message: string, context?: LogContext, err?: unknown): void {
    this.writeLog('warn', message, context, err);
  }

  error(message: string, context?: LogContext, err?: unknown): void {
    this.writeLog('error', message, context, err);
  }

  fatal(message: string, context?: LogContext, err?: unknown): void {
    this.writeLog('fatal', message, context, err);
  }

  child(defaultContext: LogContext): StructuredLogger {
    const childInstance = new StructuredLogger({ ...this.defaultContext, ...defaultContext });
    childInstance.currentLogLevel = this.currentLogLevel;
    // Share the error ring buffer with root logger
    childInstance.errorRingBuffer = this.errorRingBuffer;
    return childInstance;
  }
}

export const logger = new StructuredLogger();
export const getRecentErrors = (limit?: number): StructuredLogEntry[] => logger.getRecentErrors(limit);
export const clearRecentErrors = (): void => logger.clearRecentErrors();
