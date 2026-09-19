import { PRODUCT_STATUS } from './catalog-status';

/**
 * Storefront eligibility is separate from operational rental availability.
 * Consumers must still check pricing and inventory after this predicate.
 */
export const storefrontProductEligibility = {
  isPublic: true,
  isRentable: true,
  archivedAt: null,
  status: PRODUCT_STATUS.ACTIVE,
} as const;

export const storefrontVariantEligibility = {
  archivedAt: null,
  status: PRODUCT_STATUS.ACTIVE,
} as const;
