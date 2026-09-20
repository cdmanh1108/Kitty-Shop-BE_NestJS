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
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { RentalOverlapError } from '../src/modules/rentals/domain/rental.repository';
import {
  InvalidRentalIntervalError,
  RentalClaimLostError,
  RentalInvariantError,
} from '../src/modules/rentals/domain/rental-errors';
import { FinanceInvariantError } from '../src/modules/finance/domain/finance.repository';
import {
  CATALOG_ERROR_CODE,
  CatalogInvariantError,
} from '../src/modules/catalog/domain/catalog.repository';
import { BookingCustomerUnavailableError } from '../src/modules/customers/domain/customer-errors';

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

  describe('canonical domain error mapping', () => {
    beforeEach(() => {
      filter = new AllExceptionsFilter();
    });

    it('preserves the semantic rental code without interpreting the message', () => {
      filter.catch(
        new RentalInvariantError(
          'RESCHEDULE_LIMIT_EXCEEDED',
          'Đã vượt quá thời hạn đổi lịch cho phép.',
        ),
        mockHost,
      );
      expect(sentPayload).toMatchObject({
        statusCode: 400,
        code: 'RESCHEDULE_LIMIT_EXCEEDED',
        message: 'Đã vượt quá thời hạn đổi lịch cho phép.',
      });
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

    it('maps RentalOverlapError to 409 RENTAL_OVERLAP', () => {
      const error = new RentalOverlapError();
      filter.catch(error, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
      expect(sentPayload).toMatchObject({
        statusCode: 409,
        code: 'RENTAL_OVERLAP',
        message: 'Một hoặc nhiều món đồ không còn trống trong khoảng thời gian đã chọn.',
        requestId: 'req-test-12345',
        path: '/api/v1/rentals?item=123',
      });
      expect(sentPayload.details).toBeUndefined();
    });

    it('maps RentalClaimLostError to 409 RENTAL_CLAIM_LOST', () => {
      const error = new RentalClaimLostError();
      filter.catch(error, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
      expect(sentPayload).toMatchObject({
        statusCode: 409,
        code: 'RENTAL_CLAIM_LOST',
        message: 'Yêu cầu này đang được xử lý. Vui lòng chờ và thử lại.',
      });
    });

    it('maps InvalidRentalIntervalError to 400 INVALID_RENTAL_INTERVAL', () => {
      const error = new InvalidRentalIntervalError();
      filter.catch(error, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(sentPayload).toMatchObject({
        statusCode: 400,
        code: 'INVALID_RENTAL_INTERVAL',
        message: 'Khoảng thời gian thuê không hợp lệ.',
      });
    });

    it('maps FinanceInvariantError to 400 FINANCE_INVARIANT_ERROR', () => {
      const error = new FinanceInvariantError('Đơn thuê của khoản chi không thuộc cửa hàng này.');
      filter.catch(error, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(sentPayload).toMatchObject({
        statusCode: 400,
        code: 'FINANCE_INVARIANT_ERROR',
        message: 'Đơn thuê của khoản chi không thuộc cửa hàng này.',
      });
    });

    it('maps CatalogInvariantError by code regardless of message wording', () => {
      const error = new CatalogInvariantError(
        CATALOG_ERROR_CODE.SIZE_NOT_IN_SHOP,
        'Any future localized wording remains safe for HTTP classification.',
      );
      filter.catch(error, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(sentPayload).toMatchObject({
        statusCode: 400,
        code: CATALOG_ERROR_CODE.SIZE_NOT_IN_SHOP,
        message: 'Any future localized wording remains safe for HTTP classification.',
      });
    });

    it('maps a typed Catalog conflict without inspecting its message', () => {
      const error = new CatalogInvariantError(
        CATALOG_ERROR_CODE.PRODUCT_SLUG_ALREADY_EXISTS,
        'Completely unrelated wording.',
      );
      filter.catch(error, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
      expect(sentPayload).toMatchObject({
        statusCode: HttpStatus.CONFLICT,
        code: CATALOG_ERROR_CODE.PRODUCT_SLUG_ALREADY_EXISTS,
      });
    });

    it('maps an unavailable booking customer without exposing profile metadata', () => {
      filter.catch(new BookingCustomerUnavailableError(), mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
      expect(sentPayload).toMatchObject({
        statusCode: HttpStatus.CONFLICT,
        code: 'BOOKING_CUSTOMER_UNAVAILABLE',
      });
      expect(sentPayload.details).toBeUndefined();
    });
  });

  describe('Prisma error sanitization', () => {
    beforeEach(() => {
      filter = new AllExceptionsFilter();
    });

    it('translates P2002 unique constraint error without leaking table/column details', () => {
      const prismaError = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on the fields: (`email`)',
        { code: 'P2002', clientVersion: '6.19.3' },
      );
      filter.catch(prismaError, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
      expect(sentPayload).toMatchObject({
        statusCode: 409,
        code: 'UNIQUE_CONSTRAINT_VIOLATION',
        message: 'Dữ liệu đã tồn tại. Vui lòng kiểm tra thông tin bị trùng.',
      });
      expect(sentPayload.details).toBeUndefined();
      expect(JSON.stringify(sentPayload)).not.toContain('email');
    });

    it('translates P2025 record not found error without leaking entity details', () => {
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

    it('preserves the safe OTP delivery error so registration can recover', () => {
      filter.catch(
        new ServiceUnavailableException({
          code: 'OTP_DELIVERY_UNAVAILABLE',
          message: 'Chưa thể gửi mã xác thực. Vui lòng thử gửi lại sau.',
        }),
        mockHost,
      );

      expect(sentPayload).toMatchObject({
        statusCode: 503,
        code: 'OTP_DELIVERY_UNAVAILABLE',
        message: 'Chưa thể gửi mã xác thực. Vui lòng thử gửi lại sau.',
      });
      expect(sentPayload.details).toBeUndefined();
    });
  });
});
