import { assertManualConfirmation } from '../../src/modules/rentals/domain/rental-confirmation';
import { DEFAULT_RENTAL_POLICY } from '../../src/modules/settings/domain/rental-policy';

describe('Manual collateral policy', () => {
  it.each([undefined, NaN, Infinity, -1, 0.001, 100000001, 199999])(
    'rejects invalid/insufficient cash %s',
    (collateralAmount) => {
      expect(() =>
        assertManualConfirmation(
          { collateralMethod: 'CASH', collateralAmount },
          '200000',
          DEFAULT_RENTAL_POLICY,
        ),
      ).toThrow();
    },
  );
  it('requires an allowed document and rejects mixed collateral', () => {
    expect(() =>
      assertManualConfirmation({ collateralMethod: 'DOCUMENT' }, '200000', DEFAULT_RENTAL_POLICY),
    ).toThrow();
    expect(() =>
      assertManualConfirmation(
        { collateralMethod: 'DOCUMENT', documentType: 'CCCD', collateralAmount: 1 },
        '200000',
        DEFAULT_RENTAL_POLICY,
      ),
    ).toThrow();
    expect(() =>
      assertManualConfirmation(
        { collateralMethod: 'CASH', documentType: 'CCCD', collateralAmount: 200000 },
        '200000',
        DEFAULT_RENTAL_POLICY,
      ),
    ).toThrow();
    expect(() =>
      assertManualConfirmation({ collateralMethod: 'DOCUMENT', documentType: 'CCCD' }, '200000', {
        ...DEFAULT_RENTAL_POLICY,
        deposit: { ...DEFAULT_RENTAL_POLICY.deposit, allowedDocumentTypes: ['GPLX'] },
      }),
    ).toThrow();
  });
  it('supports zero expected deposit without a payment dependency', () => {
    expect(() =>
      assertManualConfirmation(
        { collateralMethod: 'CASH', collateralAmount: 0 },
        '0',
        DEFAULT_RENTAL_POLICY,
      ),
    ).not.toThrow();
  });
});
