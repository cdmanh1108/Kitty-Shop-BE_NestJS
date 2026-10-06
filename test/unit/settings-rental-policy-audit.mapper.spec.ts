import { buildEffectiveRentalPolicy } from '../../src/modules/settings/domain/rental-policy';
import { toRentalPolicyAuditSnapshot } from '../../src/modules/settings/application/settings-audit.mapper';

describe('toRentalPolicyAuditSnapshot', () => {
  it('maps the stable business audit fields without policy metadata', () => {
    const policy = buildEffectiveRentalPolicy({
      rentalPricing: { defaultRentalPrice: 60_000 },
      deposit: {
        allowedMethods: ['CASH'],
        allowedDocumentTypes: ['CCCD'],
        defaultCashDeposit: 220_000,
        categoryOverrides: [{ categoryId: 'cat-1', cashAmount: 280_000 }],
      },
    });

    const snapshot = toRentalPolicyAuditSnapshot(policy);

    expect(snapshot).toEqual({
      defaultRentalPrice: 60_000,
      additionalDayFee: 10_000,
      bulkQuantityThreshold: 3,
      standardRenewalDay: 5,
      bulkRenewalDay: 8,
      maxOnlineRentalDays: 9,
      defaultCashDeposit: 220_000,
      allowedDepositMethods: ['CASH'],
      allowedDocumentTypes: ['CCCD'],
      maxRescheduleDaysFromBooking: 20,
      lateFeePerItemPerDay: 10_000,
      newRentalChargeFromLateDay: 3,
      cleaningFeeMin: 30_000,
      cleaningFeeMax: 50_000,
      loyaltyEnabled: true,
      loyaltyRentalsRequired: 5,
      loyaltyRewardRentalValue: 50_000,
    });
    expect(snapshot).not.toHaveProperty('updatedAt');
    expect(snapshot).not.toHaveProperty('categoryOverrides');

    if (!Array.isArray(snapshot.allowedDepositMethods)) {
      throw new Error('Expected deposit methods to be an array in the audit snapshot.');
    }
    snapshot.allowedDepositMethods.push('DOCUMENT');
    expect(policy.deposit.allowedMethods).toEqual(['CASH']);
  });
});
