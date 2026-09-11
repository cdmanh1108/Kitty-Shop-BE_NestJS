import type { CurrentUser } from '@common/types/current-user';
import { AuditService } from '@modules/audit/application/audit.service';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { calculateRentalDurationDays } from '../domain/rental-policy';
import {
  RENTAL_REPOSITORY,
  RentalOverlapError,
  type CreateRentalOrderData,
  type RentalRepository,
} from '../domain/rental.repository';
import type {
  AddRentalChargeInput,
  CreateRentalOrderInput,
  RentalListQuery,
  RescheduleRentalInput,
  TransitionRentalInput,
} from './rental.contracts';

const CHARGE_TYPES = new Set([
  'RENTAL_EXTRA',
  'ACCESSORY',
  'SHIPPING',
  'LATE',
  'CLEANING',
  'DAMAGE',
  'LOST_ITEM',
  'OTHER',
]);

@Injectable()
export class RentalService {
  constructor(
    @Inject(RENTAL_REPOSITORY) private readonly repository: RentalRepository,
    private readonly audit: AuditService,
  ) {}

  list(user: CurrentUser, query: RentalListQuery) {
    return this.repository.list({
      shopId: user.shopId,
      page: query.page,
      limit: query.limit,
      search: query.search,
      status: query.status,
      paymentStatus: query.paymentStatus,
      from: query.from ? new Date(query.from) : undefined,
      until: query.until ? new Date(query.until) : undefined,
    });
  }

  async get(user: CurrentUser, id: string) {
    const order = await this.repository.get(user.shopId, id);
    if (!order) throw new NotFoundException('Rental order not found');
    return order;
  }

  async create(user: CurrentUser, input: CreateRentalOrderInput, idempotencyKey?: string) {
    const start = new Date(input.rentalStartAt);
    const end = new Date(input.rentalEndAt);
    if (start >= end)
      throw new BadRequestException('rentalStartAt must be earlier than rentalEndAt');
    if (!(await this.repository.customerExists(user.shopId, input.customerId))) {
      throw new NotFoundException('Customer not found or inactive');
    }
    if (
      input.locationId &&
      !(await this.repository.locationExists(user.shopId, input.locationId))
    ) {
      throw new NotFoundException('Shop location not found or inactive');
    }

    const variantIds = input.items.map((item) => item.variantId);
    if (new Set(variantIds).size !== variantIds.length) {
      throw new BadRequestException(
        'Each variant should appear only once in a rental order request',
      );
    }

    for (const charge of input.charges) {
      if (!CHARGE_TYPES.has(charge.chargeType)) {
        throw new BadRequestException(`Unsupported charge type: ${charge.chargeType}`);
      }
    }

    const durationDays = calculateRentalDurationDays(start, end);
    const scope = 'rental-order.create';
    const requestHash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    let idempotencyClaimed = false;

    if (idempotencyKey) {
      if (idempotencyKey.length > 255) throw new BadRequestException('Idempotency-Key is too long');
      const claim = await this.repository.claimIdempotency({
        shopId: user.shopId,
        scope,
        key: idempotencyKey,
        requestHash,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });
      if (claim.state === 'HASH_MISMATCH') {
        throw new ConflictException('Idempotency-Key was already used with a different request');
      }
      if (claim.state === 'COMPLETED') return claim.responseBody;
      if (claim.state === 'IN_PROGRESS') {
        throw new ConflictException('A request with this Idempotency-Key is already in progress');
      }
      idempotencyClaimed = true;
    }

    try {
      const lines: CreateRentalOrderData['lines'] = [];
      for (const item of input.items) {
        const variant = await this.repository.getBookableVariant({
          shopId: user.shopId,
          variantId: item.variantId,
          durationDays,
          from: start,
          until: end,
        });
        if (!variant) throw new NotFoundException(`Variant ${item.variantId} is not rentable`);
        if (variant.ratePrice === null) {
          throw new BadRequestException(
            `No ${durationDays}-day rental rate is configured for ${variant.variantCode}`,
          );
        }

        const byId = new Map(
          variant.availableInventory.map((inventory) => [inventory.id, inventory]),
        );
        let selected: Array<{ id: string; sku: string }>;
        if (item.inventoryItemIds?.length) {
          if (item.inventoryItemIds.length !== item.quantity) {
            throw new BadRequestException('inventoryItemIds count must equal quantity');
          }
          selected = item.inventoryItemIds.map((id) => {
            const inventory = byId.get(id);
            if (!inventory) {
              throw new ConflictException(`Inventory item ${id} is not available in this period`);
            }
            return inventory;
          });
        } else {
          selected = variant.availableInventory.slice(0, item.quantity);
        }
        if (selected.length < item.quantity) {
          throw new ConflictException(
            `Only ${variant.availableInventory.length} item(s) are available for ${variant.variantCode}`,
          );
        }

        const variantName = [variant.variantCode, variant.sizeName, variant.colorName]
          .filter(Boolean)
          .join(' / ');
        lines.push({
          productId: variant.productId,
          variantId: variant.id,
          productName: variant.productName,
          variantName,
          quantity: item.quantity,
          unitRentalPrice: variant.ratePrice,
          depositAmount: variant.depositPerItem * item.quantity,
          lineTotal: variant.ratePrice * item.quantity,
          pricingSnapshot: {
            durationDays,
            unitRentalPrice: variant.ratePrice,
            depositPerItem: variant.depositPerItem,
          },
          inventory: selected,
        });
      }

      const order = await this.repository.createOrder({
        orderNumber: this.createOrderNumber(),
        shopId: user.shopId,
        customerId: input.customerId,
        locationId: input.locationId,
        rentalStartAt: start,
        rentalEndAt: end,
        discountTotal: input.discountTotal,
        note: input.note,
        internalNote: input.internalNote,
        createdBy: user.memberId,
        idempotency: idempotencyKey ? { scope, key: idempotencyKey } : undefined,
        lines,
        charges: input.charges,
        delivery: input.delivery
          ? {
              ...input.delivery,
              scheduledAt: input.delivery.scheduledAt
                ? new Date(input.delivery.scheduledAt)
                : undefined,
            }
          : undefined,
      });

      await this.audit.log({
        shopId: user.shopId,
        actorUserId: user.userId,
        actorMemberId: user.memberId,
        action: 'CREATE',
        entityType: 'rental_order',
        newValues: {
          rentalStartAt: input.rentalStartAt,
          rentalEndAt: input.rentalEndAt,
          itemCount: input.items.length,
        },
      });

      return order;
    } catch (error) {
      if (idempotencyKey && idempotencyClaimed) {
        await this.repository.releaseIdempotency(user.shopId, scope, idempotencyKey);
      }
      if (error instanceof RentalOverlapError) throw new ConflictException(error.message);
      throw error;
    }
  }

  confirm(user: CurrentUser, id: string, input: TransitionRentalInput) {
    return this.transition(user, id, ['RESERVED'], 'CONFIRMED', input.reason);
  }

  start(user: CurrentUser, id: string, input: TransitionRentalInput) {
    return this.transition(user, id, ['RESERVED', 'CONFIRMED'], 'ACTIVE', input.reason);
  }

  complete(user: CurrentUser, id: string, input: TransitionRentalInput) {
    return this.transition(user, id, ['ACTIVE'], 'COMPLETED', input.reason);
  }

  cancel(user: CurrentUser, id: string, input: TransitionRentalInput) {
    return this.transition(user, id, ['RESERVED', 'CONFIRMED'], 'CANCELLED', input.reason);
  }

  async reschedule(user: CurrentUser, id: string, input: RescheduleRentalInput) {
    const current = await this.repository.getSchedule(user.shopId, id);
    if (!current) throw new NotFoundException('Rental order not found');
    if (!['RESERVED', 'CONFIRMED'].includes(current.status)) {
      throw new BadRequestException('Only reserved or confirmed orders can be rescheduled');
    }
    const start = new Date(input.rentalStartAt);
    const end = new Date(input.rentalEndAt);
    if (start >= end)
      throw new BadRequestException('rentalStartAt must be earlier than rentalEndAt');
    if (
      calculateRentalDurationDays(current.rentalStartAt, current.rentalEndAt) !==
      calculateRentalDurationDays(start, end)
    ) {
      throw new BadRequestException(
        'Changing rental duration requires repricing. Keep the same duration or recreate/reprice the order explicitly.',
      );
    }
    try {
      const order = await this.repository.reschedule({
        shopId: user.shopId,
        orderId: id,
        from: start,
        until: end,
        changedBy: user.memberId,
      });
      if (!order) throw new BadRequestException('Order cannot be rescheduled in its current state');
      await this.audit.log({
        shopId: user.shopId,
        actorUserId: user.userId,
        actorMemberId: user.memberId,
        action: 'RESCHEDULE',
        entityType: 'rental_order',
        entityId: id,
        newValues: { ...input },
      });
      return order;
    } catch (error) {
      if (error instanceof RentalOverlapError) throw new ConflictException(error.message);
      throw error;
    }
  }

  async addCharge(user: CurrentUser, id: string, input: AddRentalChargeInput) {
    if (!CHARGE_TYPES.has(input.chargeType))
      throw new BadRequestException('Unsupported charge type');
    const order = await this.repository.addCharge({
      shopId: user.shopId,
      orderId: id,
      chargeType: input.chargeType,
      description: input.description,
      amount: input.amount,
      quantity: input.quantity,
      createdBy: user.memberId,
    });
    if (!order) throw new NotFoundException('Rental order not found');
    await this.audit.log({
      shopId: user.shopId,
      actorUserId: user.userId,
      actorMemberId: user.memberId,
      action: 'ADD_CHARGE',
      entityType: 'rental_order',
      entityId: id,
      newValues: { ...input },
    });
    return order;
  }

  private async transition(
    user: CurrentUser,
    id: string,
    allowedFrom: string[],
    toStatus: string,
    reason?: string,
  ) {
    const currentStatus = await this.repository.getStatus(user.shopId, id);
    if (!currentStatus) throw new NotFoundException('Rental order not found');
    if (!allowedFrom.includes(currentStatus)) {
      throw new BadRequestException(`Cannot change order from ${currentStatus} to ${toStatus}`);
    }
    const order = await this.repository.transition({
      shopId: user.shopId,
      orderId: id,
      fromStatuses: allowedFrom,
      toStatus,
      changedBy: user.memberId,
      reason,
    });
    if (!order)
      throw new ConflictException('Order status changed concurrently; reload and try again');
    await this.audit.log({
      shopId: user.shopId,
      actorUserId: user.userId,
      actorMemberId: user.memberId,
      action: 'STATUS_CHANGE',
      entityType: 'rental_order',
      entityId: id,
      newValues: { fromStatus: currentStatus, toStatus, reason },
    });
    return order;
  }

  private createOrderNumber(): string {
    const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
    return `RT-${date}-${randomBytes(3).toString('hex').toUpperCase()}`;
  }
}
