import type { Prisma } from '@prisma/client';
import { DELIVERY_STATUS, canTransitionDelivery } from '../domain/delivery-status';

export interface RentalDeliveryJobInput {
  shopId: string;
  orderId: string;
  direction: string;
  method: string;
  scheduledAt?: Date;
  recipientName?: string;
  recipientPhone?: string;
  addressLine?: string;
  ward?: string;
  district?: string;
  city?: string;
  province?: string;
  shippingFee: number;
  createdBy?: string;
}

/** Delivery-owned persistence capability for the caller's Rental transaction. */
export async function createRentalDeliveryJob(
  tx: Prisma.TransactionClient,
  input: RentalDeliveryJobInput,
): Promise<void> {
  await tx.deliveryJob.create({
    data: {
      shopId: input.shopId,
      orderId: input.orderId,
      direction: input.direction,
      method: input.method,
      scheduledAt: input.scheduledAt,
      recipientName: input.recipientName,
      recipientPhone: input.recipientPhone,
      addressLine: input.addressLine,
      ward: input.ward,
      district: input.district,
      city: input.city,
      province: input.province,
      shippingFee: input.shippingFee,
      createdBy: input.createdBy,
    },
  });
}

/** Preflight and cancellation stay inside the Rental lifecycle transaction. */
export async function canCancelRentalDeliveries(
  tx: Prisma.TransactionClient,
  input: { shopId: string; orderId: string },
): Promise<boolean> {
  const deliveries = await tx.deliveryJob.findMany({
    where: { orderId: input.orderId, shopId: input.shopId },
    select: { status: true },
  });
  if (
    deliveries.some(
      (delivery) =>
        delivery.status !== DELIVERY_STATUS.CANCELLED &&
        !canTransitionDelivery(delivery.status, DELIVERY_STATUS.CANCELLED),
    )
  ) {
    return false;
  }

  return true;
}

export async function cancelPendingRentalDeliveries(
  tx: Prisma.TransactionClient,
  input: { shopId: string; orderId: string },
): Promise<void> {
  await tx.deliveryJob.updateMany({
    where: {
      orderId: input.orderId,
      shopId: input.shopId,
      status: { in: [DELIVERY_STATUS.PENDING, DELIVERY_STATUS.READY] },
    },
    data: { status: DELIVERY_STATUS.CANCELLED },
  });
}
