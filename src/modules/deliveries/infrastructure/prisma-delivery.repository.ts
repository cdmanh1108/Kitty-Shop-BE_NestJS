import { DELIVERY_STATUS } from '@modules/deliveries/domain/delivery-status';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@database/prisma/prisma.service';
import { recomputeOrderPaymentState } from '@database/prisma/order-payment-state';
import { serializableTransaction } from '@database/prisma/transaction';
import type { DeliveryRepository } from '../domain/delivery.repository';

@Injectable()
export class PrismaDeliveryRepository implements DeliveryRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(shopId: string, orderId?: string) {
    return this.prisma.deliveryJob.findMany({
      where: { shopId, ...(orderId ? { orderId } : {}) },
      include: {
        order: {
          select: { orderNumber: true, customer: { select: { fullName: true, phone: true } } },
        },
      },
      orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async create(input: Parameters<DeliveryRepository['create']>[0]) {
    return serializableTransaction(this.prisma, async (tx) => {
      const order = await tx.rentalOrder.findFirst({
        where: { id: input.orderId, shopId: input.shopId },
      });
      if (!order) return null;
      const delivery = await tx.deliveryJob.create({ data: input });
      if (input.shippingFee > 0) {
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
      await tx.outboxEvent.create({
        data: {
          shopId: input.shopId,
          eventType: 'DELIVERY_CREATED',
          aggregateType: 'delivery_job',
          aggregateId: delivery.id,
          payload: { deliveryId: delivery.id, orderId: input.orderId },
        },
      });
      return delivery;
    });
  }

  async updateStatus(input: Parameters<DeliveryRepository['updateStatus']>[0]) {
    const existing = await this.prisma.deliveryJob.findFirst({
      where: { id: input.id, shopId: input.shopId },
    });
    if (!existing) return null;
    const now = new Date();
    return this.prisma.deliveryJob.update({
      where: { id: input.id },
      data: {
        status: input.status,
        shipperName: input.shipperName,
        shipperPhone: input.shipperPhone,
        trackingCode: input.trackingCode,
        ...(input.status === DELIVERY_STATUS.PICKED_UP ? { pickedUpAt: now } : {}),
        ...(input.status === DELIVERY_STATUS.DELIVERED ? { deliveredAt: now } : {}),
      },
    });
  }
}
