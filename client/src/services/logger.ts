export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  category: string;
  message: string;
  details?: unknown;
}

class FrontendLogger {
  private logs: LogEntry[] = [];
  private maxLogs = 200;
  private listeners: Set<(logs: LogEntry[]) => void> = new Set();

  constructor() {
    this.setupGlobalHandlers();
    this.setupFetchInterceptor();
  }

  private setupGlobalHandlers() {
    if (typeof window === 'undefined') return;

    // Capture unhandled runtime errors
    window.addEventListener('error', (event) => {
      this.error('Runtime', `Uncaught error: ${event.message}`, {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        error: event.error?.stack || event.error,
      });
    });

    // Capture unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      this.error('Promise', `Unhandled rejection: ${event.reason}`, {
        reason: event.reason?.stack || event.reason,
      });
    });

    // Expose log array on window for quick browser console diagnostics
    (window as unknown as Record<string, unknown>).__APP_LOGS__ = this.logs;
    (window as unknown as Record<string, unknown>).__EXPORT_LOGS__ = () => this.exportLogs();
  }

  private sanitize(data: unknown): unknown {
    if (!data) return data;
    if (typeof data === 'string') {
      return data.replace(/(initData=)[^&]+/gi, '$1[REDACTED]')
                 .replace(/(Bearer\s+)[^\s"']+/gi, '$1[REDACTED]')
                 .replace(/(livekitToken=)[^&]+/gi, '$1[REDACTED]');
    }
    if (typeof data === 'object') {
      try {
        if (Array.isArray(data)) {
          return data.map((item) => this.sanitize(item));
        }
        const copy: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
          const lowerKey = key.toLowerCase();
          if (['initdata', 'authorization', 'x-telegram-init-data', 'token', 'jwttoken', 'livekittoken', 'password', 'masterpassword', 'hash', 'auth_date', 'tgwebappdata'].includes(lowerKey)) {
            copy[key] = '[REDACTED]';
          } else {
            copy[key] = this.sanitize(value);
          }
        }
        return copy;
      } catch {
        return '[Unserializable]';
      }
    }
    return data;
  }

  private setupFetchInterceptor() {
    if (typeof window === 'undefined' || !window.fetch) return;

    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const start = Date.now();
      const input = args[0];
      const init = args[1];

      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const method = init?.method || 'GET';

      this.info('HTTP', `➡️ ${method} ${url}`);

      try {
        const response = await originalFetch(...args);
        const duration = Date.now() - start;

        if (response.ok) {
          this.info('HTTP', `✅ ${response.status} ${response.statusText} (${duration}ms) - ${method} ${url}`);
        } else {
          this.warn('HTTP', `⚠️ ${response.status} ${response.statusText} (${duration}ms) - ${method} ${url}`);
        }

        return response;
      } catch (err: unknown) {
        const duration = Date.now() - start;
        const errorMsg = err instanceof Error ? err.message : String(err);
        this.error('HTTP', `❌ FAILED (${duration}ms) - ${method} ${url}: ${errorMsg}`, { error: err });
        throw err;
      }
    };
  }

  public log(level: 'info' | 'warn' | 'error', category: string, message: string, details?: unknown) {
    const sanitizedDetails = this.sanitize(details);
    const entry: LogEntry = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toISOString(),
      level,
      category,
      message,
      details: sanitizedDetails,
    };

    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    // Console output for standard DevTools inspection
    const prefix = `[Client:${category}]`;
    if (level === 'error') {
      console.error(prefix, message, sanitizedDetails ?? '');
    } else if (level === 'warn') {
      console.warn(prefix, message, sanitizedDetails ?? '');
    } else {
      console.log(prefix, message, sanitizedDetails ?? '');
    }

    this.notifyListeners();
  }

  public info(category: string, message: string, details?: unknown) {
    this.log('info', category, message, details);
  }

  public warn(category: string, message: string, details?: unknown) {
    this.log('warn', category, message, details);
  }

  public error(category: string, message: string, details?: unknown) {
    this.log('error', category, message, details);
  }

  public getLogs(): LogEntry[] {
    return [...this.logs];
  }

  public exportLogs(): string {
    return JSON.stringify(this.logs, null, 2);
  }

  public clearLogs() {
    this.logs = [];
    this.notifyListeners();
  }

  public subscribe(listener: (logs: LogEntry[]) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners() {
    this.listeners.forEach((listener) => listener([...this.logs]));
  }
}

export const logger = new FrontendLogger();
