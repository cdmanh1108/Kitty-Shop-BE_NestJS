export class InvalidRentalIntervalError extends Error {
  constructor() {
    super('Invalid rental interval');
  }
}

export class RentalClaimLostError extends Error {
  constructor() {
    super('A request with this Idempotency-Key is already in progress');
  }
}
