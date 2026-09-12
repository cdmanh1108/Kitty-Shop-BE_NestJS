export class RentalInvariantError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'RentalInvariantError';
  }
}

export class InvalidRentalIntervalError extends Error {
  constructor() {
    super('Invalid rental interval');
    this.name = 'InvalidRentalIntervalError';
  }
}

export class RentalClaimLostError extends Error {
  constructor() {
    super('A request with this Idempotency-Key is already in progress');
    this.name = 'RentalClaimLostError';
  }
}

export class RentalInventoryUnavailableError extends Error {
  constructor(
    message = 'One or more inventory items are not operationally available or no longer rentable',
  ) {
    super(message);
    this.name = 'RentalInventoryUnavailableError';
  }
}
