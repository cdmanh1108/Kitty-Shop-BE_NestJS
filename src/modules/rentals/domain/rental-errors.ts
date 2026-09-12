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
    super('Khoảng thời gian thuê không hợp lệ.');
    this.name = 'InvalidRentalIntervalError';
  }
}

export class RentalClaimLostError extends Error {
  constructor() {
    super('Yêu cầu này đang được xử lý. Vui lòng chờ và thử lại.');
    this.name = 'RentalClaimLostError';
  }
}

export class RentalInventoryUnavailableError extends Error {
  constructor(
    message = 'Một hoặc nhiều món đồ hiện không sẵn sàng hoặc không còn được phép cho thuê.',
  ) {
    super(message);
    this.name = 'RentalInventoryUnavailableError';
  }
}
