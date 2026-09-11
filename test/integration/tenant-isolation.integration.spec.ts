import {
  connectTestDatabase,
  disconnectTestDatabase,
  resetTestDatabase,
} from '../helpers/test-database';
import {
  createTestShop,
  createTestCustomer,
  createTestProductWithVariant,
  createTestUserAndMember,
  uniqueCode,
} from '../fixtures/test-factories';
import { PrismaRentalRepository } from '../../src/modules/rentals/infrastructure/prisma-rental.repository';
import { PrismaFinanceRepository } from '../../src/modules/finance/infrastructure/prisma-finance.repository';
import { SystemClock } from '../../src/common/clock/system-clock';
import { PAYMENT_DIRECTION, PAYMENT_PURPOSE } from '../../src/modules/finance/domain/payment-types';
import { RENTAL_STATUS } from '../../src/modules/rentals/domain/rental-status';
import type { PrismaService } from '../../src/database/prisma/prisma.service';

describe('Cross-Tenant Data Isolation & Query Filtering Integration', () => {
  let prisma: PrismaService;
  let rentalRepo: PrismaRentalRepository;
  let financeRepo: PrismaFinanceRepository;

  beforeAll(async () => {
    prisma = await connectTestDatabase();
    rentalRepo = new PrismaRentalRepository(prisma, new SystemClock());
    financeRepo = new PrismaFinanceRepository(prisma);
  });

  beforeEach(async () => {
    await resetTestDatabase(prisma);
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  it('prevents Shop B from reading, listing, transitioning, or paying for Shop A orders and customers', async () => {
    // Setup Shop A with member, customer, product, rental order, and payment
    const shopA = await createTestShop(prisma);
    const customerA = await createTestCustomer(prisma, shopA.id);
    const { member: memberA } = await createTestUserAndMember(prisma, shopA.id);
    const {
      product: prodA,
      variant: varA,
      inventoryItems: itemsA,
    } = await createTestProductWithVariant(prisma, shopA.id, { inventoryCount: 1 });
    const itemA = itemsA[0]!;

    const orderA = await rentalRepo.createOrder({
      orderNumber: uniqueCode('RT_A'),
      shopId: shopA.id,
      customerId: customerA.id,
      rentalStartAt: new Date('2026-10-10T00:00:00.000Z'),
      rentalEndAt: new Date('2026-10-12T00:00:00.000Z'),
      discountTotal: 0,
      createdBy: memberA.id,
      lines: [
        {
          productId: prodA.id,
          variantId: varA.id,
          productName: prodA.name,
          variantName: varA.variantCode,
          quantity: 1,
          unitRentalPrice: 100000,
          depositAmount: 200000,
          lineTotal: 200000,
          pricingSnapshot: { durationDays: 2, unitRentalPrice: 100000, depositPerItem: 200000 },
          inventory: [{ id: itemA.id, sku: itemA.sku }],
        },
      ],
      charges: [],
    });
    expect(orderA).not.toBeNull();
    const orderAId = orderA!.id;

    // Record payment in Shop A
    const payA = await financeRepo.createPayment({
      shopId: shopA.id,
      orderId: orderAId,
      transactionNumber: uniqueCode('PAY_A'),
      direction: PAYMENT_DIRECTION.IN,
      purpose: PAYMENT_PURPOSE.RENTAL_PAYMENT,
      paymentMethod: 'CASH',
      amount: 100000,
      paidAt: new Date('2026-10-01T12:00:00.000Z'),
      createdBy: memberA.id,
    });
    expect(payA).not.toBeNull();

    // Setup Shop B with member
    const shopB = await createTestShop(prisma);
    const { member: memberB } = await createTestUserAndMember(prisma, shopB.id);

    // 1. Direct Get: Shop B attempts to get Shop A order by ID -> must return null
    const getResult = await rentalRepo.get(shopB.id, orderAId);
    expect(getResult).toBeNull();

    // 2. Listing Rentals: Shop B lists rentals -> must NOT include Shop A orders
    const shopBOrders = await rentalRepo.list({
      shopId: shopB.id,
      page: 1,
      limit: 10,
    });
    expect(shopBOrders.items).toHaveLength(0);
    expect(shopBOrders.meta.total).toBe(0);

    // 3. Listing Payments: Shop B lists payments -> must NOT include Shop A transactions
    const shopBPayments = await financeRepo.listPayments({
      shopId: shopB.id,
      page: 1,
      limit: 10,
    });
    expect(shopBPayments.items).toHaveLength(0);
    expect(shopBPayments.meta.total).toBe(0);

    // 4. Payment Creation: Shop B attempts to create payment against Shop A order -> must return null
    const maliciousPayment = await financeRepo.createPayment({
      shopId: shopB.id,
      orderId: orderAId,
      transactionNumber: uniqueCode('PAY_SPOOF'),
      direction: PAYMENT_DIRECTION.IN,
      purpose: PAYMENT_PURPOSE.RENTAL_PAYMENT,
      paymentMethod: 'CASH',
      amount: 50000,
      paidAt: new Date('2026-10-01T12:00:00.000Z'),
      createdBy: memberB.id,
    });
    expect(maliciousPayment).toBeNull();

    // 5. Order Transition: Shop B attempts to confirm/transition Shop A order -> must return null
    const maliciousTransition = await rentalRepo.transition({
      shopId: shopB.id,
      orderId: orderAId,
      fromStatuses: [RENTAL_STATUS.RESERVED],
      toStatus: RENTAL_STATUS.CONFIRMED,
      changedBy: memberB.id,
    });
    expect(maliciousTransition).toBeNull();

    // 6. Order Reschedule: Shop B attempts to reschedule Shop A order -> must return null
    const maliciousReschedule = await rentalRepo.reschedule({
      shopId: shopB.id,
      orderId: orderAId,
      from: new Date('2026-10-15T00:00:00.000Z'),
      until: new Date('2026-10-17T00:00:00.000Z'),
      changedBy: memberB.id,
    });
    expect(maliciousReschedule).toBeNull();

    // Verify order A remained untouched and still RESERVED in Shop A
    const freshOrderA = await rentalRepo.get(shopA.id, orderAId);
    expect(freshOrderA?.status).toBe(RENTAL_STATUS.RESERVED);
  });
});
