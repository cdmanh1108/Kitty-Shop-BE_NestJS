import { assertManualConfirmation } from '../../src/modules/rentals/domain/rental-confirmation';
import { DEFAULT_RENTAL_POLICY } from '../../src/modules/settings/domain/rental-policy';

describe('Manual collateral policy', () => {
  it.each([undefined, NaN, Infinity, -1, 0.001, 100000001])(
    'rejects invalid cash %s',
    (collateralAmount) => {
      expect(() =>
        assertManualConfirmation(
          { collateralMethod: 'CASH', collateralAmount },
          DEFAULT_RENTAL_POLICY,
        ),
      ).toThrow();
    },
  );
  it('requires an allowed document and rejects mixed collateral', () => {
    expect(() =>
      assertManualConfirmation({ collateralMethod: 'DOCUMENT' }, DEFAULT_RENTAL_POLICY),
    ).toThrow();
    expect(() =>
      assertManualConfirmation(
        { collateralMethod: 'DOCUMENT', documentType: 'CCCD', collateralAmount: 1 },
        DEFAULT_RENTAL_POLICY,
      ),
    ).toThrow();
    expect(() =>
      assertManualConfirmation(
        { collateralMethod: 'CASH', documentType: 'CCCD', collateralAmount: 200000 },
        DEFAULT_RENTAL_POLICY,
      ),
    ).toThrow();
    expect(() =>
      assertManualConfirmation(
        { collateralMethod: 'DOCUMENT', documentType: 'CCCD' },
        {
          ...DEFAULT_RENTAL_POLICY,
          deposit: { ...DEFAULT_RENTAL_POLICY.deposit, allowedDocumentTypes: ['GPLX'] },
        },
      ),
    ).toThrow();
  });
  it.each([0, 50000, 199999])('allows negotiated deposit %s', (collateralAmount) => {
    expect(() =>
      assertManualConfirmation(
        { collateralMethod: 'CASH', collateralAmount },
        DEFAULT_RENTAL_POLICY,
      ),
    ).not.toThrow();
  });
});
