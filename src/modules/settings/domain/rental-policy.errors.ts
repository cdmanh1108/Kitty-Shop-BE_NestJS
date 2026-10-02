import { ApplicationError } from '@common/errors/application-error';

export class InvalidShopSettingsError extends ApplicationError {
  readonly kind = 'VALIDATION' as const;
}
