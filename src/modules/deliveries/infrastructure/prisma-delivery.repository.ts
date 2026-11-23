import type { DeliveryCreatedEvent } from '../domain/delivery.events';
import { CLOCK, type Clock } from '@common/clock/clock';
import { paginateMeta } from '@common/types/pagination';
import {
  DELIVERY_METHOD,
  DELIVERY_STATUS,
  canTransitionDelivery,
} from '@modules/deliveries/domain/delivery-status';
import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@database/prisma/prisma.service';
import { serializableTransaction } from '@database/prisma/transaction';
import { lockRentalOrder } from '@modules/rentals/public/rental-order-lock';
import { addDeliveryShippingCharge } from '@modules/rentals/public/delivery-shipping-charge-transaction';
import type { DeliveryPageCriteria, DeliveryRepository } from '../domain/delivery.repository';

const includeOrder = {
  order: {
    select: { orderNumber: true, customer: { select: { fullName: true, phone: true } } },
  },
} satisfies Prisma.DeliveryJobInclude;

const completedStatuses = new Set<string>([
  DELIVERY_STATUS.DELIVERED,
  DELIVERY_STATUS.FAILED,
  DELIVERY_STATUS.CANCELLED,
]);

@Injectable()
export class PrismaDeliveryRepository implements DeliveryRepository {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock = { now: () => new Date() },
  ) {}

  list(shopId: string, orderId?: string) {
    return this.prisma.deliveryJob.findMany({
      where: { shopId, ...(orderId ? { orderId } : {}) },
      include: includeOrder,
      orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'desc' }],
    });
  }

  get(shopId: string, id: string) {
    return this.prisma.deliveryJob.findFirst({ where: { shopId, id }, include: includeOrder });
  }

  async page(input: DeliveryPageCriteria) {
    const { shopId, page, limit, orderId, direction, method, status, from, until } = input;
    const search = input.search?.trim().replace(/\s+/g, ' ');
    const joins = search
      ? Prisma.sql`
          JOIN rental_orders o ON o.id = d.order_id AND o.shop_id = d.shop_id
          JOIN customers c ON c.id = o.customer_id AND c.shop_id = d.shop_id
        `
      : Prisma.empty;
    const condition = search
      ? Prisma.sql`AND strpos(
          unaccent(lower(concat_ws(' ', o.order_number, c.full_name, d.recipient_name,
            d.recipient_phone, d.tracking_code))),
          unaccent(lower(${search}))
        ) > 0`
      : Prisma.empty;
    const scope = Prisma.sql`
      FROM delivery_jobs d ${joins}
      WHERE d.shop_id = ${shopId}::uuid
        ${orderId ? Prisma.sql`AND d.order_id = ${orderId}::uuid` : Prisma.empty}
        ${direction ? Prisma.sql`AND d.direction = ${direction}` : Prisma.empty}
        ${method ? Prisma.sql`AND d.method = ${method}` : Prisma.empty}
        ${status ? Prisma.sql`AND d.status = ${status}` : Prisma.empty}
        ${from ? Prisma.sql`AND d.scheduled_at >= ${from}` : Prisma.empty}
        ${until ? Prisma.sql`AND d.scheduled_at < ${until}` : Prisma.empty}
        ${condition}
    `;
    return this.prisma.$transaction(
      async (tx) => {
        const summaries = await tx.deliveryJob.groupBy({
          by: ['method', 'status'],
          where: { shopId },
          _count: { _all: true },
        });
        const summary = {
          pendingCount: 0,
          pickupCount: 0,
          shopDeliveryCount: 0,
          thirdPartyCount: 0,
        };
        for (const group of summaries) {
          const count = group._count._all;
          if (!completedStatuses.has(group.status)) summary.pendingCount += count;
          if (group.method === DELIVERY_METHOD.CUSTOMER_PICKUP) summary.pickupCount += count;
          if (group.method === DELIVERY_METHOD.SHOP_DELIVERY) summary.shopDeliveryCount += count;
          if (group.method === DELIVERY_METHOD.THIRD_PARTY_SHIPPER)
            summary.thirdPartyCount += count;
        }
        const [count] = await tx.$queryRaw<Array<{ total: number }>>`
        SELECT count(*)::int AS total ${scope}
      `;
        const meta = paginateMeta(page, limit, count?.total ?? 0);
        if (page > meta.totalPages) return { items: [], meta, summary };

        const ids = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT d.id ${scope}
        ORDER BY d.scheduled_at ASC NULLS LAST, d.created_at DESC, d.id DESC
        LIMIT ${limit} OFFSET ${(page - 1) * limit}
      `;
        const items = await tx.deliveryJob.findMany({
          where: { shopId, id: { in: ids.map(({ id }) => id) } },
          include: includeOrder,
          orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'desc' }, { id: 'desc' }],
        });
        return { items, meta, summary };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
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
