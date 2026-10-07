import { buildEffectiveRentalPolicy } from '../../src/modules/settings/domain/rental-policy';
import { toRentalPolicyAuditSnapshot } from '../../src/modules/settings/application/settings-audit.mapper';

describe('toRentalPolicyAuditSnapshot', () => {
  it('maps the stable business audit fields without policy metadata', () => {
    const policy = buildEffectiveRentalPolicy({
      rentalPricing: { defaultRentalPrice: 60_000 },
      deposit: {
        defaultCashDeposit: 220_000,
      },
    });

    const snapshot = toRentalPolicyAuditSnapshot(policy);

    expect(snapshot).toEqual({
      defaultRentalPrice: 60_000,
      additionalDayFee: 10_000,
      defaultCashDeposit: 220_000,
    });
    expect(snapshot).not.toHaveProperty('updatedAt');
    expect(snapshot).not.toHaveProperty('categoryOverrides');
    expect(snapshot).not.toHaveProperty('lateFeePerItemPerDay');
  });
});
