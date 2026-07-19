import type { TransactionStatus } from './types';

// Domain errors. Codes mirror the API error list (§8) where applicable.

export class InsufficientFloatError extends Error {
  readonly code = 'INSUFFICIENT_FLOAT';
  constructor(message = 'INSUFFICIENT_FLOAT') {
    super(message);
    this.name = 'InsufficientFloatError';
  }
}

export class AccountNotLiveError extends Error {
  readonly code = 'ACCOUNT_NOT_LIVE';
  constructor(message = 'ACCOUNT_NOT_LIVE') {
    super(message);
    this.name = 'AccountNotLiveError';
  }
}

export class IllegalTransitionError extends Error {
  readonly code = 'ILLEGAL_TRANSITION';
  constructor(from: TransactionStatus, to: TransactionStatus) {
    super(explainTransition(from, to));
    this.name = 'IllegalTransitionError';
  }
}

/** Tell an integrator what is actually wrong and what to do instead. */
function explainTransition(from: TransactionStatus, to: TransactionStatus): string {
  if (to === 'REVERSED') {
    if (from === 'PROCESSING') {
      return 'Only a SUCCESS transaction can be reversed. This one is still PROCESSING, meaning the customer has not completed it yet. Poll GET /v1/transactions/{id} until it is SUCCESS, then reverse.';
    }
    if (from === 'FAILED' || from === 'EXPIRED') {
      return `Only a SUCCESS transaction can be reversed. This one is ${from}, so no money moved and there is nothing to reverse.`;
    }
    if (from === 'REVERSED') {
      return 'This transaction has already been reversed.';
    }
  }
  return `Illegal transaction transition: ${from} to ${to}.`;
}

export class DualControlError extends Error {
  readonly code = 'DUAL_CONTROL_VIOLATION';
  constructor(message: string) {
    super(message);
    this.name = 'DualControlError';
  }
}

export class ConfigurationError extends Error {
  readonly code = 'CONFIGURATION_ERROR';
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

export class InvalidSignatureError extends Error {
  readonly code = 'INVALID_SIGNATURE';
  constructor(message = 'INVALID_SIGNATURE') {
    super(message);
    this.name = 'InvalidSignatureError';
  }
}

export class IpNotWhitelistedError extends Error {
  readonly code = 'IP_NOT_WHITELISTED';
  constructor(message = 'IP_NOT_WHITELISTED') {
    super(message);
    this.name = 'IpNotWhitelistedError';
  }
}

export class DuplicateRequestError extends Error {
  readonly code = 'DUPLICATE_REQUEST';
  constructor(message = 'DUPLICATE_REQUEST') {
    super(message);
    this.name = 'DuplicateRequestError';
  }
}

export class NotFoundError extends Error {
  readonly code = 'NOT_FOUND';
  constructor(message = 'NOT_FOUND') {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class RateLimitError extends Error {
  readonly code = 'RATE_LIMITED';
  constructor(message = 'RATE_LIMITED') {
    super(message);
    this.name = 'RateLimitError';
  }
}

export class ValidationError extends Error {
  readonly code = 'VALIDATION_ERROR';
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class ConflictError extends Error {
  readonly code = 'CONFLICT';
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

export class UnauthorizedError extends Error {
  readonly code = 'UNAUTHORIZED';
  constructor(message = 'UNAUTHORIZED') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends Error {
  readonly code = 'FORBIDDEN';
  constructor(message = 'FORBIDDEN') {
    super(message);
    this.name = 'ForbiddenError';
  }
}
