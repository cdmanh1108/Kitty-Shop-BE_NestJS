import { ApplicationError } from '@common/errors/application-error';

export class InvalidReportPeriodError extends ApplicationError {
  readonly kind = 'VALIDATION' as const;
}
