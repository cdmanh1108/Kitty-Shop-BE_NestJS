import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
  type ArgumentsHost,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import {
  ApplicationError,
  type ApplicationErrorKind,
} from '../src/common/errors/application-error';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { redactLog } from '../src/common/logging/application-logger';

class TestApplicationError extends ApplicationError {
  constructor(
    kind: ApplicationErrorKind,
    code: string,
    message: string,
    exposeOnServerError = false,
  ) {
    super(message, code, undefined, { exposeOnServerError });
    this.kind = kind;
  }

  readonly kind: ApplicationErrorKind;
}

interface MockResponsePayload {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
  requestId?: string;
  path: string;
  timestamp: string;
}

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let mockRequest: Partial<Request>;
  let mockResponse: {
    status: jest.Mock;
    json: jest.Mock;
    statusCode?: number;
  };
  let mockHost: ArgumentsHost;
  let sentPayload: MockResponsePayload;

  beforeEach(() => {
    mockRequest = {
      method: 'POST',
      url: '/api/v1/rentals?item=123',
      requestId: 'req-test-12345',
      currentUser: {
        userId: 'user-1',
        memberId: 'member-1',
        shopId: 'shop-1',
        email: 'test@example.com',
        fullName: 'Test User',
        permissions: [],
      },
    };

    mockResponse = {
      status: jest.fn().mockImplementation((code: number) => {
        mockResponse.statusCode = code;
        return mockResponse;
      }),
      json: jest.fn().mockImplementation((payload: MockResponsePayload) => {
        sentPayload = payload;
        return mockResponse;
      }),
    };

    mockHost = {
      switchToHttp: () => ({
        getRequest: () => mockRequest as Request,
        getResponse: () => mockResponse as unknown as Response,
        getNext: jest.fn(),
      }),
    } as unknown as ArgumentsHost;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('cross-application error contract mapping', () => {
    beforeEach(() => {
      filter = new AllExceptionsFilter();
    });

    it.each([
      ['NOT_FOUND', 404, 'RESOURCE_MISSING'],
      ['CONFLICT', 409, 'COLOR_IN_USE'],
      ['VALIDATION', 400, 'INVALID_SELECTION'],
      ['UNAUTHORIZED', 401, 'AUTH_REQUIRED'],
      ['FORBIDDEN', 403, 'ACCESS_DENIED'],
      ['TOO_MANY_REQUESTS', 429, 'RATE_LIMITED'],
    ] as const)(
      'maps %s metadata to HTTP while preserving the application code',
      (kind, status, code) => {
        const error = new TestApplicationError(kind, code, 'Known application message.');
        filter.catch(error, mockHost);

        expect(mockResponse.status).toHaveBeenCalledWith(status);
        expect(sentPayload).toMatchObject({
          statusCode: status,
          code,
          message: 'Known application message.',
          details: { code, message: 'Known application message.' },
          requestId: 'req-test-12345',
          path: '/api/v1/rentals',
        });
      },
    );

    it('does not recognize arbitrary objects that merely have an error code', () => {
      filter.catch(
        { kind: 'CONFLICT', code: 'SHOULD_NOT_BE_PUBLIC', message: 'spoofed' },
        mockHost,
      );

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(sentPayload).toMatchObject({
        statusCode: 500,
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau.',
      });
      expect(JSON.stringify(sentPayload)).not.toContain('SHOULD_NOT_BE_PUBLIC');
      expect(JSON.stringify(sentPayload)).not.toContain('spoofed');
    });

    it.each([undefined, null, 'thrown text', 42])(
      'handles unknown thrown values safely: %s',
      (thrown) => {
        filter.catch(thrown, mockHost);

        expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
        expect(sentPayload).toMatchObject({ statusCode: 500, code: 'INTERNAL_SERVER_ERROR' });
      },
    );

    it('sanitizes internal application errors', () => {
      filter.catch(
        new TestApplicationError('INTERNAL', 'PRIVATE_FAILURE', 'database password'),
        mockHost,
      );

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(sentPayload).toMatchObject({
        statusCode: 500,
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau.',
      });
      expect(JSON.stringify(sentPayload)).not.toContain('PRIVATE_FAILURE');
      expect(JSON.stringify(sentPayload)).not.toContain('database password');
    });

    it('maps exhausted serialization retries to a sanitized conflict', () => {
      filter.catch(
        new Prisma.PrismaClientKnownRequestError('private SQL details', {
          code: 'P2034',
          clientVersion: '6.19.3',
        }),
        mockHost,
      );
      expect(sentPayload).toMatchObject({ statusCode: 409, code: 'CONCURRENT_MODIFICATION' });
      expect(JSON.stringify(sentPayload)).not.toContain('private SQL');
    });

    it('keeps explicit safe server errors public without filter code knowledge', () => {
      filter.catch(
        new TestApplicationError(
          'UNAVAILABLE',
          'SAFE_PUBLIC_ERROR',
          'Không thể gửi mã xác thực lúc này. Vui lòng thử lại sau.',
          true,
        ),
        mockHost,
      );

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
      expect(sentPayload).toMatchObject({
        statusCode: 503,
        code: 'SAFE_PUBLIC_ERROR',
        message: 'Không thể gửi mã xác thực lúc này. Vui lòng thử lại sau.',
      });
      expect(sentPayload.details).toBeUndefined();
    });
  });

  describe('Prisma error sanitization', () => {
    beforeEach(() => {
      filter = new AllExceptionsFilter();
    });

    it('does not treat an unclassified P2002 as a business conflict', () => {
      const prismaError = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on the fields: (`email`)',
        { code: 'P2002', clientVersion: '6.19.3' },
      );
      filter.catch(prismaError, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(sentPayload).toMatchObject({
        statusCode: 500,
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau.',
      });
      expect(sentPayload.details).toBeUndefined();
      expect(JSON.stringify(sentPayload)).not.toContain('email');
    });

    it('keeps generic P2025 record-not-found handling without leaking entity details', () => {
      const prismaError = new Prisma.PrismaClientKnownRequestError(
        'An operation failed because it depends on one or more records that were required but not found. Record to update not found.',
        { code: 'P2025', clientVersion: '6.19.3' },
      );
      filter.catch(prismaError, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
      expect(sentPayload).toMatchObject({
        statusCode: 404,
        code: 'RECORD_NOT_FOUND',
        message: 'Không tìm thấy dữ liệu được yêu cầu.',
      });
      expect(sentPayload.details).toBeUndefined();
    });

    it('sanitizes unknown Prisma errors (e.g. foreign key P2003) to generic 500 in production', () => {
      const prismaError = new Prisma.PrismaClientKnownRequestError(
        'Foreign key constraint failed on the field: `order_items_product_id_fkey (index)`',
        { code: 'P2003', clientVersion: '6.19.3' },
      );
      filter.catch(prismaError, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(sentPayload).toMatchObject({
        statusCode: 500,
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau.',
      });
      expect(JSON.stringify(sentPayload)).not.toContain('P2003');
      expect(JSON.stringify(sentPayload)).not.toContain('order_items');
    });

    it('sanitizes Prisma initialization error to generic 500 without connection string', () => {
      const initError = new Prisma.PrismaClientInitializationError(
        "Can't reach database server at `postgres://user:secret@db.internal:5432`",
        '6.19.3',
      );
      filter.catch(initError, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(sentPayload).toMatchObject({
        statusCode: 500,
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau.',
      });
      expect(JSON.stringify(sentPayload)).not.toContain('postgres://');
      expect(JSON.stringify(sentPayload)).not.toContain('secret');
    });
  });

  describe('production vs development unknown error handling', () => {
    it('in production, hides raw message, cause, and stack traces', () => {
      const prodFilter = new AllExceptionsFilter();
      const loggerSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

      const error = new Error(
        'CRITICAL: SELECT * FROM secrets WHERE token = "xyz" failed at /src/db.ts:42',
      );
      prodFilter.catch(error, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(sentPayload).toMatchObject({
        statusCode: 500,
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau.',
        requestId: 'req-test-12345',
      });
      expect(sentPayload.details).toBeUndefined();
      expect(JSON.stringify(sentPayload)).not.toContain('SELECT');
      expect(JSON.stringify(sentPayload)).not.toContain('secrets');
      expect(JSON.stringify(sentPayload)).not.toContain('/src/db.ts');

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'http.request.failed',
          requestId: 'req-test-12345',
          statusCode: 500,
          code: 'INTERNAL_SERVER_ERROR',
          path: '/api/v1/rentals',
          userId: 'user-1',
          shopId: 'shop-1',
          errorClass: 'Error',
        }),
      );
      const loggedEvent: unknown = loggerSpy.mock.calls[0]?.[0];
      const redactedLog = JSON.stringify(redactLog(loggedEvent));
      expect(redactedLog).toContain('fingerprint');
      expect(redactedLog).not.toMatch(/SELECT|secrets|xyz|token/);
    });

    it('removes query values from failed request logs and public responses', () => {
      const loggerSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      mockRequest.url = '/api/v1/rentals?phone=0900123456&token=secret';

      filter.catch(new Error('internal failure'), mockHost);

      expect(sentPayload.path).toBe('/api/v1/rentals');
      expect(JSON.stringify(sentPayload)).not.toMatch(/0900123456|secret/);
      expect(loggerSpy).toHaveBeenCalledWith(expect.objectContaining({ path: '/api/v1/rentals' }));
    });

    it('also hides raw internal messages in development', () => {
      const devFilter = new AllExceptionsFilter();
      const error = new Error('Table rental_orders does not exist');
      devFilter.catch(error, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(sentPayload).toMatchObject({
        statusCode: 500,
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau.',
      });
      expect(sentPayload.details).toBeUndefined();
    });
  });

  describe('HTTP exception preservation', () => {
    beforeEach(() => {
      filter = new AllExceptionsFilter();
    });

    it('preserves 400 validation errors with actionable details', () => {
      const validationError = new BadRequestException({
        statusCode: 400,
        message: [
          'Thời gian bắt đầu thuê phải là ngày giờ hợp lệ theo định dạng ISO 8601.',
          'Mã khách hàng không được để trống.',
        ],
        error: 'Bad Request',
      });
      filter.catch(validationError, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(sentPayload).toMatchObject({
        statusCode: 400,
        code: 'HTTP_400',
        message:
          'Thời gian bắt đầu thuê phải là ngày giờ hợp lệ theo định dạng ISO 8601., Mã khách hàng không được để trống.',
        details: {
          statusCode: 400,
          message: [
            'Thời gian bắt đầu thuê phải là ngày giờ hợp lệ theo định dạng ISO 8601.',
            'Mã khách hàng không được để trống.',
          ],
          error: 'Bad Request',
        },
      });
    });

    it('preserves 401 Unauthorized status and message', () => {
      const authError = new UnauthorizedException('Email hoặc mật khẩu không chính xác.');
      filter.catch(authError, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(sentPayload).toMatchObject({
        statusCode: 401,
        code: 'HTTP_401',
        message: 'Email hoặc mật khẩu không chính xác.',
      });
    });

    it('preserves 403 Forbidden status and message', () => {
      const forbiddenError = new ForbiddenException('Bạn không có quyền thực hiện thao tác này.');
      filter.catch(forbiddenError, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(sentPayload).toMatchObject({
        statusCode: 403,
        code: 'HTTP_403',
        message: 'Bạn không có quyền thực hiện thao tác này.',
      });
    });

    it('preserves 429 Too Many Requests status', () => {
      const throttlerError = new HttpException(
        'Bạn gửi yêu cầu quá nhanh. Vui lòng chờ một lúc rồi thử lại.',
        429,
      );
      filter.catch(throttlerError, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(429);
      expect(sentPayload).toMatchObject({
        statusCode: 429,
        code: 'HTTP_429',
        message: 'Bạn gửi yêu cầu quá nhanh. Vui lòng chờ một lúc rồi thử lại.',
      });
    });

    it('sanitizes server error responses while preserving the status', () => {
      filter.catch(
        new ServiceUnavailableException({
          code: 'PRIVATE_SERVER_CODE',
          message: 'Chưa thể gửi mã xác thực. Vui lòng thử gửi lại sau.',
        }),
        mockHost,
      );

      expect(sentPayload).toMatchObject({
        statusCode: 503,
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau.',
      });
      expect(sentPayload.details).toBeUndefined();
    });
  });
});
