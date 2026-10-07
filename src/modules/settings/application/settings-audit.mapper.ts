import type { AuditSnapshot } from '@modules/audit/public/audit-contracts';
import type { RentalPolicy } from '../domain/rental-policy';

export function toRentalPolicyAuditSnapshot(policy: RentalPolicy): AuditSnapshot {
  return {
    defaultRentalPrice: policy.rentalPricing.defaultRentalPrice,
    additionalDayFee: policy.rentalPricing.additionalDayFee,
    defaultCashDeposit: policy.deposit.defaultCashDeposit,
  };
}
