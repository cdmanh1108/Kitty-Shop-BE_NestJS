import { ConfiguredPublicMediaUrlResolver } from '../../src/common/storage/public-url.resolver';
import type { PrismaService } from '../../src/database/prisma/prisma.service';
import {
  connectTestDatabase,
  resetTestDatabase,
  disconnectTestDatabase,
} from '../helpers/test-database';
import {
  createTestCustomer,
  createTestShop,
  createTestCategory,
  uniqueCode,
} from '../fixtures/test-factories';
import { rentalScenario } from '../fixtures/rental.fixture';
import { PrismaCatalogRepository } from '../../src/modules/catalog/infrastructure/prisma-catalog.repository';
import { PrismaCustomerRepository } from '../../src/modules/customers/infrastructure/prisma-customer.repository';
import { CustomerService } from '../../src/modules/customers/application/customer.service';
import { AuditService } from '../../src/modules/audit/application/audit.service';
import { PrismaAuditRepository } from '../../src/modules/audit/infrastructure/prisma-audit.repository';
import { ConflictException } from '@nestjs/common';
import { PrismaFinanceRepository } from '../../src/modules/finance/infrastructure/prisma-finance.repository';

describe('Catalog and customer persistence boundaries', () => {
  let prisma: PrismaService;
  beforeAll(async () => {
    prisma = await connectTestDatabase();
  });
  beforeEach(async () => {
    await resetTestDatabase(prisma);
  });
  afterAll(disconnectTestDatabase);

  it('creates product variants, physical inventory and rates, preserves decimal JSON and scopes reads/updates', async () => {
    const shop = await createTestShop(prisma);
    const other = await createTestShop(prisma);
    const category = await createTestCategory(prisma, shop.id);
    const repo = new PrismaCatalogRepository(
      prisma,
      new ConfiguredPublicMediaUrlResolver('https://assets.test.example'),
    );
    const product = await repo.createProduct(shop.id, {
      code: uniqueCode('P'),
      name: 'Boutique dress',
      categoryId: category.id,
      defaultDepositAmount: 200000,
      isPublic: true,
      variants: [
        {
          variantCode: uniqueCode('V'),
          inventoryCount: 2,
          rentalRates: [{ durationDays: 1, price: 50000 }],
        },
      ],
      media: [],
    });
    if (!product) throw new Error('Missing product');
    const detail = await repo.findProduct(shop.id, product.id);
    expect(detail?.variants[0]?.inventoryItems).toHaveLength(2);
    expect(detail?.variants[0]?.rentalRates[0]?.price.toString()).toBe('50000');
    expect(JSON.stringify(detail)).toContain('"price":"50000"');
    expect(await repo.findProduct(other.id, product.id)).toBeNull();
    expect((await repo.listProducts({ shopId: other.id, page: 1, limit: 10 })).items).toEqual([]);
    expect(await repo.updateProduct(other.id, product.id, { name: 'Spoof' })).toBeNull();
    await repo.updateProduct(shop.id, product.id, { name: 'Updated dress' });
    expect((await repo.findProduct(shop.id, product.id))?.name).toBe('Updated dress');
  });

  it('normalizes customer create/update and isolates search/read/write across shops', async () => {
    const f = await rentalScenario(prisma);
    const other = await createTestShop(prisma);
    const repo = new PrismaCustomerRepository(prisma);
    const service = new CustomerService(repo, new AuditService(new PrismaAuditRepository(prisma)));
    const customer = await service.create(f.principal, {
      fullName: '  Alice Boutique  ',
      phone: '0939 505 378',
    });
    expect(customer).toMatchObject({ fullName: 'Alice Boutique', normalizedPhone: '0939505378' });
    await service.update(f.principal, customer.id, { fullName: 'Alice Updated' });
    expect(
      (await repo.list({ shopId: f.shop.id, search: '0939 505', page: 1, limit: 10 })).items.map(
        (row) => row.id,
      ),
    ).toEqual([customer.id]);
    expect(
      (
        await repo.list({ shopId: f.shop.id, search: 'Alice Updated', page: 1, limit: 10 })
      ).items.map((row) => row.id),
    ).toEqual([customer.id]);
    expect(
      (await repo.list({ shopId: other.id, search: 'Alice', page: 1, limit: 10 })).items,
    ).toEqual([]);
    expect(await repo.findById(other.id, customer.id)).toBeNull();
    expect(await repo.update(other.id, customer.id, { fullName: 'Spoof' })).toBeNull();

    await expect(
      service.create(f.principal, { fullName: 'Duplicate Alice', phone: '+84 939 505 378' }),
    ).rejects.toThrow(ConflictException);
    await expect(
      createTestCustomer(prisma, other.id, {
        phone: '+84 939 505 378',
        normalizedPhone: '0939505378',
      }),
    ).resolves.toBeDefined();

    const second = await service.create(f.principal, {
      fullName: 'Second Customer',
      phone: '0912 345 678',
    });
    await expect(
      service.update(f.principal, second.id, { phone: '+84 939 505 378' }),
    ).rejects.toThrow(ConflictException);

    expect(await repo.lookup({ shopId: f.shop.id, search: '+84 939', limit: 20 })).toEqual([
      { id: customer.id, fullName: 'Alice Updated', phone: '0939 505 378' },
    ]);
  });

  it('aggregates only completed non-voided payments and keeps deposits separate', async () => {
    const f = await rentalScenario(prisma);
    const rental = await prisma.rentalOrder.create({
      data: {
        shopId: f.shop.id, customerId: f.customer.id, orderNumber: uniqueCode('RT'),
        rentalStartAt: f.data.rentalStartAt, rentalEndAt: f.data.rentalEndAt,
        createdBy: f.member.id,
      },
    });
    const finance = new PrismaFinanceRepository(prisma);
    const record = (purpose: 'RENTAL_PAYMENT' | 'DEPOSIT' | 'ORDER_REFUND' | 'DEPOSIT_REFUND', direction: 'IN' | 'OUT', amount: number) =>
      finance.createPayment({ shopId: f.shop.id, orderId: rental.id, transactionNumber: uniqueCode('PAY'), purpose, direction, amount, paymentMethod: 'CASH', paidAt: new Date(), createdBy: f.member.id });
    await record('RENTAL_PAYMENT', 'IN', 200000);
    await record('DEPOSIT', 'IN', 100000);
    await record('ORDER_REFUND', 'OUT', 30000);
    await record('DEPOSIT_REFUND', 'OUT', 20000);
    const voided = await record('RENTAL_PAYMENT', 'IN', 50000);
    if (!voided) throw new Error('Missing payment');
    await finance.voidPayment({ shopId: f.shop.id, paymentId: voided.id, voidedBy: f.member.id });
    expect((await new PrismaCustomerRepository(prisma).findById(f.shop.id, f.customer.id))?.stats).toMatchObject({
      totalPaid: 170000,
      depositHeld: 80000,
    });
  });
});
