import {
  Catch,
  HttpException,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  AccountNotLiveError,
  ConfigurationError,
  ConflictError,
  DualControlError,
  DuplicateRequestError,
  ForbiddenError,
  IllegalTransitionError,
  InsufficientFloatError,
  InvalidSignatureError,
  IpNotWhitelistedError,
  NotFoundError,
  RateLimitError,
  UnauthorizedError,
  ValidationError,
} from '../money/errors';

interface ErrorShape {
  status: number;
  code: string;
  message: string;
}

function classify(exception: unknown): ErrorShape {
  if (exception instanceof InvalidSignatureError) {
    return { status: 401, code: 'INVALID_SIGNATURE', message: 'Invalid API signature' };
  }
  if (exception instanceof UnauthorizedError) {
    return { status: 401, code: 'UNAUTHORIZED', message: 'Authentication required' };
  }
  if (exception instanceof ForbiddenError) {
    return { status: 403, code: 'FORBIDDEN', message: exception.message };
  }
  if (exception instanceof IpNotWhitelistedError) {
    return { status: 403, code: 'IP_NOT_WHITELISTED', message: 'Source IP not allowed' };
  }
  if (exception instanceof DualControlError) {
    return { status: 403, code: 'DUAL_CONTROL_VIOLATION', message: exception.message };
  }
  if (exception instanceof DuplicateRequestError) {
    return {
      status: 409,
      code: 'DUPLICATE_REQUEST',
      message: 'Idempotency-Key reused with a different request',
    };
  }
  if (exception instanceof IllegalTransitionError) {
    return { status: 409, code: 'ILLEGAL_TRANSITION', message: exception.message };
  }
  if (exception instanceof ConflictError) {
    return { status: 409, code: 'CONFLICT', message: exception.message };
  }
  if (exception instanceof AccountNotLiveError) {
    return { status: 422, code: 'ACCOUNT_NOT_LIVE', message: 'Account is not live or unfunded' };
  }
  if (exception instanceof InsufficientFloatError) {
    return { status: 422, code: 'INSUFFICIENT_FLOAT', message: 'Insufficient float' };
  }
  if (exception instanceof NotFoundError) {
    return { status: 404, code: 'NOT_FOUND', message: exception.message };
  }
  if (exception instanceof ConfigurationError) {
    const missing = /not found/i.test(exception.message);
    return {
      status: missing ? 404 : 400,
      code: missing ? 'NOT_FOUND' : 'CONFIGURATION_ERROR',
      message: exception.message,
    };
  }
  if (exception instanceof RateLimitError) {
    return { status: 429, code: 'RATE_LIMITED', message: 'Too many requests' };
  }
  if (exception instanceof ValidationError || exception instanceof RangeError) {
    return { status: 400, code: 'VALIDATION_ERROR', message: exception.message };
  }
  if (exception instanceof HttpException) {
    // class-validator / pipe failures arrive as BadRequestException.
    const status = exception.getStatus();
    const response = exception.getResponse();
    const message =
      typeof response === 'object' && response !== null && 'message' in response
        ? String((response as { message: unknown }).message)
        : exception.message;
    return { status, code: status === 400 ? 'VALIDATION_ERROR' : 'ERROR', message };
  }
  return { status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' };
}

/** Maps domain + framework errors to the §8 error code list with a stable shape. */
@Catch()
export class ApiErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const { status, code, message } = classify(exception);
    response.status(status).json({ error: { code, message } });
  }
}
