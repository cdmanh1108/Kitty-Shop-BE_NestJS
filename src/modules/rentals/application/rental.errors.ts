import { ApplicationError } from '@common/errors/application-error';

export class RentalNotFoundError extends ApplicationError {}

export class InvalidRentalInputError extends ApplicationError {}

export class InvalidRentalPeriodError extends InvalidRentalInputError {}

export class InvalidRentalItemSelectionError extends InvalidRentalInputError {}

export class RentalPricingUnavailableError extends InvalidRentalInputError {}

export class InvalidRentalIdempotencyKeyError extends InvalidRentalInputError {}

export class UnsupportedRentalCollateralError extends InvalidRentalInputError {}

export class InvalidRentalChargeError extends InvalidRentalInputError {}

export class InvalidRentalCustomerDetailsError extends InvalidRentalInputError {}

export class RentalOperationNotAllowedError extends ApplicationError {}

export class RentalOperationConflictError extends ApplicationError {}

export class RentalIdempotencyConflictError extends RentalOperationConflictError {}

export class RentalInventoryConflictError extends RentalOperationConflictError {}

export class RentalAvailabilityConflictError extends RentalOperationConflictError {}

export class RentalStateChangedConflictError extends RentalOperationConflictError {}

export class WebRentalCancellationConflictError extends RentalOperationConflictError {}

export class RentalCreationConflictError extends RentalOperationConflictError {}

export class RentalAccessDeniedError extends ApplicationError {}

export class RentalEvidenceNotFoundError extends ApplicationError {}

export class InvalidRentalEvidenceError extends ApplicationError {}

export class RentalIdempotencyReplayUnavailableError extends ApplicationError {
  constructor() {
    super('Không thể khôi phục kết quả yêu cầu đã hoàn tất.', 'IDEMPOTENCY_REPLAY_INVALID');
  }
}
