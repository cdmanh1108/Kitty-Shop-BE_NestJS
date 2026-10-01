import { ApplicationError } from '@common/errors/application-error';

export class AdminAuthenticationError extends ApplicationError {
  readonly kind = 'UNAUTHORIZED' as const;
}
