import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext {
  requestId: string;
  userId?: string;
  clientIp?: string;
  method?: string;
  path?: string;
  service?: string;
  startTime?: number;
  [key: string]: unknown;
}

export const requestContextStorage = new AsyncLocalStorage<RequestContext>();

/**
 * Get the current request context store, or undefined if outside an active context.
 */
export function getRequestContext(): RequestContext | undefined {
  return requestContextStorage.getStore();
}

/**
 * Get the active requestId, or undefined if outside an active context.
 */
export function getRequestId(): string | undefined {
  return requestContextStorage.getStore()?.requestId;
}

/**
 * Get the active userId, or undefined if unauthenticated or outside an active context.
 */
export function getUserId(): string | undefined {
  return requestContextStorage.getStore()?.userId;
}

/**
 * Attach or update the authenticated userId within the current request context.
 */
export function setRequestContextUserId(userId: string): void {
  const store = requestContextStorage.getStore();
  if (store) {
    store.userId = userId;
  }
}

/**
 * Merge additional metadata fields into the current request context store.
 */
export function updateRequestContext(fields: Partial<RequestContext>): void {
  const store = requestContextStorage.getStore();
  if (store) {
    Object.assign(store, fields);
  }
}

/**
 * Run a synchronous or asynchronous callback within a specific request context.
 */
export function runWithRequestContext<T>(context: RequestContext, fn: () => T): T {
  return requestContextStorage.run(context, fn);
}
