import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import {
  requestContextStorage,
  getRequestContext,
  getRequestId,
  getUserId,
  setRequestContextUserId,
  updateRequestContext,
  type RequestContext,
} from '../utils/requestContext';
import { extractClientIp } from '../utils/sanitize';
import { logger } from '../utils/logger';

export {
  requestContextStorage,
  getRequestContext,
  getRequestId,
  getUserId,
  setRequestContextUserId,
  updateRequestContext,
  type RequestContext,
};

declare global {
  namespace Express {
    interface Request {
      id?: string;
      requestId?: string;
      startTime?: number;
    }
  }
}

const REQUEST_ID_HEADER = 'x-request-id';
const CORRELATION_ID_HEADER = 'x-correlation-id';
const SAFE_ID_REGEX = /^[a-zA-Z0-9_\-\.:]+$/;

function resolveRequestId(req: Request): string {
  const incoming = req.headers[REQUEST_ID_HEADER] || req.headers[CORRELATION_ID_HEADER];
  if (
    typeof incoming === 'string' &&
    incoming.trim().length > 0 &&
    incoming.trim().length <= 128 &&
    SAFE_ID_REGEX.test(incoming.trim())
  ) {
    return incoming.trim();
  }
  return crypto.randomUUID();
}

/**
 * HTTP Request Correlation Middleware
 * - Extracts or generates unique requestId (UUID)
 * - Sets X-Request-ID response header
 * - Initializes AsyncLocalStorage RequestContext
 * - Emits structured HTTP completion log on res finish
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const requestId = resolveRequestId(req);

  req.id = requestId;
  req.requestId = requestId;
  res.setHeader('X-Request-ID', requestId);

  const clientIp = extractClientIp(req);
  const startTime = Date.now();
  req.startTime = startTime;

  const rawPath = (req.originalUrl || req.url || '').split('?')[0];

  const context: RequestContext = {
    requestId,
    clientIp,
    method: req.method,
    path: rawPath,
    service: 'api',
    startTime,
  };

  requestContextStorage.run(context, () => {
    res.on('finish', () => {
      const durationMs = Date.now() - startTime;
      const status = res.statusCode;
      const currentContext = requestContextStorage.getStore() || context;
      const userId = currentContext.userId;

      const meta = {
        service: 'api',
        event: 'http_request',
        method: req.method,
        path: rawPath,
        statusCode: status,
        durationMs,
        clientIp,
        requestId,
        ...(userId ? { userId } : {}),
      };

      const logMsg = `HTTP ${req.method} ${rawPath} -> ${status}`;

      if (status >= 500) {
        logger.error(logMsg, meta);
      } else if (status >= 400) {
        logger.warn(logMsg, meta);
      } else {
        logger.info(logMsg, meta);
      }
    });

    next();
  });
}
