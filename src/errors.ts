/**
 * Proxy Protocol Error Definitions
 * Maps API "PX_" codes to strongly-typed JavaScript Exceptions.
 */

export enum ProxyErrorCode {
  // Authentication (1xx)
  INVALID_API_KEY = 'PX_100',
  SUBSCRIPTION_INACTIVE = 'PX_101',
  RATE_LIMIT_EXCEEDED = 'PX_102',
  IP_NOT_WHITELISTED = 'PX_103',

  // Financial (2xx)
  INSUFFICIENT_ESCROW = 'PX_200',
  ESCROW_LOCK_FAILED = 'PX_201',
  INVOICE_ALREADY_PAID = 'PX_202',
  BID_BELOW_FLOOR = 'PX_203',

  // Task & Logic (3xx)
  UNSUPPORTED_TASK_TYPE = 'PX_300',
  TASK_NOT_FOUND = 'PX_301',
  INVALID_REQUIREMENTS = 'PX_302',
  TASK_EXPIRED = 'PX_303',

  // Hardware (4xx)
  TPM_VERIFICATION_FAILED = 'PX_400',
  GEOFENCE_VIOLATION = 'PX_401',
  LIVENESS_CHECK_FAILED = 'PX_402',
  SANCTIONS_HIT = 'PX_403',

  // Network (5xx)
  BROWNOUT_ACTIVE = 'PX_500',
  NO_NODES_AVAILABLE = 'PX_501',
  LIGHTNING_DESYNC = 'PX_502'
}

export class ProxyError extends Error {
  constructor(public code: string, message: string, public status?: number) {
    super(message);
    this.name = 'ProxyError';
    // Restore prototype chain
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class AuthenticationError extends ProxyError { name = 'AuthenticationError'; }
export class PaymentRequiredError extends ProxyError { name = 'PaymentRequiredError'; }
export class RateLimitError extends ProxyError { name = 'RateLimitError'; }
export class InvalidRequestError extends ProxyError { name = 'InvalidRequestError'; }
export class SecurityError extends ProxyError { name = 'SecurityError'; }
export class ServerError extends ProxyError { name = 'ServerError'; }

/**
 * Error Factory
 * Converts raw API responses into typed Exceptions.
 */
export function mapError(code: string, message: string, status: number): ProxyError {
  switch (code) {
    // Auth Group
    case ProxyErrorCode.INVALID_API_KEY:
    case ProxyErrorCode.IP_NOT_WHITELISTED:
    case ProxyErrorCode.SUBSCRIPTION_INACTIVE:
      return new AuthenticationError(code, message, status);

    // Money Group
    case ProxyErrorCode.INSUFFICIENT_ESCROW:
    case ProxyErrorCode.BID_BELOW_FLOOR:
    case ProxyErrorCode.INVOICE_ALREADY_PAID:
      return new PaymentRequiredError(code, message, status);

    // Traffic Group
    case ProxyErrorCode.RATE_LIMIT_EXCEEDED:
    case ProxyErrorCode.BROWNOUT_ACTIVE:
      return new RateLimitError(code, message, status);

    // Security Group (The Scary Ones)
    case ProxyErrorCode.TPM_VERIFICATION_FAILED:
    case ProxyErrorCode.GEOFENCE_VIOLATION:
    case ProxyErrorCode.LIVENESS_CHECK_FAILED:
    case ProxyErrorCode.SANCTIONS_HIT:
      return new SecurityError(code, message, status);

    // Server Group
    case ProxyErrorCode.LIGHTNING_DESYNC:
    case ProxyErrorCode.NO_NODES_AVAILABLE:
      return new ServerError(code, message, status);

    default:
      // Fallback heuristics if PX code is missing or new
      if (status === 401 || status === 403) return new AuthenticationError(code, message, status);
      if (status === 402) return new PaymentRequiredError(code, message, status);
      if (status === 429 || status === 503) return new RateLimitError(code, message, status);
      if (status >= 500) return new ServerError(code, message, status);
      
      return new InvalidRequestError(code, message, status);
  }
}
