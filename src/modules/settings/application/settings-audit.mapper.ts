import type { AuditSnapshot } from '@modules/audit/public/audit-contracts';
import type { RentalPolicy } from '../domain/rental-policy';

export function toRentalPolicyAuditSnapshot(policy: RentalPolicy): AuditSnapshot {
  return {
    defaultRentalPrice: policy.rentalPricing.defaultRentalPrice,
    defaultCashDeposit: policy.deposit.defaultCashDeposit,
    allowedDepositMethods: [...policy.deposit.allowedMethods],
    allowedDocumentTypes: [...policy.deposit.allowedDocumentTypes],
    maxRescheduleDaysFromBooking: policy.reschedule.maxDaysFromBooking,
    lateFeePerItemPerDay: policy.lateReturn.feePerItemPerDay,
    newRentalChargeFromLateDay: policy.lateReturn.newRentalChargeFromLateDay,
    cleaningFeeMin: policy.specialCleaning.feeMin,
    cleaningFeeMax: policy.specialCleaning.feeMax,
    loyaltyEnabled: policy.loyalty.enabled,
    loyaltyRentalsRequired: policy.loyalty.rentalsRequired,
    loyaltyRewardRentalValue: policy.loyalty.rewardRentalValue,
  };
}
