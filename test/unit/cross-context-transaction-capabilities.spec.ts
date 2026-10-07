import { Prisma } from '@prisma/client';
import { writeTransactionalAuditLog } from '../../src/modules/audit/infrastructure/transactional-audit-log';
import { recordRentalReturnInspection } from '../../src/modules/catalog/infrastructure/rental-inventory.transaction';
import {
  countQualifiedRentalLoyaltyEntries,
  createRentalLoyaltyEntry,
} from '../../src/modules/customers/infrastructure/rental-loyalty.transaction';
import {
  canCancelRentalDeliveries,
  cancelPendingRentalDeliveries,
} from '../../src/modules/deliveries/infrastructure/rental-delivery.transaction';
import {
  listCompletedPaymentLines,
  countCompletedPayments,
} from '../../src/modules/finance/infrastructure/completed-payment-reader';
import { recordRentalReceipt } from '../../src/modules/finance/infrastructure/rental-receipt.transaction';
import { addDeliveryShippingCharge } from '../../src/modules/rentals/infrastructure/delivery-shipping-charge.transaction';
import { INVENTORY_STATUS } from '../../src/modules/catalog/domain/catalog-status';
import { DELIVERY_STATUS } from '../../src/modules/deliveries/domain/delivery-status';
import { TRANSACTION_STATUS } from '../../src/modules/finance/domain/payment-status';

describe('cross-context transaction capabilities', () => {
  it('keeps audit writes on the caller transaction and converts JSON payloads', async () => {
    const create = jest.fn().mockResolvedValue(undefined);
    const tx = { auditLog: { create } } as unknown as Prisma.TransactionClient;

    await writeTransactionalAuditLog(tx, {
      shopId: 'shop',
      actorMemberId: 'member',
      action: 'RENTAL_SETTLED',
      entityType: 'rental_order',
      entityId: 'order',
      oldValues: { status: 'CONFIRMED' },
      newValues: { status: 'COMPLETED' },
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        shopId: 'shop',
        actorMemberId: 'member',
        action: 'RENTAL_SETTLED',
        entityType: 'rental_order',
        entityId: 'order',
        oldValues: { status: 'CONFIRMED' },
        newValues: { status: 'COMPLETED' },
      },
    });
  });

  it('keeps Catalog return inspection history and inventory update in the same transaction', async () => {
    const findUniqueOrThrow = jest.fn().mockResolvedValue({ id: 'inventory', currentStatus: 'RENTED' });
    const update = jest.fn().mockResolvedValue(undefined);
    const create = jest.fn().mockResolvedValue(undefined);
    const tx = {
      inventoryItem: { findUniqueOrThrow, update },
      inventoryStatusHistory: { create },
    } as unknown as Prisma.TransactionClient;

    await recordRentalReturnInspection(tx, {
      shopId: 'shop',
      orderId: 'order',
      inventoryItemId: 'inventory',
      status: INVENTORY_STATUS.CLEANING,
      returnedAt: new Date('2026-09-01T00:00:00Z'),
      changedBy: 'member',
      reason: 'RENTAL_RETURN',
      notes: null,
    });

    expect(update).toHaveBeenCalledWith({
      where: { id: 'inventory' },
      data: {
        currentStatus: INVENTORY_STATUS.CLEANING,
        totalRentalCount: { increment: 1 },
        lastRentedAt: new Date('2026-09-01T00:00:00Z'),
      },
    });
    expect(create).toHaveBeenCalledWith({
      data: {
        shopId: 'shop',
        inventoryItemId: 'inventory',
        fromStatus: 'RENTED',
        toStatus: INVENTORY_STATUS.CLEANING,
        orderId: 'order',
        changedBy: 'member',
        reason: 'RENTAL_RETURN',
        notes: null,
      },
    });
  });

  it('keeps loyalty history reads and entries owned by Customers', async () => {
    const count = jest.fn().mockResolvedValue(2);
    const create = jest.fn().mockResolvedValue({ id: 'entry' });
    const createReward = jest.fn().mockResolvedValue({ id: 'reward' });
    const tx = {
      customerLoyaltyEntry: { count, create },
      customerLoyaltyReward: { create: createReward },
    } as unknown as Prisma.TransactionClient;

    const owner = { type: 'CRM_CUSTOMER' as const, customerId: 'customer' };
    const createdAt = new Date('2026-10-07T00:00:00.000Z');
    await expect(countQualifiedRentalLoyaltyEntries(tx, { shopId: 'shop', owner })).resolves.toBe(
      2,
    );
    await expect(
      createRentalLoyaltyEntry(tx, {
        shopId: 'shop',
        customerId: 'customer',
        orderId: 'order',
        rewardValue: 500,
        owner,
        createdAt,
      }),
    ).resolves.toEqual({ rewardId: 'reward' });

    expect(count).toHaveBeenCalledWith({
      where: {
        shopId: 'shop',
        entryType: 'QUALIFIED',
        ownerType: 'CRM_CUSTOMER',
        customerId: 'customer',
      },
    });
    expect(create).toHaveBeenCalledWith({
      data: {
        shopId: 'shop',
        customerId: 'customer',
        orderId: 'order',
        entryType: 'QUALIFIED',
        ownerType: 'CRM_CUSTOMER',
        webAccountId: null,
        rewardValue: 500,
        createdAt,
      },
      select: { id: true },
    });
    expect(createReward).toHaveBeenCalledWith({
      data: {
        shopId: 'shop',
        customerId: 'customer',
        ownerType: 'CRM_CUSTOMER',
        webAccountId: null,
        earnedEntryId: 'entry',
        earnedOrderId: 'order',
        rewardValue: 500,
        status: 'AVAILABLE',
        createdAt,
      },
      select: { id: true },
    });
  });

  it('uses Delivery status rules and only cancels pending or ready rental jobs', async () => {
    const findMany = jest.fn().mockResolvedValue([{ status: DELIVERY_STATUS.PENDING }]);
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const tx = { deliveryJob: { findMany, updateMany } } as unknown as Prisma.TransactionClient;

    await expect(canCancelRentalDeliveries(tx, { shopId: 'shop', orderId: 'order' })).resolves.toBe(true);
    await cancelPendingRentalDeliveries(tx, { shopId: 'shop', orderId: 'order' });

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        orderId: 'order',
        shopId: 'shop',
        status: { in: [DELIVERY_STATUS.PENDING, DELIVERY_STATUS.READY] },
      },
      data: { status: DELIVERY_STATUS.CANCELLED },
    });
    findMany.mockResolvedValueOnce([{ status: DELIVERY_STATUS.PICKED_UP }]);
    await expect(canCancelRentalDeliveries(tx, { shopId: 'shop', orderId: 'order' })).resolves.toBe(false);
  });

  it('keeps Finance receipt and completed-payment mappings explicit', async () => {
    const create = jest.fn().mockResolvedValue(undefined);
    const count = jest.fn().mockResolvedValue(1);
    const findMany = jest.fn().mockResolvedValue([
      { amount: new Prisma.Decimal('125.50'), direction: 'IN', purpose: 'RENTAL' },
    ]);
    const tx = {
      paymentTransaction: { create, count, findMany },
    } as unknown as Prisma.TransactionClient;

    await recordRentalReceipt(tx, {
      shopId: 'shop',
      orderId: 'order',
      customerId: 'customer',
      actorMemberId: 'member',
      key: 'receipt-1',
      purpose: 'RENTAL',
      direction: 'IN',
      amount: new Prisma.Decimal('125.50'),
      paidAt: new Date('2026-09-01T00:00:00Z'),
      paymentMethod: 'CASH',
    });
    await recordRentalReceipt(tx, {
      shopId: 'shop',
      orderId: 'order',
      customerId: 'customer',
      actorMemberId: 'member',
      key: 'receipt-zero',
      purpose: 'RENTAL',
      direction: 'IN',
      amount: new Prisma.Decimal(0),
      paidAt: new Date('2026-09-01T00:00:00Z'),
      paymentMethod: 'CASH',
    });

    expect(create).toHaveBeenCalledTimes(1);
    await expect(countCompletedPayments(tx, 'order')).resolves.toBe(1);
    await expect(listCompletedPaymentLines(tx, 'order')).resolves.toEqual([
      { amount: '125.5', direction: 'IN', purpose: 'RENTAL' },
    ]);
    expect(count).toHaveBeenCalledWith({
      where: { orderId: 'order', status: TRANSACTION_STATUS.COMPLETED, voidedAt: null },
    });
  });

  it('keeps Delivery shipping charges and Finance payment state within one Rental transaction', async () => {
    const findFirst = jest
      .fn()
      .mockResolvedValueOnce({ id: 'order', status: 'CONFIRMED' })
      .mockResolvedValueOnce(null);
    const create = jest.fn().mockResolvedValue(undefined);
    const update = jest.fn().mockResolvedValue(undefined);
    const findUniqueOrThrow = jest.fn().mockResolvedValue({
      grandTotal: new Prisma.Decimal(1000),
      depositRequired: new Prisma.Decimal(0),
      confirmation: null,
    });
    const tx = {
      rentalOrder: { findFirst, findUniqueOrThrow, update },
      rentalSettlement: { findFirst },
      rentalOrderCharge: { create },
      paymentTransaction: { findMany: jest.fn().mockResolvedValue([]) },
    } as unknown as Prisma.TransactionClient;

    await expect(
      addDeliveryShippingCharge(tx, {
        shopId: 'shop',
        orderId: 'order',
        shippingFee: 150,
        direction: 'OUTBOUND',
      }),
    ).resolves.toBe(true);

    expect(create).toHaveBeenCalledWith({
      data: {
        shopId: 'shop',
        orderId: 'order',
        chargeType: 'SHIPPING',
        description: 'Shipping fee (OUTBOUND)',
        amount: 150,
        quantity: 1,
        createdBy: undefined,
      },
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: 'order' },
      data: {
        chargesTotal: { increment: 150 },
        grandTotal: { increment: 150 },
        updatedBy: undefined,
      },
    });
  });
});
