import type { RentalQuoteAmounts } from '../../src/modules/rentals/domain/rental-quote';

export function checkoutQuoteFixture(
  rentalSubtotal = 60_000,
  depositAmount = 200_000,
  shippingFee = 0,
): RentalQuoteAmounts {
  return {
    rentalSubtotal,
    depositAmount,
    shippingFee,
    discountAmount: 0,
    totalAmount: rentalSubtotal + shippingFee,
  };
}

export function quoteAmounts({
  rentalSubtotal,
  shippingFee,
  discountAmount,
  depositAmount,
  totalAmount,
}: RentalQuoteAmounts): RentalQuoteAmounts {
  return { rentalSubtotal, shippingFee, discountAmount, depositAmount, totalAmount };
}
