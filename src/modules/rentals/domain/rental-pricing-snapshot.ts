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

export type RentalPricingSnapshot = RentalCyclePricingSnapshot | LegacyRentalPricingSnapshot;

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

export function rentalBillableQuantity(items: readonly { quantity: number }[]): number {
  let quantity = 0;
  for (const item of items) {
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 1) throw invalidQuantity();
    quantity += item.quantity;
    if (!Number.isSafeInteger(quantity)) throw invalidQuantity();
  }
  if (quantity < 1) throw invalidQuantity();
  // Complimentary lines will be excluded by the accessory plan in RP08.
  return quantity;
}

export function resolveRentalLinePricing(
  input: ResolveRentalCyclePricingInput & {
    quantity: number;
    depositPerItem: number;
    legacyUnitRentalPrice?: number;
  },
) {
  // Resolve even legacy overrides so invalid policies or supplied cycle overrides cannot pass.
  const pricing = resolveRentalCyclePricing(input);
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
  },
  durationDays: number,
  billableQuantity: number,
): void {
  const snapshot = line.pricingSnapshot;
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
  if (getRentalPricingVersion(snapshot) === RENTAL_PRICING_VERSION.LEGACY) return undefined;
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

function invalidQuantity(): RentalInvariantError {
  return new RentalInvariantError(
    'INVALID_RENTAL_PRICING_QUANTITY',
    'Số món thuê phải là số nguyên dương hợp lệ.',
  );
}
