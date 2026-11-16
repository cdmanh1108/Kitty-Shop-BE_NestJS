import type { JsonValue } from '@common/types/json';
import { RentalInvariantError } from './rental-errors';

export const RENTAL_PRICING_VERSION = {
  CYCLE: 'CYCLE_V1',
  FREE_ACCESSORY: 'FREE_ACCESSORY_V1',
} as const;

export type RentalPricingVersion =
  (typeof RENTAL_PRICING_VERSION)[keyof typeof RENTAL_PRICING_VERSION];

export function getRentalPricingVersion(snapshot: JsonValue): RentalPricingVersion {
  if (snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)) {
    const version = snapshot.version;
    if (
      version === RENTAL_PRICING_VERSION.CYCLE ||
      version === RENTAL_PRICING_VERSION.FREE_ACCESSORY
    )
      return version;
  }
  throw new RentalInvariantError(
    'UNSUPPORTED_RENTAL_PRICING_VERSION',
    'Phiên bản chính sách giá thuê của đơn chưa được hỗ trợ.',
  );
}
