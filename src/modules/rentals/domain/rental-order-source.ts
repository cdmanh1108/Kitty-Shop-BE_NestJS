/**
 * Immutable provenance of a rental order's creation channel.
 *
 * This is intentionally independent from CRM identity: storefront checkouts are
 * ONLINE, while orders entered by staff remain OFFLINE even when the customer
 * also owns a storefront account.
 */
export const RENTAL_ORDER_SOURCE = {
  ONLINE: 'ONLINE',
  OFFLINE: 'OFFLINE',
} as const;

export type RentalOrderSource = (typeof RENTAL_ORDER_SOURCE)[keyof typeof RENTAL_ORDER_SOURCE];
