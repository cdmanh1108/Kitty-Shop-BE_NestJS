import type { JsonSerialized } from '@common/types/json';
import { paginateMeta } from '@common/types/pagination';
import { recomputeOrderPaymentState } from '@database/prisma/order-payment-state';
import { PrismaService } from '@database/prisma/prisma.service';
import { serializableTransaction } from '@database/prisma/transaction';
import { Injectable } from '@nestjs/common';
import { Prisma, type PrismaClient } from '@prisma/client';
import type { RentalOrderDetails } from '../domain/rental.models';
import {
  RentalOverlapError,
  type BookableVariant,
  type CreateRentalOrderData,
  type IdempotencyClaim,
  type RentalRepository,
} from '../domain/rental.repository';

@Injectable()
export class PrismaRentalRepository implements RentalRepository {
  constructor(private readonly prisma: PrismaService) {}

  async customerExists(shopId: string, customerId: string): Promise<boolean> {
    return (
      (await this.prisma.customer.count({
        where: { id: customerId, shopId, status: 'ACTIVE', archivedAt: null },
      })) > 0
    );
  }

  async locationExists(shopId: string, locationId: string): Promise<boolean> {
    return (
      (await this.prisma.shopLocation.count({
        where: { id: locationId, shopId, isActive: true },
      })) > 0
    );
  }

  async getBookableVariant(input: {
    shopId: string;
    variantId: string;
    durationDays: number;
    from: Date;
    until: Date;
  }): Promise<BookableVariant | null> {
    const variant = await this.prisma.productVariant.findFirst({
      where: {
        id: input.variantId,
        shopId: input.shopId,
        status: 'ACTIVE',
        archivedAt: null,
        product: { status: 'ACTIVE', isRentable: true, archivedAt: null },
      },
      include: {
        product: {
          include: {
            rentalRates: {
              where: { variantId: null, isActive: true, durationDays: input.durationDays },
            },
          },
        },
        size: true,
        color: true,
        rentalRates: { where: { isActive: true, durationDays: input.durationDays } },
        inventoryItems: {
          where: {
            isActive: true,
            archivedAt: null,
            currentStatus: { notIn: ['CLEANING', 'REPAIRING', 'DAMAGED', 'LOST', 'RETIRED'] },
            allocations: {
              none: {
                status: { in: ['HELD', 'CONFIRMED', 'ACTIVE'] },
                reservedFrom: { lt: input.until },
                reservedUntil: { gt: input.from },
              },
            },
          },
          orderBy: [{ totalRentalCount: 'asc' }, { sku: 'asc' }],
        },
      },
    });
    if (!variant) return null;
    const rate = variant.rentalRates[0] ?? variant.product.rentalRates[0];
    const deposit = variant.depositAmountOverride ?? variant.product.defaultDepositAmount;
    return {
      id: variant.id,
      variantCode: variant.variantCode,
      productId: variant.productId,
      productName: variant.product.name,
      sizeName: variant.size?.name ?? null,
      colorName: variant.color?.name ?? null,
      depositPerItem: Number(deposit),
      ratePrice: rate ? Number(rate.price) : null,
      availableInventory: variant.inventoryItems.map((item) => ({ id: item.id, sku: item.sku })),
    };
  }

  async createOrder(data: CreateRentalOrderData) {
    try {
      return await serializableTransaction(this.prisma, async (tx) => {
        const rentalSubtotal = data.lines.reduce((sum, line) => sum + line.lineTotal, 0);
        const explicitChargesTotal = data.charges.reduce(
          (sum, charge) => sum + charge.amount * charge.quantity,
          0,
        );
        const shippingTotal = data.delivery?.shippingFee ?? 0;
        const chargesTotal = explicitChargesTotal + shippingTotal;
        const depositRequired = data.lines.reduce((sum, line) => sum + line.depositAmount, 0);
        const grandTotal = Math.max(0, rentalSubtotal + chargesTotal - data.discountTotal);

        const order = await tx.rentalOrder.create({
          data: {
            shopId: data.shopId,
            orderNumber: data.orderNumber,
            customerId: data.customerId,
            locationId: data.locationId,
            rentalStartAt: data.rentalStartAt,
            rentalEndAt: data.rentalEndAt,
            status: 'RESERVED',
            paymentStatus: grandTotal === 0 ? 'PAID' : 'UNPAID',
            depositStatus: depositRequired === 0 ? 'NOT_REQUIRED' : 'PENDING',
            rentalSubtotal,
            chargesTotal,
            discountTotal: data.discountTotal,
            depositRequired,
            grandTotal,
            note: data.note,
            internalNote: data.internalNote,
            createdBy: data.createdBy,
            updatedBy: data.createdBy,
          },
        });

        for (const line of data.lines) {
          const orderItem = await tx.rentalOrderItem.create({
            data: {
              shopId: data.shopId,
              orderId: order.id,
              productId: line.productId,
              variantId: line.variantId,
              quantity: line.quantity,
              rentalStartAt: data.rentalStartAt,
              rentalEndAt: data.rentalEndAt,
              productNameSnapshot: line.productName,
              variantNameSnapshot: line.variantName,
              skuSnapshot: line.quantity === 1 ? line.inventory[0]?.sku : undefined,
              unitRentalPrice: line.unitRentalPrice,
              depositAmount: line.depositAmount,
              lineTotal: line.lineTotal,
              pricingSnapshot: line.pricingSnapshot as Prisma.InputJsonValue,
              status: 'RESERVED',
            },
          });

          for (const inventory of line.inventory) {
            await tx.rentalItemAllocation.create({
              data: {
                shopId: data.shopId,
                orderId: order.id,
                orderItemId: orderItem.id,
                inventoryItemId: inventory.id,
                reservedFrom: data.rentalStartAt,
                reservedUntil: data.rentalEndAt,
                status: 'HELD',
                createdBy: data.createdBy,
              },
            });
          }
        }

        if (data.charges.length > 0) {
          await tx.rentalOrderCharge.createMany({
            data: data.charges.map((charge) => ({
              shopId: data.shopId,
              orderId: order.id,
              chargeType: charge.chargeType,
              description: charge.description,
              amount: charge.amount,
              quantity: charge.quantity,
              createdBy: data.createdBy,
            })),
          });
        }

        if (data.delivery) {
          await tx.deliveryJob.create({
            data: {
              shopId: data.shopId,
              orderId: order.id,
              direction: data.delivery.direction,
              method: data.delivery.method,
              scheduledAt: data.delivery.scheduledAt,
              recipientName: data.delivery.recipientName,
              recipientPhone: data.delivery.recipientPhone,
              addressLine: data.delivery.addressLine,
              ward: data.delivery.ward,
              district: data.delivery.district,
              city: data.delivery.city,
              province: data.delivery.province,
              shippingFee: data.delivery.shippingFee,
              createdBy: data.createdBy,
            },
          });
          if (data.delivery.shippingFee > 0) {
            await tx.rentalOrderCharge.create({
              data: {
                shopId: data.shopId,
                orderId: order.id,
                chargeType: 'SHIPPING',
                description: 'Shipping fee',
                amount: data.delivery.shippingFee,
                quantity: 1,
                createdBy: data.createdBy,
              },
            });
          }
        }

        await tx.rentalOrderStatusHistory.create({
          data: {
            shopId: data.shopId,
            orderId: order.id,
            toStatus: 'RESERVED',
            changedBy: data.createdBy,
          },
        });
        await tx.outboxEvent.create({
          data: {
            shopId: data.shopId,
            eventType: 'RENTAL_ORDER_CREATED',
            aggregateType: 'rental_order',
            aggregateId: order.id,
            payload: { orderId: order.id },
          },
        });
        const result = await this.getWithTx(tx, data.shopId, order.id);
        if (data.idempotency) {
          await tx.idempotencyRecord.update({
            where: {
              shopId_scope_key: {
                shopId: data.shopId,
                scope: data.idempotency.scope,
                key: data.idempotency.key,
              },
            },
            data: {
              responseCode: 201,
              responseBody: JSON.parse(JSON.stringify(result)) as Prisma.InputJsonValue,
              completedAt: new Date(),
            },
          });
        }
        return result;
      });
    } catch (error) {
      if (this.isOverlapError(error)) throw new RentalOverlapError();
      throw error;
    }
  }

  async list(input: {
    shopId: string;
    page: number;
    limit: number;
    search?: string;
    status?: string;
    paymentStatus?: string;
    from?: Date;
    until?: Date;
  }) {
    const where = {
      shopId: input.shopId,
      ...(input.status ? { status: input.status } : {}),
      ...(input.paymentStatus ? { paymentStatus: input.paymentStatus } : {}),
      ...(input.from || input.until
        ? {
            rentalStartAt: input.until ? { lt: input.until } : undefined,
            rentalEndAt: input.from ? { gt: input.from } : undefined,
          }
        : {}),
      ...(input.search
        ? {
            OR: [
              { orderNumber: { contains: input.search, mode: 'insensitive' as const } },
              { customer: { fullName: { contains: input.search, mode: 'insensitive' as const } } },
              { customer: { normalizedPhone: { contains: input.search.replace(/\D/g, '') } } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.rentalOrder.findMany({
        where,
        include: {
          customer: { select: { id: true, fullName: true, phone: true } },
          items: {
            select: {
              id: true,
              productNameSnapshot: true,
              variantNameSnapshot: true,
              quantity: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (input.page - 1) * input.limit,
        take: input.limit,
      }),
      this.prisma.rentalOrder.count({ where }),
    ]);
    return { items, meta: paginateMeta(input.page, input.limit, total) };
  }

  get(shopId: string, id: string) {
    return this.getWithTx(this.prisma, shopId, id);
  }

  async getStatus(shopId: string, id: string): Promise<string | null> {
    const order = await this.prisma.rentalOrder.findFirst({
      where: { id, shopId },
      select: { status: true },
    });
    return order?.status ?? null;
  }

  getSchedule(shopId: string, id: string) {
    return this.prisma.rentalOrder.findFirst({
      where: { id, shopId },
      select: { status: true, rentalStartAt: true, rentalEndAt: true },
    });
  }

  async transition(input: {
    shopId: string;
    orderId: string;
    fromStatuses: string[];
    toStatus: string;
    changedBy: string;
    reason?: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.rentalOrder.findFirst({
        where: { id: input.orderId, shopId: input.shopId },
      });
      if (!order || !input.fromStatuses.includes(order.status)) return null;
      const now = new Date();
      const updateData: Prisma.RentalOrderUpdateManyMutationInput = {
        status: input.toStatus,
        updatedBy: input.changedBy,
        ...(input.toStatus === 'ACTIVE' ? { actualStartedAt: now } : {}),
        ...(input.toStatus === 'COMPLETED' ? { completedAt: now } : {}),
        ...(input.toStatus === 'CANCELLED' ? { cancelledAt: now } : {}),
      };
      const transitioned = await tx.rentalOrder.updateMany({
        where: { id: order.id, shopId: input.shopId, status: order.status },
        data: updateData,
      });
      if (transitioned.count !== 1) return null;
      await tx.rentalOrderStatusHistory.create({
        data: {
          shopId: input.shopId,
          orderId: order.id,
          fromStatus: order.status,
          toStatus: input.toStatus,
          reason: input.reason,
          changedBy: input.changedBy,
        },
      });

      if (input.toStatus === 'CONFIRMED') {
        await tx.rentalItemAllocation.updateMany({
          where: { orderId: order.id, status: 'HELD' },
          data: { status: 'CONFIRMED' },
        });
        await tx.rentalOrderItem.updateMany({
          where: { orderId: order.id },
          data: { status: 'CONFIRMED' },
        });
      } else if (input.toStatus === 'ACTIVE') {
        await tx.rentalItemAllocation.updateMany({
          where: { orderId: order.id, status: { in: ['HELD', 'CONFIRMED'] } },
          data: { status: 'ACTIVE' },
        });
        await tx.rentalOrderItem.updateMany({
          where: { orderId: order.id },
          data: { status: 'ACTIVE' },
        });
        const allocations = await tx.rentalItemAllocation.findMany({
          where: { orderId: order.id },
          select: { inventoryItemId: true },
        });
        for (const allocation of allocations) {
          const inventory = await tx.inventoryItem.findUniqueOrThrow({
            where: { id: allocation.inventoryItemId },
          });
          await tx.inventoryItem.update({
            where: { id: inventory.id },
            data: { currentStatus: 'RENTED', lastRentedAt: now },
          });
          await tx.inventoryStatusHistory.create({
            data: {
              shopId: input.shopId,
              inventoryItemId: inventory.id,
              fromStatus: inventory.currentStatus,
              toStatus: 'RENTED',
              orderId: order.id,
              changedBy: input.changedBy,
              reason: 'ORDER_STARTED',
            },
          });
        }
      } else if (input.toStatus === 'COMPLETED') {
        await tx.rentalItemAllocation.updateMany({
          where: { orderId: order.id, status: 'ACTIVE' },
          data: { status: 'RETURNED', releasedAt: now },
        });
        await tx.rentalOrderItem.updateMany({
          where: { orderId: order.id },
          data: { status: 'RETURNED' },
        });
        const allocations = await tx.rentalItemAllocation.findMany({
          where: { orderId: order.id },
          select: { inventoryItemId: true },
        });
        for (const allocation of allocations) {
          const inventory = await tx.inventoryItem.findUniqueOrThrow({
            where: { id: allocation.inventoryItemId },
          });
          await tx.inventoryItem.update({
            where: { id: inventory.id },
            data: {
              currentStatus: 'CLEANING',
              totalRentalCount: { increment: 1 },
              lastRentedAt: now,
            },
          });
          await tx.inventoryStatusHistory.create({
            data: {
              shopId: input.shopId,
              inventoryItemId: inventory.id,
              fromStatus: inventory.currentStatus,
              toStatus: 'CLEANING',
              orderId: order.id,
              changedBy: input.changedBy,
              reason: 'ORDER_RETURNED',
            },
          });
        }
      } else if (input.toStatus === 'CANCELLED') {
        await tx.rentalItemAllocation.updateMany({
          where: { orderId: order.id, status: { in: ['HELD', 'CONFIRMED'] } },
          data: { status: 'CANCELLED', releasedAt: now },
        });
        await tx.rentalOrderItem.updateMany({
          where: { orderId: order.id },
          data: { status: 'CANCELLED' },
        });
      }

      await tx.outboxEvent.create({
        data: {
          shopId: input.shopId,
          eventType: `RENTAL_ORDER_${input.toStatus}`,
          aggregateType: 'rental_order',
          aggregateId: order.id,
          payload: { orderId: order.id, fromStatus: order.status, toStatus: input.toStatus },
        },
      });
      return this.getWithTx(tx, input.shopId, order.id);
    });
  }

  async reschedule(input: {
    shopId: string;
    orderId: string;
    from: Date;
    until: Date;
    changedBy: string;
  }) {
    try {
      return await serializableTransaction(this.prisma, async (tx) => {
        const order = await tx.rentalOrder.findFirst({
          where: { id: input.orderId, shopId: input.shopId },
        });
        if (!order || !['RESERVED', 'CONFIRMED'].includes(order.status)) return null;
        const rescheduled = await tx.rentalOrder.updateMany({
          where: { id: order.id, shopId: input.shopId, status: order.status },
          data: { rentalStartAt: input.from, rentalEndAt: input.until, updatedBy: input.changedBy },
        });
        if (rescheduled.count !== 1) return null;
        await tx.rentalOrderItem.updateMany({
          where: { orderId: order.id },
          data: { rentalStartAt: input.from, rentalEndAt: input.until },
        });
        const allocations = await tx.rentalItemAllocation.findMany({
          where: { orderId: order.id, status: { in: ['HELD', 'CONFIRMED'] } },
        });
        for (const allocation of allocations) {
          await tx.rentalItemAllocation.update({
            where: { id: allocation.id },
            data: { reservedFrom: input.from, reservedUntil: input.until },
          });
        }
        await tx.outboxEvent.create({
          data: {
            shopId: input.shopId,
            eventType: 'RENTAL_ORDER_RESCHEDULED',
            aggregateType: 'rental_order',
            aggregateId: order.id,
            payload: {
              orderId: order.id,
              rentalStartAt: input.from.toISOString(),
              rentalEndAt: input.until.toISOString(),
            },
          },
        });
        return this.getWithTx(tx, input.shopId, order.id);
      });
    } catch (error) {
      if (this.isOverlapError(error)) throw new RentalOverlapError();
      throw error;
    }
  }

  async addCharge(input: {
    shopId: string;
    orderId: string;
    chargeType: string;
    description?: string;
    amount: number;
    quantity: number;
    createdBy: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.rentalOrder.findFirst({
        where: { id: input.orderId, shopId: input.shopId },
      });
      if (!order) return null;
      await tx.rentalOrderCharge.create({
        data: {
          shopId: input.shopId,
          orderId: input.orderId,
          chargeType: input.chargeType,
          description: input.description,
          amount: input.amount,
          quantity: input.quantity,
          createdBy: input.createdBy,
        },
      });
      const increment = input.amount * input.quantity;
      await tx.rentalOrder.update({
        where: { id: input.orderId },
        data: {
          chargesTotal: { increment },
          grandTotal: { increment },
          updatedBy: input.createdBy,
        },
      });
      await recomputeOrderPaymentState(tx, input.orderId);
      return this.getWithTx(tx, input.shopId, input.orderId);
    });
  }

  async claimIdempotency(input: {
    shopId: string;
    scope: string;
    key: string;
    requestHash: string;
    expiresAt: Date;
  }): Promise<IdempotencyClaim> {
    await this.prisma.idempotencyRecord.deleteMany({
      where: {
        shopId: input.shopId,
        scope: input.scope,
        key: input.key,
        expiresAt: { lte: new Date() },
      },
    });

    try {
      await this.prisma.idempotencyRecord.create({ data: input });
      return { state: 'CLAIMED' as const };
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002')
        throw error;
      const existing = await this.prisma.idempotencyRecord.findUnique({
        where: { shopId_scope_key: { shopId: input.shopId, scope: input.scope, key: input.key } },
        select: { requestHash: true, responseBody: true, completedAt: true },
      });
      if (!existing) return this.claimIdempotency(input);
      if (existing.requestHash !== input.requestHash) return { state: 'HASH_MISMATCH' as const };
      if (existing.completedAt)
        return {
          state: 'COMPLETED' as const,
          // This scope persists only JSON.stringify(getWithTx(...)) in createOrder.
          // The stored JSON is the serialized read model, not a live Prisma record.
          responseBody: existing.responseBody as JsonSerialized<RentalOrderDetails>,
        };
      return { state: 'IN_PROGRESS' as const };
    }
  }

  async releaseIdempotency(shopId: string, scope: string, key: string): Promise<void> {
    await this.prisma.idempotencyRecord.deleteMany({
      where: { shopId, scope, key, completedAt: null },
    });
  }

  private getWithTx(tx: Prisma.TransactionClient | PrismaClient, shopId: string, id: string) {
    return tx.rentalOrder.findFirst({
      where: { id, shopId },
      include: {
        customer: true,
        location: true,
        items: { include: { allocations: { include: { inventoryItem: true } } } },
        charges: { where: { voidedAt: null }, orderBy: { createdAt: 'asc' } },
        payments: { where: { status: 'COMPLETED', voidedAt: null }, orderBy: { paidAt: 'asc' } },
        deliveries: { orderBy: { createdAt: 'asc' } },
        statusHistory: { orderBy: { changedAt: 'asc' } },
      },
    });
  }

  private isOverlapError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return (
      message.includes('rental_item_no_overlap') ||
      message.toLowerCase().includes('exclusion constraint')
    );
  }
}
