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
import { ApplicationError, type ApplicationErrorKind } from '@common/errors/application-error';

const APPLICATION_ERROR_STATUS: Readonly<Record<ApplicationErrorKind, HttpStatus>> = {
  VALIDATION: HttpStatus.BAD_REQUEST,
  NOT_FOUND: HttpStatus.NOT_FOUND,
  CONFLICT: HttpStatus.CONFLICT,
  UNAUTHORIZED: HttpStatus.UNAUTHORIZED,
  FORBIDDEN: HttpStatus.FORBIDDEN,
  TOO_MANY_REQUESTS: HttpStatus.TOO_MANY_REQUESTS,
  UNAVAILABLE: HttpStatus.SERVICE_UNAVAILABLE,
  INTERNAL: HttpStatus.INTERNAL_SERVER_ERROR,
};

const INTERNAL_ERROR_MESSAGE = 'Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau.';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();
    const path = request.url?.split('?')[0] ?? request.url;

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_SERVER_ERROR';
    let message = INTERNAL_ERROR_MESSAGE;
    let details: unknown;

    if (exception instanceof ApplicationError) {
      status = APPLICATION_ERROR_STATUS[exception.kind];
      code = exception.code ?? `HTTP_${status}`;
      message = exception.message;
      if (exception.includeCodeAndMessageInDetails && exception.code) {
        details = {
          code: exception.code,
          message: exception.message,
          ...exception.details,
        };
      } else {
        details = exception.details;
      }

      if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
        if (exception.exposeOnServerError) {
          code = exception.code ?? `HTTP_${status}`;
          details = undefined;
        } else {
          code = 'INTERNAL_SERVER_ERROR';
          message = INTERNAL_ERROR_MESSAGE;
          details = undefined;
        }
      }
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();

      if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
        code = 'INTERNAL_SERVER_ERROR';
        message = INTERNAL_ERROR_MESSAGE;
      } else {
        code = `HTTP_${status}`;

        const record =
          body && typeof body === 'object' ? (body as Record<string, unknown>) : undefined;
        if (
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
        } else if (record) {
          const rawMessage = record.message;
          message = Array.isArray(rawMessage)
            ? rawMessage.join(', ')
            : typeof rawMessage === 'string'
              ? rawMessage
              : exception.message;
          if (typeof record.code === 'string') code = record.code;
          details = record;
        } else {
          message = exception.message;
        }
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2034') {
        // Serialization retries are cross-cutting; entity-specific Prisma codes belong in adapters.
        status = HttpStatus.CONFLICT;
        code = 'CONCURRENT_MODIFICATION';
        message = 'Dữ liệu vừa được thay đổi. Vui lòng tải lại và thử lại.';
      } else if (exception.code === 'P2025') {
        // Keep the generic record-not-found behavior; adapters provide stable entity-specific codes.
        status = HttpStatus.NOT_FOUND;
        code = 'RECORD_NOT_FOUND';
        message = 'Không tìm thấy dữ liệu được yêu cầu.';
      }
    }

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error({
        event: 'http.request.failed',
        requestId: request.requestId,
        method: request.method,
        statusCode: status,
        code,
        path,
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
      path,
      timestamp: new Date().toISOString(),
    });
  }
}
