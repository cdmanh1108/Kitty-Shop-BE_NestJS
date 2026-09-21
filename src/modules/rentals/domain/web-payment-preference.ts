/**
 * A storefront customer's stated payment preference at booking time. It is
 * intentionally separate from the payment method on an actual receipt.
 */
export const WEB_PAYMENT_PREFERENCES = ['cash', 'bank_transfer', 'momo'] as const;

export type WebPaymentPreference = (typeof WEB_PAYMENT_PREFERENCES)[number];

/** Legacy rows have no value; unexpected stored values are never inferred as a preference. */
export function toWebPaymentPreference(
  value: string | null | undefined,
): WebPaymentPreference | null {
  return WEB_PAYMENT_PREFERENCES.includes(value as WebPaymentPreference)
    ? (value as WebPaymentPreference)
    : null;
}
