import { PRODUCT_KIND } from '@modules/catalog/public/product-kind';
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
  if (freeAccessoryQuantity > billableQuantity)
    throw new RentalInvariantError(
      'FREE_ACCESSORY_ALLOWANCE_EXCEEDED',
      'Mỗi món thuê có tính phí chỉ được kèm một phụ kiện miễn phí. Vui lòng chuyển phần vượt mức sang thuê có tính phí.',
    );
  return {
    billableQuantity,
    freeAccessoryQuantity,
    remainingFreeAccessoryQuantity: billableQuantity - freeAccessoryQuantity,
  };
}

export function assertFreeAccessoryKind(role: RentalBillingRole, kind: string): void {
  if (role === RENTAL_BILLING_ROLE.FREE_ACCESSORY && kind !== PRODUCT_KIND.ACCESSORY)
    throw new RentalInvariantError(
      'FREE_ACCESSORY_KIND_REQUIRED',
      'Chỉ sản phẩm thuộc loại Phụ kiện được chọn làm phụ kiện miễn phí.',
    );
}

export function rentalSelectionKey(variantId: string, role?: string): string {
  return `${variantId}:${rentalBillingRole(role)}`;
}
