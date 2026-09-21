import { RentalReadPresenter } from '../../src/modules/rentals/application/rental-read.presenter';
import { WebRentalService } from '../../src/modules/rentals/application/web-rental.service';
import { toRentalResponse } from '../../src/modules/rentals/api/rental.response';
import { ConflictException } from '@nestjs/common';
import type { PrismaService } from '../../src/database/prisma/prisma.service';
import { PrismaCustomerRepository } from '../../src/modules/customers/infrastructure/prisma-customer.repository';
import { PrismaRentalRepository } from '../../src/modules/rentals/infrastructure/prisma-rental.repository';
import { SettingsService } from '../../src/modules/settings/application/settings.service';
import { PrismaSettingsRepository } from '../../src/modules/settings/infrastructure/prisma-settings.repository';
import { fixedClock, rentalScenario } from '../fixtures/rental.fixture';
import {
  connectTestDatabase,
  disconnectTestDatabase,
  resetTestDatabase,
} from '../helpers/test-database';

describe('Web payment preference persistence', () => {
  let prisma: PrismaService;
  let rentals: PrismaRentalRepository;
  let web: WebRentalService;

  beforeAll(async () => {
    prisma = await connectTestDatabase();
    const settings = new SettingsService(new PrismaSettingsRepository(prisma), {
      log: () => Promise.resolve(),
    });
    rentals = new PrismaRentalRepository(prisma, fixedClock, settings);
    web = new WebRentalService(rentals, settings, new PrismaCustomerRepository(prisma), fixedClock);
  });

  beforeEach(async () => {
    await resetTestDatabase(prisma);
  });

  afterAll(disconnectTestDatabase);

  it('stores a Web payment preference atomically without creating a payment or marking a positive order paid', async () => {
    const fixture = await rentalScenario(prisma);
    const created = await web.createOrder(
      fixture.shop.id,
      {
        customer: { name: fixture.customer.fullName, phone: fixture.customer.phone },
        pickupDate: '2026-10-10',
        returnDate: '2026-10-12',
        items: [{ variantId: fixture.variant.id, quantity: 1 }],
        delivery: { method: 'self_pickup' },
        paymentMethod: 'momo',
      },
      'web-payment-preference',
    );

    const stored = await prisma.rentalOrder.findFirstOrThrow({
      where: { shopId: fixture.shop.id, orderNumber: created.orderCode },
    });
    expect(stored).toMatchObject({
      preferredPaymentMethod: 'momo',
      paymentStatus: 'UNPAID',
      collateralMethod: 'CASH',
    });
    await expect(
      prisma.paymentTransaction.count({ where: { shopId: fixture.shop.id, orderId: stored.id } }),
    ).resolves.toBe(0);

    const read = await rentals.get(fixture.shop.id, stored.id);
    const response = toRentalResponse(
      new RentalReadPresenter({ resolve: () => 'https://assets.example.test' }).details(read),
    );
    expect(response).toMatchObject({ preferredPaymentMethod: 'momo', paymentStatus: 'UNPAID' });

    await expect(
      web.createOrder(
        fixture.shop.id,
        {
          customer: { name: fixture.customer.fullName, phone: fixture.customer.phone },
          pickupDate: '2026-10-10',
          returnDate: '2026-10-12',
          items: [{ variantId: fixture.variant.id, quantity: 1 }],
          delivery: { method: 'self_pickup' },
          paymentMethod: 'cash',
        },
        'web-payment-preference',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
