import { ConfigService } from '@nestjs/config';
import { PayOS, type Webhook } from '@payos/node';
import { ShopResolver } from '../../src/common/shop-context/shop-resolver';
import type { AppConfiguration } from '../../src/config/configuration';
import type { PrismaService } from '../../src/database/prisma/prisma.service';
import { PrismaCustomerRepository } from '../../src/modules/customers/infrastructure/prisma-customer.repository';
import { PrismaFinanceRepository } from '../../src/modules/finance/infrastructure/prisma-finance.repository';
import { PayosWebhookController } from '../../src/modules/payments/api/payos-webhook.controller';
import { PaymentService } from '../../src/modules/payments/application/payment.service';
import { WebRentalOrderService } from '../../src/modules/rentals/application/web-rental-order.service';
import type {
  PaymentGateway,
  PaymentLink,
  VerifiedPaymentTransfer,
} from '../../src/modules/payments/domain/payment';
import { PayosAdapter } from '../../src/modules/payments/infrastructure/payos.adapter';
import { PrismaRentalPaymentRepository } from '../../src/modules/rentals/infrastructure/prisma-rental-payment.repository';
import { PrismaRentalRepository } from '../../src/modules/rentals/infrastructure/prisma-rental.repository';
import { SettingsService } from '../../src/modules/settings/application/settings.service';
import { PrismaSettingsRepository } from '../../src/modules/settings/infrastructure/prisma-settings.repository';
import { checkoutQuoteFixture } from '../fixtures/rental-quote.fixture';
import { fixedClock, rentalScenario } from '../fixtures/rental.fixture';
import { createVerifiedWebAccount, uniqueCode } from '../fixtures/test-factories';
import {
  connectTestDatabase,
  disconnectTestDatabase,
  resetTestDatabase,
} from '../helpers/test-database';

const credentials = { clientId: 'test', apiKey: 'test', checksumKey: 'test' };

function config(checkoutEnabled: boolean) {
  return new ConfigService<AppConfiguration, true>({
    payos: {
      checkoutEnabled,
      ttlMinutes: 15,
      credentials,
    },
  });
}

describe('payOS rental checkout and accounting', () => {
  let prisma: PrismaService;
  let rentals: PrismaRentalRepository;
  let repo: PrismaRentalPaymentRepository;
  let settings: SettingsService;
  let clockTime: Date;
  const clock = { now: () => clockTime };
  const ledger = () => prisma.paymentTransaction.findMany({ orderBy: { purpose: 'asc' } });
  const gateway: jest.Mocked<PaymentGateway> = {
    checkout: { enabled: true, configured: true, ttlMinutes: 15 },
    create: jest.fn(),
    read: jest.fn(),
    cancel: jest.fn(),
  };
  const payments = (enabled = true) =>
    new PaymentService(repo, { ...gateway, checkout: { ...gateway.checkout, enabled } }, clock);

  beforeAll(async () => {
    prisma = await connectTestDatabase();
    settings = new SettingsService(new PrismaSettingsRepository(prisma), {
      log: () => Promise.resolve(),
    });
    rentals = new PrismaRentalRepository(prisma, clock, settings);
    repo = new PrismaRentalPaymentRepository(prisma);
  });

  beforeEach(async () => {
    await resetTestDatabase(prisma);
    jest.resetAllMocks();
    clockTime = fixedClock.now();
    gateway.create.mockImplementation((attempt) =>
      Promise.resolve({
        orderCode: attempt.orderCode,
        linkId: 'test-payos-link',
        amount: attempt.amount,
        status: 'PENDING',
        amountPaid: 0,
        transfers: [],
        checkoutUrl: 'https://pay.payos.vn/web/test-payos-link',
      }),
    );
  });

  afterAll(disconnectTestDatabase);

  async function setup() {
    const scenario = await rentalScenario(prisma);
    const account = await createVerifiedWebAccount(prisma);
    const owner = { webAccountId: account.id, email: account.email };
    const request = {
      customer: { name: scenario.customer.fullName, phone: scenario.customer.phone },
      items: [{ variantId: scenario.variant.id, quantity: 1 }],
      pickupDate: '2026-10-10T08:30:00+07:00',
      returnDate: '2026-10-12T08:30:00+07:00',
      delivery: { method: 'self_pickup' as const },
      paymentMethod: 'payos' as const,
      expectedQuote: checkoutQuoteFixture(),
    };
    function checkout(
      enabled = true,
      overrides: Partial<typeof request> & { loyaltyRewardId?: string } = {},
    ) {
      const orders = new WebRentalOrderService(
        rentals,
        rentals,
        settings,
        new PrismaCustomerRepository(prisma),
        clock,
        { checkout: { ...gateway.checkout, enabled } },
      );
      return orders.createOrder(
        scenario.shop.id,
        { ...request, ...overrides },
        'payos-checkout-key',
        owner,
      );
    }
    return { ...scenario, checkout, owner, account };
  }

  async function openPayment(f: Awaited<ReturnType<typeof setup>>, orderCode: string) {
    const scope = { shopId: f.shop.id, webAccountId: f.account.id, orderCode };
    const [first, second] = await Promise.all([payments().open(scope), payments().open(scope)]);
    expect([first.status, second.status]).toContain('PENDING');
    expect(gateway.create.mock.calls).toHaveLength(1);
    const attempt = (await repo.order(scope))?.attempt;
    if (!attempt) throw new Error('Missing payment attempt');
    const transfer: VerifiedPaymentTransfer = {
      orderCode: attempt.orderCode,
      linkId: 'test-payos-link',
      reference: 'TX001',
      amount: attempt.chargeAmount + attempt.depositAmount,
      paidAt: clock.now(),
    };
    return { scope, attempt, transfer };
  }

  it('keeps the rollout dark and preserves usable links after the flag is disabled', async () => {
    const f = await setup();
    await expect(f.checkout(false)).rejects.toMatchObject({ code: 'PAYOS_CHECKOUT_DISABLED' });
    expect(await prisma.rentalOrder.count()).toBe(0);
    const order = await f.checkout();
    const { scope, transfer } = await openPayment(f, order.orderCode);
    expect(await payments(false).open(scope)).toMatchObject({ status: 'PENDING', canOpen: true });
    expect(gateway.create.mock.calls).toHaveLength(1);
    const webhook = new PayosWebhookController(
      payments(false),
      new ShopResolver(prisma),
      new PayosAdapter(config(false)),
    );
    const data = {
      orderCode: transfer.orderCode,
      paymentLinkId: transfer.linkId,
      reference: transfer.reference,
      amount: transfer.amount,
      description: 'KITTY',
      accountNumber: '12345678',
      transactionDateTime: transfer.paidAt.toISOString(),
      currency: 'VND',
      code: '00',
      desc: 'success',
    } satisfies Webhook['data'];
    const sdk = new PayOS({ ...credentials, logLevel: 'off' });
    const signature = await sdk.crypto.createSignatureFromObj(data, credentials.checksumKey);
    if (!signature) throw new Error('Missing signature for the test webhook');
    const signed: Webhook = { code: '00', desc: 'success', success: true, data, signature };
    await expect(
      webhook.receive({ ...signed, data: { ...data, amount: transfer.amount + 1 } }),
    ).rejects.toThrow();
    expect(await ledger()).toHaveLength(0);
    await webhook.receive(signed);
    expect(await payments(false).get(scope)).toMatchObject({ status: 'PAID' });
    const wrongAccount = await createVerifiedWebAccount(prisma);
    await expect(
      payments().open({ ...scope, webAccountId: wrongAccount.id }),
    ).rejects.toMatchObject({ kind: 'NOT_FOUND' });
  });

  it('records each verified transfer once, splits rent and deposit, and keeps confirmation separate', async () => {
    const f = await setup();
    const order = await f.checkout();
    const { attempt, transfer } = await openPayment(f, order.orderCode);
    const actor = {
      orderId: attempt.orderId,
      shopId: f.shop.id,
      actorMemberId: f.member.id,
      actorUserId: f.user.id,
      actorName: f.user.fullName,
    };
    await expect(rentals.confirm({ ...actor, collateralAmount: 200000 })).rejects.toMatchObject({
      code: 'PAYOS_PAYMENT_PENDING',
    });
    const finance = new PrismaFinanceRepository(prisma, clock);
    await expect(
      finance.createPayment({
        ...actor,
        amount: 60000,
        transactionNumber: 'DUPLICATE',
        direction: 'IN',
        purpose: 'RENTAL_PAYMENT',
        paymentMethod: 'BANK_TRANSFER',
        paidAt: clock.now(),
        createdBy: f.member.id,
      }),
    ).rejects.toMatchObject({ code: 'PAYOS_PAYMENT_PENDING' });
    await Promise.all([
      repo.recordTransfer(f.shop.id, transfer),
      repo.recordTransfer(f.shop.id, transfer),
    ]);
    expect(await prisma.payosTransfer.count()).toBe(1);
    expect(
      (await ledger()).map((row) => [
        row.purpose,
        row.amount.toNumber(),
        row.source,
        row.bankReference,
      ]),
    ).toEqual([
      ['DEPOSIT', 200000, 'PAYOS', 'TX001'],
      ['RENTAL_PAYMENT', 60000, 'PAYOS', 'TX001'],
    ]);
    const reserved = await rentals.get(f.shop.id, attempt.orderId);
    expect(reserved).toMatchObject({
      status: 'RESERVED',
      paymentStatus: 'PAID',
      depositStatus: 'HELD',
    });
    await expect(rentals.confirm({ ...actor, collateralAmount: 210000 })).rejects.toMatchObject({
      code: 'PAYOS_DEPOSIT_MISMATCH',
    });
    await expect(rentals.confirm({ ...actor, collateralAmount: 200000 })).resolves.toMatchObject({
      status: 'CONFIRMED',
    });
    expect(await ledger()).toHaveLength(2);
  });

  it('recovers an unknown provider create using the same order code and reconciles without a webhook', async () => {
    const f = await setup();
    const order = await f.checkout();
    const scope = { shopId: f.shop.id, orderCode: order.orderCode, webAccountId: f.account.id };
    gateway.create.mockRejectedValueOnce(new Error('Provider timeout after send'));
    expect(await payments().open(scope)).toMatchObject({ status: 'PROCESSING', checkoutUrl: null });
    const attempt = (await repo.order(scope))?.attempt;
    if (!attempt) throw new Error('Missing payment attempt');
    const recovered: PaymentLink = {
      orderCode: attempt.orderCode,
      linkId: 'test-payos-link',
      amount: 260000,
      amountPaid: 0,
      status: 'PENDING',
      transfers: [],
      checkoutUrl: 'https://pay.payos.vn/web/test-payos-link',
    };
    clockTime = new Date(clockTime.getTime() + 46_000);
    gateway.read.mockResolvedValueOnce(recovered);
    await expect(payments().open(scope)).resolves.toMatchObject({ status: 'PENDING' });
    expect(gateway.create.mock.calls).toHaveLength(1);
    expect(gateway.read.mock.calls).toContainEqual([attempt.orderCode]);
    gateway.read.mockResolvedValueOnce({
      ...recovered,
      status: 'PAID',
      amountPaid: 260000,
      transfers: [
        {
          orderCode: attempt.orderCode,
          linkId: recovered.linkId,
          reference: 'TX002',
          amount: 260000,
          paidAt: clock.now(),
        },
      ],
    });
    await payments().sync(scope);
    expect(gateway.read.mock.calls).toHaveLength(1);
    await payments().sync(scope, 'reconcile');
    expect(await payments().get(scope)).toMatchObject({ status: 'PAID' });
  });

  it('closes a provider-verified unpaid link and queues money received after stock release', async () => {
    const f = await setup();
    const order = await f.checkout();
    const { scope, attempt, transfer } = await openPayment(f, order.orderCode);
    const link: PaymentLink = {
      orderCode: attempt.orderCode,
      linkId: transfer.linkId,
      amount: 260000,
      status: 'PENDING',
      amountPaid: 0,
      transfers: [],
    };
    gateway.read.mockResolvedValueOnce(link);
    gateway.cancel.mockResolvedValueOnce({ ...link, status: 'CANCELLED' });
    clockTime = new Date(attempt.expiresAt.getTime() + 1_000);
    await payments(false).sync(scope);
    expect(await payments(false).get(scope)).toMatchObject({
      status: 'EXPIRED',
      checkoutUrl: null,
    });
    expect(
      await prisma.rentalItemAllocation.count({
        where: { orderId: attempt.orderId, releasedAt: null },
      }),
    ).toBe(0);
    await repo.recordTransfer(f.shop.id, { ...transfer, paidAt: clock.now() });
    expect(await ledger()).toHaveLength(0);
    const [review] = await payments().listReview(f.shop.id);
    expect(review).toMatchObject({ reason: 'CLOSED_RENTAL', reference: 'TX001' });
    await payments().recordRefund(f.principal, review!.id, 'BANK-REFUND-01');
    expect(await payments().listReview(f.shop.id)).toEqual([]);
    expect(await prisma.payosTransfer.findUnique({ where: { id: review!.id } })).toMatchObject({
      state: 'REFUNDED',
    });
  });

  it('records a manual refund and cancels a paid reservation exactly once', async () => {
    const f = await setup();
    const order = await f.checkout();
    const { attempt, transfer, scope } = await openPayment(f, order.orderCode);
    await repo.recordTransfer(f.shop.id, transfer);
    await payments().refundPaidReservation(f.principal, attempt.orderId, 'REFUND-TX-01');
    await payments().refundPaidReservation(f.principal, attempt.orderId, 'REFUND-TX-01');
    const transactions = await ledger();
    expect(transactions).toHaveLength(4);
    expect(
      transactions.filter((entry) => entry.direction === 'OUT').map((entry) => entry.purpose),
    ).toEqual(['DEPOSIT_REFUND', 'ORDER_REFUND']);
    expect(await payments().get(scope)).toMatchObject({ status: 'CANCELLED' });
    expect(
      await prisma.rentalItemAllocation.count({
        where: { orderId: attempt.orderId, releasedAt: null },
      }),
    ).toBe(0);
  });

  it('keeps the reservation if money is verified while the cancellation request is in flight', async () => {
    const f = await setup();
    const order = await f.checkout();
    const { attempt, transfer, scope } = await openPayment(f, order.orderCode);
    const pending: PaymentLink = {
      orderCode: attempt.orderCode,
      linkId: transfer.linkId,
      amount: transfer.amount,
      status: 'PENDING',
      amountPaid: 0,
      transfers: [],
    };
    gateway.read.mockResolvedValueOnce(pending);
    gateway.cancel.mockImplementationOnce(async () => {
      await repo.recordTransfer(f.shop.id, transfer);
      return { ...pending, status: 'CANCELLED' };
    });
    await expect(payments().cancelIfHosted(scope)).rejects.toMatchObject({
      code: 'PAYOS_CANCEL_REQUIRES_REVIEW',
    });
    expect(await payments().get(scope)).toMatchObject({ status: 'PAID' });
    expect(
      await prisma.rentalItemAllocation.count({
        where: { orderId: attempt.orderId, releasedAt: null },
      }),
    ).toBe(1);
  });

  it('queues a mismatched credit and preserves allocations until the discrepancy is resolved', async () => {
    const f = await setup();
    const order = await f.checkout();
    const { scope, attempt, transfer } = await openPayment(f, order.orderCode);
    await repo.recordTransfer(f.shop.id, { ...transfer, amount: 20000 });
    expect(await payments().get(scope)).toMatchObject({ status: 'REVIEW', canOpen: false });
    clockTime = new Date(attempt.expiresAt.getTime() + 5 * 60_000 - 1);
    await expect(payments().syncDue(() => undefined)).resolves.toBe(0);
    clockTime = new Date(clockTime.getTime() + 1);
    await expect(payments().syncDue(() => undefined)).resolves.toBe(1);
    await expect(payments().cancelIfHosted(scope)).rejects.toMatchObject({
      code: 'PAYOS_CANCEL_REQUIRES_REVIEW',
    });
    expect(await ledger()).toHaveLength(0);
    expect(
      await prisma.rentalItemAllocation.count({
        where: { orderId: attempt.orderId, releasedAt: null },
      }),
    ).toBe(1);
  });

  it('lists attempts lacking a transfer, pages with transfer reviews, and recovers on verified evidence', async () => {
    const f = await setup();
    const order = await f.checkout();
    const { scope, attempt, transfer } = await openPayment(f, order.orderCode);
    const incomplete: PaymentLink = {
      orderCode: attempt.orderCode,
      linkId: transfer.linkId,
      status: 'PAID',
      amount: transfer.amount,
      amountPaid: transfer.amount,
      transfers: [],
    };
    gateway.read.mockResolvedValueOnce(incomplete);
    await payments().sync(scope, 'reconcile');
    const queue = await payments().reviewQueue(f.shop.id, { page: 1, limit: 1 });
    expect(queue.items).toMatchObject([
      { kind: 'ATTEMPT', orderId: attempt.orderId, reason: 'INCOMPLETE_PROVIDER_DATA' },
    ]);
    expect(queue.meta.total).toBe(1);
    await expect(payments().cancelIfHosted(scope)).rejects.toMatchObject({
      code: 'PAYOS_CANCEL_REQUIRES_REVIEW',
    });
    expect(await ledger()).toHaveLength(0);

    await repo.recordTransfer(f.shop.id, {
      ...transfer,
      orderCode: transfer.orderCode + 1,
      reference: 'UNKNOWN-REVIEW',
      paidAt: new Date('2030-01-01T00:00:00Z'),
    });
    const secondPage = await payments().reviewQueue(f.shop.id, { page: 2, limit: 1 });
    expect(secondPage.meta).toMatchObject({ total: 2, totalPages: 2 });
    expect(secondPage.items).toMatchObject([{ kind: 'TRANSFER', orderId: null }]);

    gateway.read.mockResolvedValueOnce({ ...incomplete, transfers: [transfer] });
    await payments().sync(scope, 'reconcile');
    await expect(payments().get(scope)).resolves.toMatchObject({ status: 'PAID' });
    expect(await ledger()).toHaveLength(2);
    expect((await payments().reviewQueue(f.shop.id, { page: 1, limit: 5 })).items).toMatchObject([
      { kind: 'TRANSFER', orderId: null },
    ]);
  });

  it('restores a redeemed reward when an unpaid reservation with no issued link expires', async () => {
    const f = await setup();
    const earned = await prisma.rentalOrder.create({
      data: {
        shopId: f.shop.id,
        customerId: f.customer.id,
        orderNumber: uniqueCode('EARN'),
        source: 'OFFLINE',
        status: 'COMPLETED',
        rentalStartAt: new Date('2026-09-10T00:00:00.000Z'),
        rentalEndAt: new Date('2026-09-12T00:00:00.000Z'),
      },
    });
    const entry = await prisma.customerLoyaltyEntry.create({
      data: {
        shopId: f.shop.id,
        orderId: earned.id,
        customerId: f.customer.id,
        entryType: 'QUALIFIED',
        ownerType: 'WEB_ACCOUNT',
        webAccountId: f.account.id,
      },
    });
    const reward = await prisma.customerLoyaltyReward.create({
      data: {
        shopId: f.shop.id,
        customerId: f.customer.id,
        ownerType: 'WEB_ACCOUNT',
        webAccountId: f.account.id,
        earnedOrderId: earned.id,
        earnedEntryId: entry.id,
        rewardValue: 50000,
      },
    });
    const order = await f.checkout(true, {
      loyaltyRewardId: reward.id,
      expectedQuote: { ...checkoutQuoteFixture(), discountAmount: 50000, totalAmount: 10000 },
    });
    expect(order.totalAmount).toBe(10000);
    const scope = { shopId: f.shop.id, orderCode: order.orderCode, webAccountId: f.account.id };
    clockTime = new Date(clockTime.getTime() + 16 * 60_000);
    await payments(false).sync(scope);
    expect(gateway.read.mock.calls).toHaveLength(0);
    expect(await payments().get(scope)).toMatchObject({ status: 'EXPIRED' });
    expect(
      await prisma.customerLoyaltyReward.findUnique({ where: { id: reward.id } }),
    ).toMatchObject({
      status: 'AVAILABLE',
      redeemedOrderId: null,
      redeemedAt: null,
    });
  });

  it('allows a deposit-only payment when the rental subtotal is zero', async () => {
    const f = await setup();
    await prisma.product.update({ where: { id: f.product.id }, data: { rentalPriceOverride: 0 } });
    const order = await f.checkout(true, {
      returnDate: '2026-10-11T08:30:00+07:00',
      expectedQuote: checkoutQuoteFixture(0),
    });
    const { attempt, transfer } = await openPayment(f, order.orderCode);
    expect(attempt.chargeAmount).toBe(0);
    expect(transfer.amount).toBe(200000);
    await repo.recordTransfer(f.shop.id, transfer);
    expect((await ledger()).map((row) => row.purpose)).toEqual(['DEPOSIT']);
  });
});
