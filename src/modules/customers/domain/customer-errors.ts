export class CustomerPhoneAlreadyExistsError extends Error {
  readonly code = 'CUSTOMER_PHONE_ALREADY_EXISTS';

  constructor(public readonly existingCustomerId?: string) {
    super('Customer phone already exists');
  }
}
