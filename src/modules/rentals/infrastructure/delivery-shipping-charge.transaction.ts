import type { Prisma } from '@prisma/client';
import { assertChargeMutationAllowed } from '../domain/rental-monetary.policy';
import { recomputeOrderPaymentState } from '@modules/finance/public/order-payment-state-transaction';

/** Rental-owned shipping-charge mutation in the caller's Delivery transaction. */
export async function addDeliveryShippingCharge(
  tx: Prisma.TransactionClient,
  input: {
    shopId: string;
    orderId: string;
    shippingFee: number;
    direction: string;
    createdBy?: string;
  },
): Promise<boolean> {
  const order = await tx.rentalOrder.findFirst({
    where: { id: input.orderId, shopId: input.shopId },
    select: { id: true, status: true },
  });
  if (!order) return false;

  if (input.shippingFee > 0) {
    const settlement = await tx.rentalSettlement.findFirst({
      where: { shopId: input.shopId, orderId: input.orderId },
      select: { orderId: true },
    });
    assertChargeMutationAllowed({ status: order.status, hasSettlement: Boolean(settlement) });

    await tx.rentalOrderCharge.create({
      data: {
        shopId: input.shopId,
        orderId: input.orderId,
        chargeType: 'SHIPPING',
        description: `Shipping fee (${input.direction})`,
        amount: input.shippingFee,
        quantity: 1,
        createdBy: input.createdBy,
      },
    });
    await tx.rentalOrder.update({
      where: { id: input.orderId },
      data: {
        chargesTotal: { increment: input.shippingFee },
        grandTotal: { increment: input.shippingFee },
        updatedBy: input.createdBy,
      },
    });
    await recomputeOrderPaymentState(tx, input.orderId);
  }
  return true;
}
