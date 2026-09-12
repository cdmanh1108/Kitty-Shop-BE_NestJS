import { rentalPolicies } from '../fixtures/rental-policy.fixture';
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
import { PrismaFinanceRepository } from '../../src/modules/finance/infrastructure/prisma-finance.repository';
import { PrismaRentalRepository } from '../../src/modules/rentals/infrastructure/prisma-rental.repository';
import { SystemClock } from '../../src/common/clock/system-clock';
import { FinanceInvariantError } from '../../src/modules/finance/domain/finance.repository';
import {
  ORDER_PAYMENT_STATUS,
  DEPOSIT_STATUS,
  TRANSACTION_STATUS,
} from '../../src/modules/finance/domain/payment-status';
import { PAYMENT_DIRECTION, PAYMENT_PURPOSE } from '../../src/modules/finance/domain/payment-types';
import type { PrismaService } from '../../src/database/prisma/prisma.service';

describe('Finance Payment Lifecycle, State Recomputation & Rollback Integration', () => {
  let prisma: PrismaService;
  let financeRepo: PrismaFinanceRepository;
  let rentalRepo: PrismaRentalRepository;

  beforeAll(async () => {
    prisma = await connectTestDatabase();
    financeRepo = new PrismaFinanceRepository(prisma);
    rentalRepo = new PrismaRentalRepository(prisma, new SystemClock(), rentalPolicies);
  });

  beforeEach(async () => {
    await resetTestDatabase(prisma);
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  it('atomically updates payment transaction, recomputes order payment state, and inserts outbox event', async () => {
    const shop = await createTestShop(prisma);
    const customer = await createTestCustomer(prisma, shop.id);
    const { member } = await createTestUserAndMember(prisma, shop.id);
    const { product, variant, inventoryItems } = await createTestProductWithVariant(
      prisma,
      shop.id,
      {
        inventoryCount: 1,
        dailyRate: 150000,
        depositAmount: 200000,
      },
    );
    const inventoryItem = inventoryItems[0]!;

    // Create order: 2 days @ 150,000 = 300,000 grandTotal, 200,000 depositRequired
    const order = await rentalRepo.createOrder({
      orderNumber: uniqueCode('RT'),
      shopId: shop.id,
      customerId: customer.id,
      rentalStartAt: new Date('2026-10-10T00:00:00.000Z'),
      rentalEndAt: new Date('2026-10-12T00:00:00.000Z'),
      discountTotal: 0,
      createdBy: member.id,
      lines: [
        {
          productId: product.id,
          variantId: variant.id,
          productName: product.name,
          variantName: variant.variantCode,
          quantity: 1,
          unitRentalPrice: 150000,
          depositAmount: 200000,
          lineTotal: 300000,
          pricingSnapshot: { durationDays: 2, unitRentalPrice: 150000, depositPerItem: 200000 },
          inventory: [{ id: inventoryItem.id, sku: inventoryItem.sku }],
        },
      ],
      charges: [],
    });
    expect(order).not.toBeNull();
    const orderId = order!.id;

    // Initial state: UNPAID, deposit = PENDING
    const initialOrder = await prisma.rentalOrder.findUniqueOrThrow({ where: { id: orderId } });
    expect(initialOrder.paymentStatus).toBe(ORDER_PAYMENT_STATUS.UNPAID);
    expect(initialOrder.depositStatus).toBe(DEPOSIT_STATUS.PENDING);

    // 1. Partial payment: 100,000 IN purpose RENTAL_PAYMENT
    const pay1 = await financeRepo.createPayment({
      shopId: shop.id,
      orderId,
      transactionNumber: uniqueCode('PAY'),
      direction: PAYMENT_DIRECTION.IN,
      purpose: PAYMENT_PURPOSE.RENTAL_PAYMENT,
      paymentMethod: 'BANK_TRANSFER',
      amount: 100000,
      paidAt: new Date('2026-10-01T12:00:00.000Z'),
      createdBy: member.id,
    });
    expect(pay1).not.toBeNull();

    const orderAfterPay1 = await prisma.rentalOrder.findUniqueOrThrow({ where: { id: orderId } });
    expect(orderAfterPay1.paymentStatus).toBe(ORDER_PAYMENT_STATUS.PARTIALLY_PAID);

    // Verify Outbox event created
    const outboxPay1 = await prisma.outboxEvent.findFirst({
      where: {
        shopId: shop.id,
        eventType: 'PAYMENT_RECORDED',
        aggregateId: pay1!.id,
      },
    });
    expect(outboxPay1).not.toBeNull();

    // 2. Full remaining rental payment: 200,000 IN
    const pay2 = await financeRepo.createPayment({
      shopId: shop.id,
      orderId,
      transactionNumber: uniqueCode('PAY'),
      direction: PAYMENT_DIRECTION.IN,
      purpose: PAYMENT_PURPOSE.RENTAL_PAYMENT,
      paymentMethod: 'CASH',
      amount: 200000,
      paidAt: new Date('2026-10-01T12:00:00.000Z'),
      createdBy: member.id,
    });
    expect(pay2).not.toBeNull();

    const orderAfterPay2 = await prisma.rentalOrder.findUniqueOrThrow({ where: { id: orderId } });
    expect(orderAfterPay2.paymentStatus).toBe(ORDER_PAYMENT_STATUS.PAID);

    // 3. Deposit payment: 200,000 IN purpose DEPOSIT
    const payDeposit = await financeRepo.createPayment({
      shopId: shop.id,
      orderId,
      transactionNumber: uniqueCode('PAY_DEP'),
      direction: PAYMENT_DIRECTION.IN,
      purpose: PAYMENT_PURPOSE.DEPOSIT,
      paymentMethod: 'CASH',
      amount: 200000,
      paidAt: new Date('2026-10-01T12:00:00.000Z'),
      createdBy: member.id,
    });
    expect(payDeposit).not.toBeNull();

    const orderAfterDeposit = await prisma.rentalOrder.findUniqueOrThrow({
      where: { id: orderId },
    });
    expect(orderAfterDeposit.depositStatus).toBe(DEPOSIT_STATUS.HELD);

    // 4. Void pay1 (100,000): order transitions back from PAID to PARTIALLY_PAID
    const voided = await financeRepo.voidPayment({
      shopId: shop.id,
      paymentId: pay1!.id,
      voidedBy: member.id,
    });
    expect(voided).not.toBeNull();
    expect(voided?.status).toBe(TRANSACTION_STATUS.VOIDED);

    const orderAfterVoid = await prisma.rentalOrder.findUniqueOrThrow({ where: { id: orderId } });
    expect(orderAfterVoid.paymentStatus).toBe(ORDER_PAYMENT_STATUS.PARTIALLY_PAID);
  });

  it('enforces deposit refund ceiling invariant and blocks excessive refunds', async () => {
    const shop = await createTestShop(prisma);
    const customer = await createTestCustomer(prisma, shop.id);
    const { member } = await createTestUserAndMember(prisma, shop.id);
    const { product, variant, inventoryItems } = await createTestProductWithVariant(
      prisma,
      shop.id,
      {
        inventoryCount: 1,
        dailyRate: 100000,
        depositAmount: 150000,
      },
    );
    const inventoryItem = inventoryItems[0]!;

    const order = await rentalRepo.createOrder({
      orderNumber: uniqueCode('RT'),
      shopId: shop.id,
      customerId: customer.id,
      rentalStartAt: new Date('2026-10-10T00:00:00.000Z'),
      rentalEndAt: new Date('2026-10-11T00:00:00.000Z'),
      discountTotal: 0,
      createdBy: member.id,
      lines: [
        {
          productId: product.id,
          variantId: variant.id,
          productName: product.name,
          variantName: variant.variantCode,
          quantity: 1,
          unitRentalPrice: 100000,
          depositAmount: 150000,
          lineTotal: 100000,
          pricingSnapshot: { durationDays: 1, unitRentalPrice: 100000, depositPerItem: 150000 },
          inventory: [{ id: inventoryItem.id, sku: inventoryItem.sku }],
        },
      ],
      charges: [],
    });
    const orderId = order!.id;

    // 1. Attempting refund without any deposit paid must be blocked
    await expect(
      financeRepo.createPayment({
        shopId: shop.id,
        orderId,
        transactionNumber: uniqueCode('REFUND'),
        direction: PAYMENT_DIRECTION.OUT,
        purpose: PAYMENT_PURPOSE.DEPOSIT_REFUND,
        paymentMethod: 'CASH',
        amount: 50000,
        paidAt: new Date('2026-10-01T12:00:00.000Z'),
        createdBy: member.id,
      }),
    ).rejects.toThrow(
      new FinanceInvariantError('Tiền hoàn cọc không được vượt quá tiền cọc đang giữ.'),
    );

    // 2. Pay 150,000 deposit
    await financeRepo.createPayment({
      shopId: shop.id,
      orderId,
      transactionNumber: uniqueCode('PAY_DEP'),
      direction: PAYMENT_DIRECTION.IN,
      purpose: PAYMENT_PURPOSE.DEPOSIT,
      paymentMethod: 'CASH',
      amount: 150000,
      paidAt: new Date('2026-10-01T12:00:00.000Z'),
      createdBy: member.id,
    });

    // 3. Partial refund of 100,000 succeeds
    const refund1 = await financeRepo.createPayment({
      shopId: shop.id,
      orderId,
      transactionNumber: uniqueCode('REFUND_1'),
      direction: PAYMENT_DIRECTION.OUT,
      purpose: PAYMENT_PURPOSE.DEPOSIT_REFUND,
      paymentMethod: 'CASH',
      amount: 100000,
      paidAt: new Date('2026-10-01T12:00:00.000Z'),
      createdBy: member.id,
    });
    expect(refund1).not.toBeNull();

    // 4. Attempting to refund 100,000 more when only 50,000 is held must be blocked
    await expect(
      financeRepo.createPayment({
        shopId: shop.id,
        orderId,
        transactionNumber: uniqueCode('REFUND_2'),
        direction: PAYMENT_DIRECTION.OUT,
        purpose: PAYMENT_PURPOSE.DEPOSIT_REFUND,
        paymentMethod: 'CASH',
        amount: 100000,
        paidAt: new Date('2026-10-01T12:00:00.000Z'),
        createdBy: member.id,
      }),
    ).rejects.toThrow(
      new FinanceInvariantError('Tiền hoàn cọc không được vượt quá tiền cọc đang giữ.'),
    );
  });
});
