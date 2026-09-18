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
  RentalInventoryUnavailableError,
  RentalInvariantError,
} from '@modules/rentals/domain/rental-errors';
import { FinanceInvariantError } from '@modules/finance/domain/finance.repository';
import { CatalogInvariantError } from '@modules/catalog/domain/catalog.repository';
import { mapCatalogErrorToHttpStatus } from '@modules/catalog/application/catalog-error-http.mapper';

const publicOperationalServerErrors = new Set(['OTP_DELIVERY_UNAVAILABLE']);

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_SERVER_ERROR';
    let message = 'Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau.';
    let details: unknown;

    const errorName =
      exception instanceof Error ? exception.name || exception.constructor?.name : '';

    if (exception instanceof RentalInvariantError) {
      status = HttpStatus.BAD_REQUEST;
      code = exception.code;
      message = exception.message;
    } else if (exception instanceof RentalOverlapError || errorName === 'RentalOverlapError') {
      status = HttpStatus.CONFLICT;
      code = 'RENTAL_OVERLAP';
      message = (exception as Error).message;
    } else if (
      exception instanceof RentalInventoryUnavailableError ||
      errorName === 'RentalInventoryUnavailableError'
    ) {
      status = HttpStatus.CONFLICT;
      code = 'RENTAL_INVENTORY_UNAVAILABLE';
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
    } else if (exception instanceof CatalogInvariantError) {
      status = mapCatalogErrorToHttpStatus(exception.code);
      code = exception.code;
      message = exception.message;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      code = `HTTP_${status}`;

      const record =
        body && typeof body === 'object' ? (body as Record<string, unknown>) : undefined;
      const publicCode = typeof record?.code === 'string' ? record.code : undefined;
      const publicMessage = typeof record?.message === 'string' ? record.message : undefined;

      if (
        status >= HttpStatus.INTERNAL_SERVER_ERROR &&
        publicCode &&
        publicMessage &&
        publicOperationalServerErrors.has(publicCode)
      ) {
        code = publicCode;
        message = publicMessage;
        details = undefined;
      } else if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
        code = 'INTERNAL_SERVER_ERROR';
        message = 'Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau.';
        details = undefined;
      } else if (
        status === HttpStatus.NOT_FOUND &&
        exception.message === `Cannot ${request.method} ${request.url}`
      ) {
        message = 'Không tìm thấy đường dẫn được yêu cầu.';
      } else if (
        status === HttpStatus.BAD_REQUEST &&
        /^(?:Unexpected (?:token|end of)|Expected (?:property name|double-quoted property name|',' or '}')|Unterminated string in JSON|Bad (?:control character|escaped character|Unicode escape) in JSON)/.test(
          exception.message,
        )
      ) {
        message = 'Nội dung yêu cầu không đúng định dạng JSON. Vui lòng kiểm tra và gửi lại.';
      } else if (typeof body === 'string') {
        message = body;
      } else if (body && typeof body === 'object') {
        const responseRecord = body as Record<string, unknown>;
        const rawMessage = responseRecord.message;
        message = Array.isArray(rawMessage)
          ? rawMessage.join(', ')
          : typeof rawMessage === 'string'
            ? rawMessage
            : exception.message;
        if (responseRecord.code && typeof responseRecord.code === 'string') {
          code = responseRecord.code;
        }
        details = responseRecord;
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        status = HttpStatus.CONFLICT;
        code = 'UNIQUE_CONSTRAINT_VIOLATION';
        message = 'Dữ liệu đã tồn tại. Vui lòng kiểm tra thông tin bị trùng.';
      } else if (exception.code === 'P2034') {
        status = HttpStatus.CONFLICT;
        code = 'CONCURRENT_MODIFICATION';
        message = 'Dữ liệu vừa được thay đổi. Vui lòng tải lại và thử lại.';
      } else if (exception.code === 'P2025') {
        status = HttpStatus.NOT_FOUND;
        code = 'RECORD_NOT_FOUND';
        message = 'Không tìm thấy dữ liệu được yêu cầu.';
      } else {
        status = HttpStatus.INTERNAL_SERVER_ERROR;
        code = 'INTERNAL_SERVER_ERROR';
        message = 'Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau.';
      }
    } else if (
      exception instanceof Prisma.PrismaClientUnknownRequestError ||
      exception instanceof Prisma.PrismaClientRustPanicError ||
      exception instanceof Prisma.PrismaClientInitializationError ||
      exception instanceof Prisma.PrismaClientValidationError
    ) {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      code = 'INTERNAL_SERVER_ERROR';
      message = 'Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau.';
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
        error: exception instanceof Error ? exception : new Error('Lỗi không xác định.'),
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
