/**
 * Immutable provenance of a rental order's creation channel.
 *
 * This is intentionally independent from customer authentication and CRM identity:
 * a guest checkout is ONLINE, while an order entered by staff remains OFFLINE even
 * when its customer also owns a storefront account.
 */
export const RENTAL_ORDER_SOURCE = {
  ONLINE: 'ONLINE',
  OFFLINE: 'OFFLINE',
} as const;

export type RentalOrderSource = (typeof RENTAL_ORDER_SOURCE)[keyof typeof RENTAL_ORDER_SOURCE];
