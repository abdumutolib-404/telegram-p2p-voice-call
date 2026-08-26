export type UserStatus = 'ACTIVE' | 'WARNED' | 'TEMPORARILY_SUSPENDED' | 'PERMANENTLY_BANNED';
export type AppealStatus = 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED';
export type CallStatus =
  | 'IDLE'
  | 'MATCHMAKING'
  | 'MATCHED'
  | 'CONNECTING'
  | 'ACTIVE'
  | 'FINISHING'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'FAILED';
export type RecordingStatus =
  | 'DISABLED'
  | 'STARTING'
  | 'RECORDING'
  | 'STOPPING'
  | 'READY'
  | 'FAILED'
  | 'UNAVAILABLE';
export type PaymentStatus =
  | 'NONE'
  | 'PENDING'
  | 'PAID'
  | 'FAILED'
  | 'REFUNDED'
  | 'REFUND_PENDING';
export type EntitlementSource = 'PLAN_DEFAULT' | 'ADMIN_OVERRIDE' | 'CUSTOM_PLAN';
export type PaymentMethod = 'TELEGRAM_STARS' | 'MANUAL_CARD_UZS';

export type CanonicalErrorCode =
  | 'RATE_LIMITED'
  | 'ALREADY_IN_PROGRESS'
  | 'ALREADY_MATCHMAKING'
  | 'ALREADY_IN_CALL'
  | 'QUOTA_EXCEEDED'
  | 'SUSPENDED'
  | 'BANNED'
  | 'APPEAL_NOT_ALLOWED'
  | 'APPEAL_ALREADY_PENDING'
  | 'PAYMENT_RATE_LIMITED'
  | 'PAYMENT_ALREADY_PENDING'
  | 'PAYMENT_INVALID'
  | 'PAYMENT_FAILED'
  | 'PAYMENT_ALREADY_PROCESSED'
  | 'ACTIVE_SUBSCRIPTION_EXISTS'
  | 'RECORDING_UNAVAILABLE'
  | 'RECORDING_START_FAILED'
  | 'RECORDING_STOP_FAILED'
  | 'CALL_NOT_FOUND'
  | 'CALL_UNAUTHORIZED'
  | 'MATCHMAKING_UNAVAILABLE'
  | 'SERVER_UNAVAILABLE'
  | 'INTERNAL_ERROR'
  | 'UNAUTHORIZED';

export interface CanonicalErrorResponse {
  code: CanonicalErrorCode;
  message: string;
  retryable: boolean;
  details?: Record<string, unknown>;
}

const DEFAULT_ERROR_MESSAGES: Record<CanonicalErrorCode, { message: string; retryable: boolean }> = {
  RATE_LIMITED: {
    message: 'Too many requests. Please wait a moment before trying again.',
    retryable: true,
  },
  ALREADY_IN_PROGRESS: {
    message: 'This request is already being processed.',
    retryable: false,
  },
  ALREADY_MATCHMAKING: {
    message: 'You are already searching for a speaking partner.',
    retryable: false,
  },
  ALREADY_IN_CALL: {
    message: 'You are currently in an active practice call.',
    retryable: false,
  },
  QUOTA_EXCEEDED: {
    message: 'You have reached your monthly practice limit. Upgrade your plan or invite friends to practice more.',
    retryable: false,
  },
  SUSPENDED: {
    message: 'Your account is temporarily suspended.',
    retryable: false,
  },
  BANNED: {
    message: 'Your account has been permanently restricted.',
    retryable: false,
  },
  APPEAL_NOT_ALLOWED: {
    message: 'Only permanently restricted accounts are eligible to submit an unban appeal.',
    retryable: false,
  },
  APPEAL_ALREADY_PENDING: {
    message: 'You already have an appeal under review by moderation.',
    retryable: false,
  },
  PAYMENT_RATE_LIMITED: {
    message: 'Please wait a moment before initiating another transaction.',
    retryable: true,
  },
  PAYMENT_ALREADY_PENDING: {
    message: 'You already have a payment request pending review.',
    retryable: false,
  },
  PAYMENT_INVALID: {
    message: 'Invalid payment parameters or expired price.',
    retryable: false,
  },
  PAYMENT_FAILED: {
    message: 'Payment could not be completed. Please try again.',
    retryable: true,
  },
  PAYMENT_ALREADY_PROCESSED: {
    message: 'This payment transaction has already been processed.',
    retryable: false,
  },
  ACTIVE_SUBSCRIPTION_EXISTS: {
    message: 'You already have an active subscription.',
    retryable: false,
  },
  RECORDING_UNAVAILABLE: {
    message: 'Audio recording is temporarily unavailable. Your call can proceed normally.',
    retryable: false,
  },
  RECORDING_START_FAILED: {
    message: 'Unable to start audio recording at this time.',
    retryable: true,
  },
  RECORDING_STOP_FAILED: {
    message: 'Unable to finalize recording cleanly.',
    retryable: false,
  },
  CALL_NOT_FOUND: {
    message: 'The requested call session could not be found.',
    retryable: false,
  },
  CALL_UNAUTHORIZED: {
    message: 'You are not an authorized participant in this call session.',
    retryable: false,
  },
  MATCHMAKING_UNAVAILABLE: {
    message: 'Matchmaking is temporarily unavailable. Please try again shortly.',
    retryable: true,
  },
  SERVER_UNAVAILABLE: {
    message: 'Service is temporarily unavailable. Please try again in a moment.',
    retryable: true,
  },
  INTERNAL_ERROR: {
    message: 'An unexpected error occurred. Please try again.',
    retryable: true,
  },
  UNAUTHORIZED: {
    message: 'Authentication required to access this service.',
    retryable: false,
  },
};

const FORBIDDEN_TERMS = [
  /livekit/gi,
  /webrtc/gi,
  /socket\.io/gi,
  /redis/gi,
  /prisma/gi,
  /postgresql/gi,
  /postgres/gi,
  /railway/gi,
  /netlify/gi,
  /egress/gi,
  /roomserviceclient/gi,
  /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g,
];

export function sanitizeErrorMessage(message: string): string {
  let sanitized = message;
  for (const pattern of FORBIDDEN_TERMS) {
    if (pattern.test(sanitized)) {
      return 'An unexpected service error occurred. Please try again.';
    }
  }
  return sanitized;
}

export function createCanonicalError(
  code: CanonicalErrorCode,
  customMessage?: string,
  details?: Record<string, unknown>
): CanonicalErrorResponse {
  const defaults = DEFAULT_ERROR_MESSAGES[code] || {
    message: 'An unexpected service error occurred.',
    retryable: true,
  };

  const message = customMessage ? sanitizeErrorMessage(customMessage) : defaults.message;

  return {
    code,
    message,
    retryable: defaults.retryable,
    ...(details ? { details } : {}),
  };
}
