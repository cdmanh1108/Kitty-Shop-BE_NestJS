import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ExceptionFilter,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import { RentalOverlapError } from '@modules/rentals/domain/rental.repository';
import {
  RentalClaimLostError,
  InvalidRentalIntervalError,
} from '@modules/rentals/domain/rental-errors';
import { FinanceInvariantError } from '@modules/finance/domain/finance.repository';
import { CatalogInvariantError } from '@modules/catalog/domain/catalog.repository';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);
  private readonly isProduction: boolean;

  constructor(isProduction?: boolean) {
    this.isProduction = isProduction ?? process.env.NODE_ENV === 'production';
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_SERVER_ERROR';
    let message = 'An unexpected error occurred';
    let details: unknown;

    const errorName =
      exception instanceof Error ? exception.name || exception.constructor?.name : '';

    if (exception instanceof RentalOverlapError || errorName === 'RentalOverlapError') {
      status = HttpStatus.CONFLICT;
      code = 'RENTAL_OVERLAP';
      message = (exception as Error).message;
    } else if (exception instanceof RentalClaimLostError || errorName === 'RentalClaimLostError') {
      status = HttpStatus.CONFLICT;
      code = 'RENTAL_CLAIM_LOST';
      message = (exception as Error).message;
    } else if (
      exception instanceof InvalidRentalIntervalError ||
      errorName === 'InvalidRentalIntervalError'
    ) {
      status = HttpStatus.BAD_REQUEST;
      code = 'INVALID_RENTAL_INTERVAL';
      message = (exception as Error).message;
    } else if (
      exception instanceof FinanceInvariantError ||
      errorName === 'FinanceInvariantError'
    ) {
      status = HttpStatus.BAD_REQUEST;
      code = 'FINANCE_INVARIANT_ERROR';
      message = (exception as Error).message;
    } else if (
      exception instanceof CatalogInvariantError ||
      errorName === 'CatalogInvariantError'
    ) {
      status = HttpStatus.BAD_REQUEST;
      code = 'CATALOG_INVARIANT_ERROR';
      message = (exception as Error).message;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      code = `HTTP_${status}`;

      if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
        code = 'INTERNAL_SERVER_ERROR';
        message = this.isProduction
          ? 'An unexpected error occurred'
          : typeof body === 'string'
            ? body
            : (body as Record<string, unknown>)?.message &&
                typeof (body as Record<string, unknown>).message === 'string'
              ? ((body as Record<string, unknown>).message as string)
              : exception.message;
        details = undefined;
      } else if (typeof body === 'string') {
        message = body;
      } else if (body && typeof body === 'object') {
        const record = body as Record<string, unknown>;
        const rawMessage = record.message;
        message = Array.isArray(rawMessage)
          ? rawMessage.join(', ')
          : typeof rawMessage === 'string'
            ? rawMessage
            : exception.message;
        if (record.code && typeof record.code === 'string') {
          code = record.code;
        }
        details = record;
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        status = HttpStatus.CONFLICT;
        code = 'UNIQUE_CONSTRAINT_VIOLATION';
        message = 'A record with the same unique value already exists';
      } else if (exception.code === 'P2025') {
        status = HttpStatus.NOT_FOUND;
        code = 'RECORD_NOT_FOUND';
        message = 'The requested record does not exist';
      } else {
        status = HttpStatus.INTERNAL_SERVER_ERROR;
        code = 'INTERNAL_SERVER_ERROR';
        message = 'An unexpected error occurred';
      }
    } else if (
      exception instanceof Prisma.PrismaClientUnknownRequestError ||
      exception instanceof Prisma.PrismaClientRustPanicError ||
      exception instanceof Prisma.PrismaClientInitializationError ||
      exception instanceof Prisma.PrismaClientValidationError
    ) {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      code = 'INTERNAL_SERVER_ERROR';
      message = 'An unexpected error occurred';
    } else if (!this.isProduction && exception instanceof Error) {
      message = exception.message || 'An unexpected error occurred';
    }

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error({
        event: 'http.request.failed',
        requestId: request.requestId,
        method: request.method,
        statusCode: status,
        code,
        path: request.url?.split('?')[0] ?? request.url,
        userId: request.currentUser?.userId,
        shopId: request.currentUser?.shopId,
        errorClass:
          exception instanceof Error
            ? exception.constructor.name
            : typeof exception === 'object' && exception !== null
              ? 'ObjectException'
              : 'UnknownException',
        error: exception instanceof Error ? exception : new Error('Unknown exception'),
      });
    }

    response.status(status).json({
      statusCode: status,
      code,
      message,
      details,
      requestId: request.requestId,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}
