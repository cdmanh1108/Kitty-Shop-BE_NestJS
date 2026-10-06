import type { JsonValue } from '@common/types/json';
import type { RentalPolicy } from '@modules/settings/public/rental-policy';
import { RentalInvariantError } from './rental-errors';
import { calculateRentalDurationDays } from './rental-policy';
import { rentalBillingRole, RENTAL_BILLING_ROLE } from './rental-accessories';
import { getRentalPricingVersion, RENTAL_PRICING_VERSION } from './rental-pricing-version';
import { readRentalCyclePricing } from './rental-pricing-snapshot';
import { multiplyRentalPricingAmount, sumRentalPricingAmounts } from './rental-cycle-pricing';

export interface RentalReturnFeeOverride {
  amount: number;
  reason: string;
}

export function validateRentalReturnFeeOverride(override: RentalReturnFeeOverride): void {
  if (typeof override.amount !== 'number' || !Number.isFinite(override.amount)) {
    throw new RentalInvariantError(
      'INVALID_RETURN_FEE_OVERRIDE',
      'Phí ghi đè phải là số tiền hữu hạn không âm.',
    );
  }
  multiplyRentalPricingAmount(override.amount, 1);
  if (!override.reason?.trim() || override.reason.trim().length > 2000) {
    throw new RentalInvariantError(
      'RETURN_FEE_OVERRIDE_REASON_REQUIRED',
      'Phải nhập lý do ghi đè phí, tối đa 2.000 ký tự.',
    );
  }
}

export interface RentalReturnItemFee {
  inventoryItemId: string;
  orderItemId: string;
  billingRole: string;
  pricingVersion: string;
  calculatedLateFee: number;
  calculatedAdditionalRentalFee: number;
  lateFee: number;
  additionalRentalFee: number;
  feeOverrideReason: string | null;
}

/** Continuous elapsed-day pricing; settings never reprice a cycle agreement. */
export function calculateRentalReturnFees(input: {
  rentalStartAt: Date;
  dueAt: Date;
  returnedAt: Date;
  policy: RentalPolicy;
  items: readonly {
    id: string;
    quantity: number;
    billingRole?: string;
    unitRentalPrice: { toString(): string };
    pricingSnapshot: JsonValue | null;
    allocations: readonly { inventoryItemId: string }[];
  }[];
  overrides?: readonly { inventoryItemId: string; lateFeeOverride?: RentalReturnFeeOverride }[];
}) {
  if (!Number.isFinite(input.returnedAt.getTime()) || input.returnedAt < input.rentalStartAt) {
    throw new RentalInvariantError(
      'INVALID_RETURN_TIME',
      'Thời gian trả đồ phải hợp lệ và không trước thời gian bắt đầu thuê.',
    );
  }
  const durationDays = calculateRentalDurationDays(input.rentalStartAt, input.dueAt);
  const actualDurationDays =
    input.returnedAt <= input.dueAt
      ? durationDays
      : calculateRentalDurationDays(input.rentalStartAt, input.returnedAt);
  const lateDays = Math.max(
    0,
    Math.ceil((input.returnedAt.getTime() - input.dueAt.getTime()) / 86_400_000),
  );
  const overrides = new Map<string, RentalReturnFeeOverride>();
  for (const item of input.overrides ?? []) {
    if (!item.lateFeeOverride) continue;
    if (overrides.has(item.inventoryItemId)) {
      throw new RentalInvariantError(
        'DUPLICATE_RETURN_FEE_OVERRIDE',
        'Mỗi món chỉ được ghi đè phí trả trễ một lần.',
      );
    }
    const override = item.lateFeeOverride;
    validateRentalReturnFeeOverride(override);
    overrides.set(item.inventoryItemId, override);
  }
  const fees: RentalReturnItemFee[] = [];
  const inventoryIds = new Set<string>();
  for (const item of input.items) {
    if (item.allocations.length !== item.quantity || item.quantity < 1) {
      throw new RentalInvariantError(
        'RETURN_ALLOCATION_MISMATCH',
        'Số món đang thuê không khớp số lượng trong đơn.',
      );
    }
    const billingRole = rentalBillingRole(item.billingRole);
    const free = billingRole === RENTAL_BILLING_ROLE.FREE_ACCESSORY;
    const pricingVersion = getRentalPricingVersion(item.pricingSnapshot);
    if (free !== (pricingVersion === RENTAL_PRICING_VERSION.FREE_ACCESSORY)) {
      throw new RentalInvariantError(
        'INVALID_RENTAL_PRICING_SNAPSHOT',
        'Vai trò tính phí và giá đã lưu của món đồ không khớp.',
      );
    }
    const pricing = readRentalCyclePricing(item.pricingSnapshot);
    let calculatedLateFee = 0;
    let calculatedAdditionalRentalFee = 0;
    if (!free && pricing) {
      if (pricing.durationDays !== durationDays) {
        throw new RentalInvariantError(
          'INVALID_RENTAL_PRICING_SNAPSHOT',
          'Số ngày thuê không khớp biểu giá đã lưu của đơn.',
        );
      }
      const cycles = 1 + Math.floor((actualDurationDays - 1) / pricing.cycleLengthDays);
      const additionalDays = actualDurationDays - cycles;
      const newCycles = cycles - pricing.cycleCount;
      const newAdditionalDays = additionalDays - pricing.additionalDayCount;
      calculatedLateFee =
        newAdditionalDays > 0
          ? multiplyRentalPricingAmount(pricing.additionalDayFee, newAdditionalDays)
          : 0;
      calculatedAdditionalRentalFee =
        newCycles > 0 ? multiplyRentalPricingAmount(pricing.cyclePrice, newCycles) : 0;
    } else if (!free) {
      // Historical agreements retain the previous late-return policy; no cycle backfill.
      calculatedLateFee =
        lateDays > 0
          ? multiplyRentalPricingAmount(input.policy.lateReturn.feePerItemPerDay, lateDays)
          : 0;
      calculatedAdditionalRentalFee =
        lateDays >= input.policy.lateReturn.newRentalChargeFromLateDay
          ? multiplyRentalPricingAmount(Number(item.unitRentalPrice.toString()), 1)
          : 0;
    }
    for (const allocation of item.allocations) {
      if (inventoryIds.has(allocation.inventoryItemId)) {
        throw new RentalInvariantError(
          'RETURN_ALLOCATION_MISMATCH',
          'Một món đồ bị giữ trùng trong đơn thuê.',
        );
      }
      inventoryIds.add(allocation.inventoryItemId);
      const override = overrides.get(allocation.inventoryItemId);
      if (free && override) {
        throw new RentalInvariantError(
          'FREE_ACCESSORY_LATE_FEE_NOT_ALLOWED',
          'Phụ kiện miễn phí không có phí trả trễ; chỉ được ghi nhận bồi thường mất hoặc hỏng.',
        );
      }
      fees.push({
        inventoryItemId: allocation.inventoryItemId,
        orderItemId: item.id,
        billingRole,
        pricingVersion,
        calculatedLateFee,
        calculatedAdditionalRentalFee,
        lateFee: override?.amount ?? calculatedLateFee,
        additionalRentalFee: override ? 0 : calculatedAdditionalRentalFee,
        feeOverrideReason: override?.reason.trim() ?? null,
      });
    }
  }
  if ([...overrides.keys()].some((id) => !inventoryIds.has(id))) {
    throw new RentalInvariantError(
      'UNKNOWN_RETURN_FEE_ITEM',
      'Món ghi đè phí không thuộc các món đang thuê của đơn này.',
    );
  }
  return {
    lateDays,
    durationDays,
    actualDurationDays,
    items: fees,
    lateFee: sumRentalPricingAmounts(fees.map((fee) => fee.lateFee)).toFixed(2),
    additionalRental: sumRentalPricingAmounts(fees.map((fee) => fee.additionalRentalFee)).toFixed(
      2,
    ),
  };
}
