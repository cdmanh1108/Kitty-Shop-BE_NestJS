import type { JsonValue } from '@common/types/json';
import type { RentalPricingPolicy } from '@modules/settings/public/rental-policy';
import {
  multiplyRentalPricingAmount,
  resolveRentalCyclePricing,
  type ResolveRentalCyclePricingInput,
  type ResolvedRentalCyclePricing,
} from './rental-cycle-pricing';
import { RentalInvariantError } from './rental-errors';
import { getRentalPricingVersion, RENTAL_PRICING_VERSION } from './rental-pricing-version';
import {
  rentalAccessoryAllowance,
  rentalBillingRole,
  RENTAL_BILLING_ROLE,
  type RentalBillingRole,
} from './rental-accessories';

export interface RentalCyclePricingSnapshot extends ResolvedRentalCyclePricing {
  policy: RentalPricingPolicy;
  orderCyclePriceOverride: number | null;
  itemCyclePriceOverride: number | null;
  depositPerItem: number;
}

/** Historical inputs and the deprecated full-period Admin override remain supported. */
export interface LegacyRentalPricingSnapshot {
  version?: typeof RENTAL_PRICING_VERSION.LEGACY;
  durationDays: number;
  unitRentalPrice: number;
  depositPerItem: number;
}

export interface FreeAccessoryPricingSnapshot {
  version: typeof RENTAL_PRICING_VERSION.FREE_ACCESSORY;
  durationDays: number;
  billableQuantity: number;
  unitRentalPrice: 0;
  depositPerItem: 0;
}
export type RentalPricingSnapshot =
  | RentalCyclePricingSnapshot
  | LegacyRentalPricingSnapshot
  | FreeAccessoryPricingSnapshot;

const PRICING_FIELDS = [
  'durationDays',
  'billableQuantity',
  'renewalDay',
  'cycleLengthDays',
  'cycleCount',
  'additionalDayCount',
  'cyclePrice',
  'additionalDayFee',
  'unitRentalPrice',
  'priceSource',
] as const;

export function rentalBillableQuantity(
  items: readonly { quantity: number; billingRole?: string }[],
): number {
  return rentalAccessoryAllowance(items).billableQuantity;
}

export function resolveRentalLinePricing(
  input: ResolveRentalCyclePricingInput & {
    quantity: number;
    depositPerItem: number;
    legacyUnitRentalPrice?: number;
    billingRole?: RentalBillingRole;
  },
) {
  // Resolve even legacy overrides so invalid policies or supplied cycle overrides cannot pass.
  const pricing = resolveRentalCyclePricing(input);
  if (rentalBillingRole(input.billingRole) === RENTAL_BILLING_ROLE.FREE_ACCESSORY) {
    if (input.itemCyclePriceOverride !== undefined || input.legacyUnitRentalPrice !== undefined)
      throw new RentalInvariantError(
        'FREE_ACCESSORY_PRICE_OVERRIDE_NOT_ALLOWED',
        'Phụ kiện miễn phí không được nhập giá thuê riêng.',
      );
    const pricingSnapshot: FreeAccessoryPricingSnapshot = {
      version: RENTAL_PRICING_VERSION.FREE_ACCESSORY,
      durationDays: input.durationDays,
      billableQuantity: input.billableQuantity,
      unitRentalPrice: 0,
      depositPerItem: 0,
    };
    return { unitRentalPrice: 0, lineTotal: 0, depositAmount: 0, pricingSnapshot };
  }
  let pricingSnapshot: RentalPricingSnapshot;
  if (input.legacyUnitRentalPrice != null) {
    if (input.itemCyclePriceOverride != null || input.orderCyclePriceOverride != null) {
      throw new RentalInvariantError(
        'RENTAL_PRICE_OVERRIDE_CONFLICT',
        'Không thể dùng đồng thời giá ghi đè cho toàn kỳ và giá ghi đè một lượt thuê.',
      );
    }
    pricingSnapshot = {
      version: RENTAL_PRICING_VERSION.LEGACY,
      durationDays: input.durationDays,
      unitRentalPrice: input.legacyUnitRentalPrice,
      depositPerItem: input.depositPerItem,
    };
  } else {
    pricingSnapshot = {
      ...pricing,
      policy: { ...input.policy },
      orderCyclePriceOverride: input.orderCyclePriceOverride ?? null,
      itemCyclePriceOverride: input.itemCyclePriceOverride ?? null,
      depositPerItem: input.depositPerItem,
    };
  }
  return {
    unitRentalPrice: pricingSnapshot.unitRentalPrice,
    lineTotal: multiplyRentalPricingAmount(pricingSnapshot.unitRentalPrice, input.quantity),
    depositAmount: multiplyRentalPricingAmount(input.depositPerItem, input.quantity),
    pricingSnapshot,
  };
}

/** Revalidate cycle amounts against their captured policy at the booking write boundary. */
export function assertRentalPricingLineSnapshot(
  line: {
    quantity: number;
    unitRentalPrice: number;
    lineTotal: number;
    depositAmount: number;
    pricingSnapshot: RentalPricingSnapshot;
    billingRole?: RentalBillingRole;
  },
  durationDays: number,
  billableQuantity: number,
): void {
  const snapshot = line.pricingSnapshot;
  const free = rentalBillingRole(line.billingRole) === RENTAL_BILLING_ROLE.FREE_ACCESSORY;
  if (snapshot.version === RENTAL_PRICING_VERSION.FREE_ACCESSORY) {
    if (
      !free ||
      snapshot.durationDays !== durationDays ||
      snapshot.billableQuantity !== billableQuantity ||
      snapshot.unitRentalPrice !== 0 ||
      snapshot.depositPerItem !== 0 ||
      line.unitRentalPrice !== 0 ||
      line.lineTotal !== 0 ||
      line.depositAmount !== 0
    )
      throw invalidSnapshot();
    return;
  }
  if (free) throw invalidSnapshot();
  if (snapshot.version === undefined || snapshot.version === RENTAL_PRICING_VERSION.LEGACY) return;
  if (snapshot.version !== RENTAL_PRICING_VERSION.CYCLE) throw invalidSnapshot();
  const pricing = resolveRentalCyclePricing({
    durationDays,
    billableQuantity,
    policy: snapshot.policy,
    orderCyclePriceOverride: snapshot.orderCyclePriceOverride,
    itemCyclePriceOverride: snapshot.itemCyclePriceOverride,
  });
  if (
    PRICING_FIELDS.some((key) => snapshot[key] !== pricing[key]) ||
    line.unitRentalPrice !== pricing.unitRentalPrice ||
    line.lineTotal !== multiplyRentalPricingAmount(pricing.unitRentalPrice, line.quantity) ||
    line.depositAmount !== multiplyRentalPricingAmount(snapshot.depositPerItem, line.quantity)
  )
    throw invalidSnapshot();
}

/** Reconstruct a safe public breakdown from the immutable snapshot, never today's settings. */
export function readRentalCyclePricing(
  snapshot: JsonValue | null,
): ResolvedRentalCyclePricing | undefined {
  const version = getRentalPricingVersion(snapshot);
  if (version === RENTAL_PRICING_VERSION.LEGACY) return undefined;
  if (version === RENTAL_PRICING_VERSION.FREE_ACCESSORY) {
    const record = objectValue(snapshot);
    if (
      !Number.isSafeInteger(record.durationDays) ||
      numberValue(record.durationDays) < 1 ||
      !Number.isSafeInteger(record.billableQuantity) ||
      numberValue(record.billableQuantity) < 1 ||
      record.unitRentalPrice !== 0 ||
      record.depositPerItem !== 0
    )
      throw invalidSnapshot();
    return undefined;
  }
  const record = objectValue(snapshot);
  const savedPolicy = objectValue(record.policy);
  const policy: RentalPricingPolicy = {
    defaultRentalPrice: numberValue(savedPolicy.defaultRentalPrice),
    additionalDayFee: numberValue(savedPolicy.additionalDayFee),
    bulkQuantityThreshold: numberValue(savedPolicy.bulkQuantityThreshold),
    standardRenewalDay: numberValue(savedPolicy.standardRenewalDay),
    bulkRenewalDay: numberValue(savedPolicy.bulkRenewalDay),
    maxOnlineRentalDays: numberValue(savedPolicy.maxOnlineRentalDays),
  };
  const pricing = resolveRentalCyclePricing({
    durationDays: numberValue(record.durationDays),
    billableQuantity: numberValue(record.billableQuantity),
    policy,
    orderCyclePriceOverride: optionalPrice(record.orderCyclePriceOverride),
    itemCyclePriceOverride: optionalPrice(record.itemCyclePriceOverride),
  });
  if (PRICING_FIELDS.some((key) => record[key] !== pricing[key])) throw invalidSnapshot();
  return pricing;
}

function objectValue(value: JsonValue | undefined): { [key: string]: JsonValue | undefined } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalidSnapshot();
  return value;
}

function numberValue(value: JsonValue | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw invalidSnapshot();
  return value;
}

function optionalPrice(value: JsonValue | undefined): number | null {
  if (value == null) return null;
  return numberValue(value);
}

function invalidSnapshot(): RentalInvariantError {
  return new RentalInvariantError(
    'INVALID_RENTAL_PRICING_SNAPSHOT',
    'Thông tin giá thuê đã lưu của đơn không hợp lệ.',
  );
}
