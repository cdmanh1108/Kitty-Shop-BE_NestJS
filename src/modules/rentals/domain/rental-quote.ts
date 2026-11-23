import { RentalQuoteChangedError } from './rental-errors';

export interface RentalQuoteAmounts {
  rentalSubtotal: number;
  shippingFee: number;
  discountAmount: number;
  depositAmount: number;
  totalAmount: number;
}

export function assertRentalQuoteAmounts(
  expected: RentalQuoteAmounts,
  actual: Partial<RentalQuoteAmounts>,
): void {
  if (
    Object.entries(actual).some(
      ([key, amount]) => expected[key as keyof RentalQuoteAmounts] !== amount,
    )
  )
    throw new RentalQuoteChangedError();
}
