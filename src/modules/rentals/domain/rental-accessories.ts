import { RentalInvariantError } from './rental-errors';

export const RENTAL_BILLING_ROLE = {
  PAID: 'PAID',
  FREE_ACCESSORY: 'FREE_ACCESSORY',
} as const;
export type RentalBillingRole = (typeof RENTAL_BILLING_ROLE)[keyof typeof RENTAL_BILLING_ROLE];
export const FREE_ACCESSORIES_PER_PAID_ITEM = 2;

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

/** Entitlements count physical paid units, including paid accessories and zero price overrides. */
export function rentalAccessoryAllowance(
  items: readonly { quantity: number; billingRole?: string }[],
): RentalAccessoryAllowance {
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
  const allowanceQuantity = billableQuantity * FREE_ACCESSORIES_PER_PAID_ITEM;
  if (
    !Number.isSafeInteger(billableQuantity) ||
    !Number.isSafeInteger(allowanceQuantity) ||
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
  if (freeAccessoryQuantity > allowanceQuantity)
    throw new RentalInvariantError(
      'FREE_ACCESSORY_ALLOWANCE_EXCEEDED',
      'Mỗi món thuê có tính phí được kèm tối đa 2 phụ kiện miễn phí. Vui lòng bỏ bớt hoặc chọn thuê có phí cho phần vượt mức.',
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
