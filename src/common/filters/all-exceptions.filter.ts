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
import { ApplicationError } from '@common/errors/application-error';
import { RentalOverlapError } from '@modules/rentals/domain/rental-errors';
import {
  RentalClaimLostError,
  InvalidRentalIntervalError,
  RentalInventoryUnavailableError,
  RentalInvariantError,
} from '@modules/rentals/domain/rental-errors';
import { FinanceInvariantError } from '@modules/finance/domain/finance.repository';
import { CatalogInvariantError } from '@modules/catalog/domain/catalog-errors';
import { mapCatalogErrorToHttpStatus } from '@modules/catalog/api/catalog-error-http.mapper';
import {
  BookingCustomerUnavailableError,
  CustomerPhoneAlreadyExistsError,
} from '@modules/customers/domain/customer-errors';
import { InvalidCustomerPhoneError } from '@modules/customers/domain/customer-phone';
import { CartInputError, CartVersionConflictError } from '@modules/cart/application/cart.service';
import { WebAuthApplicationError } from '@modules/web-auth/domain/web-auth.errors';
import {
  MemberEmailAlreadyUsedError,
  MemberNotFoundError,
  MemberRoleSelectionError,
  MemberSelfDeactivationError,
} from '@modules/members/application/member.errors';
import {
  CustomerAddressNotFoundError,
  CustomerNotFoundError,
} from '@modules/customers/application/customer.errors';
import {
  DeliveryChangedConcurrentlyError,
  DeliveryNotFoundError,
  DeliveryOrderNotFoundError,
  DeliveryTransitionNotAllowedError,
  InvalidDeliveryStatusError,
} from '@modules/deliveries/application/delivery.errors';
import { FavoriteProductNotFoundError } from '@modules/favorites/application/favorite.errors';
import {
  CatalogResourceNotFoundError,
  CategoryInUseError,
  DuplicateProductVariantCombinationError,
  InvalidCatalogInputError,
} from '@modules/catalog/application/catalog-application.errors';
import {
  FinanceRecordNotFoundError,
  InvalidExpenseDetailsError,
  InvalidFinancePeriodError,
  InvalidPaymentCommandError,
  ManualPaymentIdempotencyConflictError,
  ManualPaymentReplayUnavailableError,
} from '@modules/finance/application/finance.errors';
import { InvalidReportPeriodError } from '@modules/reports/application/report.errors';
import {
  InvalidShopSettingsError,
  ShopNotFoundError,
} from '@modules/settings/application/settings.errors';
import { AdminAuthenticationError } from '@modules/auth/application/auth.errors';
import { HealthDependencyUnavailableError } from '@modules/health/application/health.errors';
import {
  InvalidRentalEvidenceError,
  InvalidRentalInputError,
  RentalAccessDeniedError,
  RentalEvidenceNotFoundError,
  RentalIdempotencyReplayUnavailableError,
  RentalNotFoundError,
  RentalOperationConflictError,
  RentalOperationNotAllowedError,
} from '@modules/rentals/application/rental.errors';
import {
  ReminderNotFoundError,
  ReminderRefreshAlreadyRunningError,
} from '@modules/reminders/application/reminder.errors';

const publicOperationalServerErrors = new Set([
  'OTP_DELIVERY_UNAVAILABLE',
  'VERIFICATION_DELIVERY_FAILED',
]);

function applicationErrorStatus(error: ApplicationError): HttpStatus | undefined {
  if (
    error instanceof MemberEmailAlreadyUsedError ||
    error instanceof DuplicateProductVariantCombinationError ||
    error instanceof CategoryInUseError ||
    error instanceof DeliveryTransitionNotAllowedError ||
    error instanceof DeliveryChangedConcurrentlyError ||
    error instanceof ReminderRefreshAlreadyRunningError ||
    error instanceof ManualPaymentIdempotencyConflictError ||
    error instanceof RentalOperationConflictError
  )
    return HttpStatus.CONFLICT;

  if (
    error instanceof MemberNotFoundError ||
    error instanceof CustomerNotFoundError ||
    error instanceof CustomerAddressNotFoundError ||
    error instanceof DeliveryOrderNotFoundError ||
    error instanceof DeliveryNotFoundError ||
    error instanceof FavoriteProductNotFoundError ||
    error instanceof CatalogResourceNotFoundError ||
    error instanceof FinanceRecordNotFoundError ||
    error instanceof ShopNotFoundError ||
    error instanceof RentalNotFoundError ||
    error instanceof RentalEvidenceNotFoundError ||
    error instanceof ReminderNotFoundError
  )
    return HttpStatus.NOT_FOUND;

  if (error instanceof RentalAccessDeniedError) return HttpStatus.FORBIDDEN;
  if (error instanceof AdminAuthenticationError) return HttpStatus.UNAUTHORIZED;
  if (error instanceof HealthDependencyUnavailableError) return HttpStatus.SERVICE_UNAVAILABLE;
  if (
    error instanceof ManualPaymentReplayUnavailableError ||
    error instanceof RentalIdempotencyReplayUnavailableError
  )
    return HttpStatus.INTERNAL_SERVER_ERROR;

  if (error instanceof WebAuthApplicationError) {
    switch (error.code) {
      case 'EMAIL_ALREADY_REGISTERED':
        return HttpStatus.CONFLICT;
      case 'INVALID_CREDENTIALS':
      case 'AUTH_REQUIRED':
        return HttpStatus.UNAUTHORIZED;
      case 'ACCOUNT_DISABLED':
      case 'EMAIL_NOT_VERIFIED':
        return HttpStatus.FORBIDDEN;
      case 'OTP_RESEND_TOO_SOON':
        return HttpStatus.TOO_MANY_REQUESTS;
      case 'VERIFICATION_DELIVERY_FAILED':
        return HttpStatus.SERVICE_UNAVAILABLE;
      default:
        return HttpStatus.BAD_REQUEST;
    }
  }

  if (
    error instanceof MemberRoleSelectionError ||
    error instanceof MemberSelfDeactivationError ||
    error instanceof InvalidCustomerPhoneError ||
    error instanceof InvalidDeliveryStatusError ||
    error instanceof InvalidCatalogInputError ||
    error instanceof InvalidPaymentCommandError ||
    error instanceof InvalidExpenseDetailsError ||
    error instanceof InvalidFinancePeriodError ||
    error instanceof InvalidReportPeriodError ||
    error instanceof InvalidShopSettingsError ||
    error instanceof InvalidRentalEvidenceError ||
    error instanceof InvalidRentalInputError ||
    error instanceof RentalOperationNotAllowedError
  )
    return HttpStatus.BAD_REQUEST;

  return undefined;
}

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
    let message = 'Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau.';
    let details: unknown;

    const errorName =
      exception instanceof Error ? exception.name || exception.constructor?.name : '';

    if (exception instanceof ApplicationError) {
      const mappedStatus = applicationErrorStatus(exception);
      if (mappedStatus !== undefined) {
        status = mappedStatus;
        code = exception.code ?? `HTTP_${status}`;
        message = exception.message;
        if (exception.code) {
          details = {
            code: exception.code,
            message: exception.message,
            ...exception.details,
          };
        }
        if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
          if (exception.code && publicOperationalServerErrors.has(exception.code)) {
            code = exception.code;
            details = undefined;
          } else {
            code = 'INTERNAL_SERVER_ERROR';
            message = 'Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau.';
            details = undefined;
          }
        }
      }
    } else if (exception instanceof InvalidCustomerPhoneError) {
      status = HttpStatus.BAD_REQUEST;
      code = exception.code;
      message = exception.message;
      details = { code, message };
    } else if (exception instanceof CustomerPhoneAlreadyExistsError) {
      status = HttpStatus.CONFLICT;
      code = exception.code;
      message = exception.message;
      details = {
        code,
        message,
        ...(exception.existingCustomerId
          ? { existingCustomerId: exception.existingCustomerId }
          : {}),
      };
    } else if (exception instanceof RentalInvariantError) {
      status = HttpStatus.BAD_REQUEST;
      code = exception.code;
      message = exception.message;
    } else if (exception instanceof CartInputError) {
      status = HttpStatus.BAD_REQUEST;
      code = exception.code;
      message = exception.message;
    } else if (exception instanceof CartVersionConflictError) {
      status = HttpStatus.CONFLICT;
      code = 'CART_VERSION_CONFLICT';
      message = exception.message;
    } else if (exception instanceof BookingCustomerUnavailableError) {
      status = HttpStatus.CONFLICT;
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
      details = { code, message };
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
