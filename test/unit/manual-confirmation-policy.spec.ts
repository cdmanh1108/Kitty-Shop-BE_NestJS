import { assertManualConfirmation } from '../../src/modules/rentals/domain/rental-confirmation';

describe('Manual collateral policy', () => {
  it.each([NaN, Infinity, -1, 0.001, 100000001])('rejects invalid cash %s', (collateralAmount) => {
    expect(() => assertManualConfirmation({ collateralAmount })).toThrow();
  });
  it.each([0, 50000, 199999])('allows negotiated deposit %s', (collateralAmount) => {
    expect(() => assertManualConfirmation({ collateralAmount })).not.toThrow();
  });
});
