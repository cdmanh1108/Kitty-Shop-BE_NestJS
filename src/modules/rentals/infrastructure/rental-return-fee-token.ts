import { createHash } from 'node:crypto';
import type { RentalReturnItemFee } from '../domain/rental-return-fees';

/** Freshness check only: persistence always recomputes fees from its own snapshot. */
export function rentalReturnFeeToken(input: {
  orderId: string;
  dueAt: Date;
  returnedAt: Date;
  items: readonly RentalReturnItemFee[];
}): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        orderId: input.orderId,
        dueAt: input.dueAt.toISOString(),
        returnedAt: input.returnedAt.toISOString(),
        items: [...input.items]
          .sort((a, b) => a.inventoryItemId.localeCompare(b.inventoryItemId))
          .map((item) => [
            item.inventoryItemId,
            item.orderItemId,
            item.billingRole,
            item.pricingVersion,
            item.calculatedLateFee,
            item.calculatedAdditionalRentalFee,
          ]),
      }),
    )
    .digest('hex');
}
