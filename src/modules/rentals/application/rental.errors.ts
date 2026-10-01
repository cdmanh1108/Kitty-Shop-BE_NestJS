import { ApplicationError } from '@common/errors/application-error';

export class RentalNotFoundError extends ApplicationError {
  readonly kind = 'NOT_FOUND' as const;
}

export class InvalidRentalInputError extends ApplicationError {
  readonly kind = 'VALIDATION' as const;
}

export class InvalidRentalPeriodError extends InvalidRentalInputError {}

export class InvalidRentalItemSelectionError extends InvalidRentalInputError {}

export class RentalPricingUnavailableError extends InvalidRentalInputError {}

export class InvalidRentalIdempotencyKeyError extends InvalidRentalInputError {}

export class UnsupportedRentalCollateralError extends InvalidRentalInputError {}

export class InvalidRentalChargeError extends InvalidRentalInputError {}

export class InvalidRentalCustomerDetailsError extends InvalidRentalInputError {}

export class RentalOperationNotAllowedError extends ApplicationError {
  readonly kind = 'VALIDATION' as const;
}

export class RentalOperationConflictError extends ApplicationError {
  readonly kind = 'CONFLICT' as const;
}

export class RentalIdempotencyConflictError extends RentalOperationConflictError {}

export class RentalInventoryConflictError extends RentalOperationConflictError {}

export class RentalAvailabilityConflictError extends RentalOperationConflictError {}

export class RentalStateChangedConflictError extends RentalOperationConflictError {}

export class WebRentalCancellationConflictError extends RentalOperationConflictError {}

export class RentalCreationConflictError extends RentalOperationConflictError {}

export class RentalAccessDeniedError extends ApplicationError {
  readonly kind = 'FORBIDDEN' as const;
}

export class RentalEvidenceNotFoundError extends ApplicationError {
  readonly kind = 'NOT_FOUND' as const;
}

export class InvalidRentalEvidenceError extends ApplicationError {
  readonly kind = 'VALIDATION' as const;
}

export class RentalIdempotencyReplayUnavailableError extends ApplicationError {
  readonly kind = 'INTERNAL' as const;

  constructor() {
    super('Không thể khôi phục kết quả yêu cầu đã hoàn tất.', 'IDEMPOTENCY_REPLAY_INVALID');
  }
}
