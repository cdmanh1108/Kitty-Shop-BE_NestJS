import type { DeliveryCreatedEvent } from '../domain/delivery.events';
import { CLOCK, type Clock } from '@common/clock/clock';
import { DELIVERY_STATUS, canTransitionDelivery } from '@modules/deliveries/domain/delivery-status';
import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '@database/prisma/prisma.service';
import { serializableTransaction } from '@database/prisma/transaction';
import { lockRentalOrder } from '@modules/rentals/public/rental-order-lock';
import { addDeliveryShippingCharge } from '@modules/rentals/public/delivery-shipping-charge-transaction';
import type { DeliveryRepository } from '../domain/delivery.repository';

@Injectable()
export class PrismaDeliveryRepository implements DeliveryRepository {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock = { now: () => new Date() },
  ) {}

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
      const changesMonetaryState = input.shippingFee > 0;
      if (
        changesMonetaryState &&
        !(await lockRentalOrder(tx, {
          shopId: input.shopId,
          orderId: input.orderId,
        }))
      ) {
        return null;
      }

      const orderExists = await addDeliveryShippingCharge(tx, {
        shopId: input.shopId,
        orderId: input.orderId,
        shippingFee: input.shippingFee,
        direction: input.direction,
        createdBy: input.createdBy,
      });
      if (!orderExists) return null;

      const delivery = await tx.deliveryJob.create({ data: input });
      await tx.outboxEvent.create({
        data: {
          shopId: input.shopId,
          eventType: 'DELIVERY_CREATED',
          aggregateType: 'delivery_job',
          aggregateId: delivery.id,
          payload: { deliveryId: delivery.id, orderId: input.orderId },
        } satisfies DeliveryCreatedEvent,
      });
      return delivery;
    });
  }

  async updateStatus(input: Parameters<DeliveryRepository['updateStatus']>[0]) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.deliveryJob.findFirst({
        where: { id: input.id, shopId: input.shopId },
      });
      if (!existing) return { kind: 'NOT_FOUND' } as const;
      if (!canTransitionDelivery(existing.status, input.status)) {
        return { kind: 'INVALID_TRANSITION' } as const;
      }

      const now = this.clock.now();
      const updated = await tx.deliveryJob.updateMany({
        where: { id: existing.id, shopId: input.shopId, status: existing.status },
        data: {
          status: input.status,
          shipperName: input.shipperName,
          shipperPhone: input.shipperPhone,
          trackingCode: input.trackingCode,
          ...(input.status === DELIVERY_STATUS.PICKED_UP ? { pickedUpAt: now } : {}),
          ...(input.status === DELIVERY_STATUS.DELIVERED ? { deliveredAt: now } : {}),
        },
      });
      if (updated.count !== 1) return { kind: 'CONCURRENT_MODIFICATION' } as const;

      const delivery = await tx.deliveryJob.findFirst({
        where: { id: existing.id, shopId: input.shopId, status: input.status },
      });
      if (!delivery) return { kind: 'CONCURRENT_MODIFICATION' } as const;
      return { kind: 'UPDATED', delivery, fromStatus: existing.status } as const;
    });
  }
}
