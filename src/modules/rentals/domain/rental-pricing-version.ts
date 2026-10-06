import type { JsonValue } from '@common/types/json';
import { RentalInvariantError } from './rental-errors';

export const RENTAL_PRICING_VERSION = {
  LEGACY: 'LEGACY_RATE_V1',
  CYCLE: 'CYCLE_V1',
  FREE_ACCESSORY: 'FREE_ACCESSORY_V1',
} as const;

export type RentalPricingVersion =
  (typeof RENTAL_PRICING_VERSION)[keyof typeof RENTAL_PRICING_VERSION];

/** Unversioned historical snapshots retain their original rental-rate semantics. */
export function getRentalPricingVersion(snapshot: JsonValue | null): RentalPricingVersion {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    return RENTAL_PRICING_VERSION.LEGACY;
  }
  const version = snapshot.version;
  if (version === undefined) return RENTAL_PRICING_VERSION.LEGACY;
  if (
    version === RENTAL_PRICING_VERSION.LEGACY ||
    version === RENTAL_PRICING_VERSION.CYCLE ||
    version === RENTAL_PRICING_VERSION.FREE_ACCESSORY
  ) {
    return version;
  }
  throw new RentalInvariantError(
    'UNSUPPORTED_RENTAL_PRICING_VERSION',
    'Phiên bản chính sách giá thuê của đơn chưa được hỗ trợ.',
  );
}
