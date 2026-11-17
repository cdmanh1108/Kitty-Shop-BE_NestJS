import { RentalInvariantError } from './rental-errors';

export const RENTAL_BILLING_ROLE = {
  PAID: 'PAID',
  FREE_ACCESSORY: 'FREE_ACCESSORY',
} as const;
export type RentalBillingRole = (typeof RENTAL_BILLING_ROLE)[keyof typeof RENTAL_BILLING_ROLE];

export interface RentalAccessoryAllowance {
  billableQuantity: number;
  freeAccessoryQuantity: number;
  remainingFreeAccessoryQuantity: number;
}

export function rentalBillingRole(role?: string): RentalBillingRole {
  if (role === undefined || role === RENTAL_BILLING_ROLE.PAID) return RENTAL_BILLING_ROLE.PAID;
  if (role === RENTAL_BILLING_ROLE.FREE_ACCESSORY) return role;
  throw new RentalInvariantError(
    'INVALID_RENTAL_BILLING_ROLE',
    'Vai trò tính tiền của món thuê không hợp lệ.',
  );
}

/** Historical reads may contain no lines; role, never the monetary amount, selects paid units. */
export function rentalPaidQuantity(
  items: readonly { quantity: number; billingRole?: string }[],
): number {
  return items.reduce(
    (sum, item) =>
      sum + (rentalBillingRole(item.billingRole) === RENTAL_BILLING_ROLE.PAID ? item.quantity : 0),
    0,
  );
}

/** Validate physical counts without consulting mutable catalog entitlements. */
export function rentalAccessoryCounts(
  items: readonly { quantity: number; billingRole?: string }[],
) {
  let billableQuantity = 0;
  let freeAccessoryQuantity = 0;
  for (const item of items) {
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 1)
      throw new RentalInvariantError(
        'INVALID_RENTAL_PRICING_QUANTITY',
        'Số món thuê phải là số nguyên dương hợp lệ.',
      );
    if (rentalBillingRole(item.billingRole) === RENTAL_BILLING_ROLE.FREE_ACCESSORY)
      freeAccessoryQuantity += item.quantity;
    else billableQuantity += item.quantity;
  }
  if (
    !Number.isSafeInteger(billableQuantity) ||
    !Number.isSafeInteger(freeAccessoryQuantity) ||
    !Number.isSafeInteger(billableQuantity + freeAccessoryQuantity)
  )
    throw new RentalInvariantError(
      'INVALID_RENTAL_PRICING_QUANTITY',
      'Tổng số món thuê không hợp lệ.',
    );
  if (billableQuantity < 1)
    throw new RentalInvariantError(
      'PAID_RENTAL_ITEM_REQUIRED',
      'Đơn thuê cần ít nhất một món thuê có tính phí để chọn phụ kiện đi kèm.',
    );
  return { billableQuantity, freeAccessoryQuantity };
}

/** Limits come from canonical product reads, never customer input or monetary amounts. */
export function rentalAccessoryAllowance(
  items: readonly { quantity: number; billingRole?: string; freeAccessoryLimit?: number }[],
): RentalAccessoryAllowance {
  const { billableQuantity, freeAccessoryQuantity } = rentalAccessoryCounts(items);
  let allowanceQuantity = 0;
  for (const item of items) {
    if (rentalBillingRole(item.billingRole) === RENTAL_BILLING_ROLE.FREE_ACCESSORY) continue;
    const limit = item.freeAccessoryLimit ?? 1;
    if (!Number.isSafeInteger(limit) || limit < 0 || limit > 2147483647)
      throw new RentalInvariantError(
        'INVALID_FREE_ACCESSORY_LIMIT',
        'Số phụ kiện miễn phí của sản phẩm không hợp lệ.',
      );
    allowanceQuantity += item.quantity * limit;
  }
  if (!Number.isSafeInteger(allowanceQuantity))
    throw new RentalInvariantError(
      'INVALID_RENTAL_PRICING_QUANTITY',
      'Tổng hạn mức phụ kiện không hợp lệ.',
    );
  if (freeAccessoryQuantity > allowanceQuantity)
    throw new RentalInvariantError(
      'FREE_ACCESSORY_ALLOWANCE_EXCEEDED',
      `Đơn thuê được kèm tối đa ${allowanceQuantity} phụ kiện miễn phí theo các sản phẩm đã chọn. Vui lòng bỏ bớt hoặc chọn thuê có phí cho phần vượt mức.`,
    );
  return {
    billableQuantity,
    freeAccessoryQuantity,
    remainingFreeAccessoryQuantity: allowanceQuantity - freeAccessoryQuantity,
  };
}

export function assertFreeAccessoryAllowed(
  role: RentalBillingRole,
  allowFreeAccessory: boolean,
): void {
  if (role === RENTAL_BILLING_ROLE.FREE_ACCESSORY && allowFreeAccessory !== true)
    throw new RentalInvariantError(
      'FREE_ACCESSORY_NOT_ALLOWED',
      'Sản phẩm này không được phép chọn thuê kèm miễn phí.',
    );
}

export function rentalSelectionKey(variantId: string, role?: string): string {
  return `${variantId}:${rentalBillingRole(role)}`;
}
