import { ApplicationError } from '@common/errors/application-error';

export class HealthDependencyUnavailableError extends ApplicationError {
  readonly kind = 'UNAVAILABLE' as const;

  constructor() {
    super('Dịch vụ phụ thuộc của hệ thống hiện không khả dụng.');
  }
}
