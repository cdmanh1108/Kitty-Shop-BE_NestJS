import {
  ApplicationError,
  type ApplicationErrorKind,
} from '../../src/common/errors/application-error';
import {
  CATALOG_ERROR_CODE,
  CatalogColorError,
  CatalogSizeError,
} from '../../src/modules/catalog/domain/catalog-errors';
import { FinanceInvariantError } from '../../src/modules/finance/domain/finance.repository';
import {
  InvalidRentalIntervalError,
  RentalClaimLostError,
  RentalOverlapError,
} from '../../src/modules/rentals/domain/rental-errors';
import { WebAuthApplicationError } from '../../src/modules/web-auth/domain/web-auth.errors';

class ContractTestError extends ApplicationError {
  readonly kind: ApplicationErrorKind = 'CONFLICT';
}

describe('ApplicationError contract', () => {
  it('preserves Error prototype, name, message, stack, code, and semantic kind', () => {
    const error = new ContractTestError('Expected conflict.', 'TEST_CONFLICT');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ApplicationError);
    expect(error.name).toBe('ContractTestError');
    expect(error.message).toBe('Expected conflict.');
    expect(error.stack).toContain('ContractTestError');
    expect(error.code).toBe('TEST_CONFLICT');
    expect(error.kind).toBe('CONFLICT');
  });

  it.each([
    [
      new CatalogColorError(CATALOG_ERROR_CODE.COLOR_CODE_ALREADY_EXISTS),
      'COLOR_CODE_ALREADY_EXISTS',
      'CONFLICT',
    ],
    [new CatalogColorError(CATALOG_ERROR_CODE.COLOR_IN_USE), 'COLOR_IN_USE', 'CONFLICT'],
    [
      new CatalogSizeError(CATALOG_ERROR_CODE.SIZE_CODE_ALREADY_EXISTS),
      'SIZE_CODE_ALREADY_EXISTS',
      'CONFLICT',
    ],
    [new CatalogSizeError(CATALOG_ERROR_CODE.SIZE_IN_USE), 'SIZE_IN_USE', 'CONFLICT'],
    [new RentalOverlapError(), 'RENTAL_OVERLAP', 'CONFLICT'],
    [new RentalClaimLostError(), 'RENTAL_CLAIM_LOST', 'CONFLICT'],
    [new InvalidRentalIntervalError(), 'INVALID_RENTAL_INTERVAL', 'VALIDATION'],
    [new FinanceInvariantError('Invalid settlement.'), 'FINANCE_INVARIANT_ERROR', 'VALIDATION'],
  ] as const)('keeps module-owned error metadata (%s)', (error, code, kind) => {
    expect(error).toBeInstanceOf(ApplicationError);
    expect(error.code).toBe(code);
    expect(error.kind).toBe(kind);
  });

  it('assigns authentication and delivery semantics in the WebAuth module', () => {
    const authenticationError = new WebAuthApplicationError('INVALID_CREDENTIALS');
    const deliveryError = new WebAuthApplicationError('VERIFICATION_DELIVERY_FAILED');

    expect(authenticationError.kind).toBe('UNAUTHORIZED');
    expect(deliveryError.kind).toBe('UNAVAILABLE');
    expect(deliveryError.exposeOnServerError).toBe(true);
  });
});
