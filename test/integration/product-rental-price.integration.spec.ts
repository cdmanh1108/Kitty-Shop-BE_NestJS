import { checkoutQuoteFixture } from '../fixtures/rental-quote.fixture';
import type { PrismaService } from '../../src/database/prisma/prisma.service';
import { ConfiguredPublicMediaUrlResolver } from '../../src/common/storage/public-url.resolver';
import { PrismaCatalogRepository } from '../../src/modules/catalog/infrastructure/prisma-catalog.repository';
import { PrismaRentalRepository } from '../../src/modules/rentals/infrastructure/prisma-rental.repository';
import { PrismaSettingsRepository } from '../../src/modules/settings/infrastructure/prisma-settings.repository';
import { SettingsService } from '../../src/modules/settings/application/settings.service';
import { WebRentalEvaluationService } from '../../src/modules/rentals/application/web-rental-evaluation.service';
import { WebRentalOrderService } from '../../src/modules/rentals/application/web-rental-order.service';
import { PrismaCustomerRepository } from '../../src/modules/customers/infrastructure/prisma-customer.repository';
import {
  resolveRentalLinePricing,
  readRentalCyclePricing,
} from '../../src/modules/rentals/domain/rental-pricing-snapshot';
import { fixedClock, rentalScenario } from '../fixtures/rental.fixture';
import { createTestProductWithVariant } from '../fixtures/test-factories';
import {
  connectTestDatabase,
  disconnectTestDatabase,
  resetTestDatabase,
} from '../helpers/test-database';

describe('product rental price persistence and booking', () => {
  let prisma: PrismaService;
  let catalog: PrismaCatalogRepository;
  let rentals: PrismaRentalRepository;
  let settings: SettingsService;
  let evaluation: WebRentalEvaluationService;
  beforeAll(async () => {
    prisma = await connectTestDatabase();
    settings = new SettingsService(new PrismaSettingsRepository(prisma), {
      log: () => Promise.resolve(),
    });
    catalog = new PrismaCatalogRepository(
      prisma,
      new ConfiguredPublicMediaUrlResolver('https://assets.example.test'),
      settings,
    );
    rentals = new PrismaRentalRepository(prisma, fixedClock, settings);
    evaluation = new WebRentalEvaluationService(rentals, settings);
  });
  beforeEach(async () => {
    await resetTestDatabase(prisma);
  });
  afterAll(disconnectTestDatabase);

  it('stores per-product accessory limits and exposes them through canonical catalog reads', async () => {
    const f = await rentalScenario(prisma);
    expect(f.product.freeAccessoryLimit).toBe(1);
    const product = await catalog.createProduct(f.shop.id, {
      code: 'CUSTOM-ACCESSORY-LIMIT',
      name: 'Custom allowance',
      categoryId: f.product.categoryId,
      defaultDepositAmount: 100000,
      isPublic: true,
      freeAccessoryLimit: 3,
      variants: [],
      media: [],
    });
    expect(product).toMatchObject({ freeAccessoryLimit: 3 });
    await catalog.updateProduct(f.shop.id, f.product.id, { freeAccessoryLimit: 3 });
    expect(await catalog.findProduct(f.shop.id, f.product.id)).toMatchObject({
      freeAccessoryLimit: 3,
    });
    expect(await catalog.findStorefrontProductBySlug(f.shop.id, f.product.slug)).toMatchObject({
      freeAccessoryLimit: 3,
    });
    const list = await catalog.listStorefrontProducts({ shopId: f.shop.id, page: 1, limit: 10 });
    expect(list.items.find((item) => item.id === f.product.id)).toMatchObject({
      freeAccessoryLimit: 3,
    });
    const lookup = await catalog.lookupProducts({ shopId: f.shop.id, page: 1, limit: 10 });
    expect(lookup.items.find((item) => item.id === f.product.id)).toMatchObject({
      freeAccessoryLimit: 3,
    });
    const projection = await catalog.resolveStorefrontSelections({
      shopId: f.shop.id,
      selections: [{ productId: f.product.id, variantId: f.variant.id, quantity: 1 }],
    });
    expect(projection[0]).toMatchObject({ status: 'RESOLVED', product: { freeAccessoryLimit: 3 } });
    await catalog.updateProduct(f.shop.id, f.product.id, { freeAccessoryLimit: 0 });
    await catalog.updateProduct(f.shop.id, f.product.id, { name: 'Unrelated edit' });
    expect(await catalog.findProduct(f.shop.id, f.product.id)).toMatchObject({
      freeAccessoryLimit: 0,
    });
    await expect(
      prisma.product.update({ where: { id: f.product.id }, data: { freeAccessoryLimit: -1 } }),
    ).rejects.toThrow('products_free_accessory_limit_nonnegative');
  });

  it('stores zero, clears to null, and reads changed shop defaults without copying them into products', async () => {
    const f = await rentalScenario(prisma);
    await catalog.updateProduct(f.shop.id, f.product.id, { rentalPriceOverride: 0 });
    expect(
      (await catalog.findStorefrontProductBySlug(f.shop.id, f.product.slug))?.rentalPrice,
    ).toBe(0);
    await catalog.updateProduct(f.shop.id, f.product.id, { rentalPriceOverride: null });
    expect(
      (await catalog.findStorefrontProductBySlug(f.shop.id, f.product.slug))?.rentalPrice,
    ).toBe(50000);
    await settings.updateRentalPolicy(f.principal, {
      rentalPricing: { defaultRentalPrice: 70000 },
    });
    const list = await catalog.listStorefrontProducts({ shopId: f.shop.id, page: 1, limit: 10 });
    expect(list.items[0]).toMatchObject({ rentalPriceOverride: null, rentalPrice: 70000 });
    expect(
      (await prisma.product.findUniqueOrThrow({ where: { id: f.product.id } })).rentalPriceOverride,
    ).toBeNull();
    await expect(
      prisma.product.update({ where: { id: f.product.id }, data: { rentalPriceOverride: -1 } }),
    ).rejects.toThrow('products_rental_price_override_check');
  });

  it('quotes mixed prices per line and uses the product price again on cycle renewals', async () => {
    const f = await rentalScenario(prisma);
    await catalog.updateProduct(f.shop.id, f.product.id, { rentalPriceOverride: 80000 });
    const other = await createTestProductWithVariant(prisma, f.shop.id);
    const quote = await evaluation.calculateQuote(f.shop.id, {
      pickupDate: '2026-10-10T08:30:00+07:00',
      returnDate: '2026-10-15T08:30:00+07:00',
      items: [
        { variantId: f.variant.id, quantity: 1 },
        { variantId: other.variant.id, quantity: 1 },
      ],
    });
    expect(quote.pricing).toBeNull();
    expect(quote.rentalSubtotal).toBe(320000);
    expect(quote.items[0]).toMatchObject({
      unitRentalPrice: 190000,
      pricing: { cyclePrice: 80000, priceSource: 'PRODUCT' },
    });
    expect(quote.items[1]).toMatchObject({
      unitRentalPrice: 130000,
      pricing: { cyclePrice: 50000, priceSource: 'SHOP' },
    });
    expect(quote.items[0]?.pricing).not.toHaveProperty('policy');

    await catalog.updateProduct(f.shop.id, f.product.id, { rentalPriceOverride: 50000 });
    const sameAmounts = await evaluation.calculateQuote(f.shop.id, {
      pickupDate: '2026-10-10T08:30:00+07:00',
      returnDate: '2026-10-15T08:30:00+07:00',
      items: [
        { variantId: f.variant.id, quantity: 1 },
        { variantId: other.variant.id, quantity: 1 },
      ],
    });
    expect(sameAmounts.rentalSubtotal).toBe(260000);
    expect(sameAmounts.pricing).toBeNull();
    expect(sameAmounts.items.map((item) => item.pricing?.priceSource)).toEqual(['PRODUCT', 'SHOP']);
  });

  it('persists Web prices and replays an accepted order after catalog/settings changes', async () => {
    const f = await rentalScenario(prisma);
    await catalog.updateProduct(f.shop.id, f.product.id, { rentalPriceOverride: 80000 });
    const account = await prisma.webAccount.create({
      data: {
        email: 'pricing@example.test',
        emailVerifiedAt: fixedClock.now(),
        passwordHash: 'test-only',
      },
    });
    const web = new WebRentalOrderService(
      rentals,
      rentals,
      settings,
      new PrismaCustomerRepository(prisma),
      fixedClock,
    );
    const req = {
      customer: { name: f.customer.fullName, phone: f.customer.phone },
      pickupDate: '2026-10-10T08:30:00+07:00',
      returnDate: '2026-10-12T08:30:00+07:00',
      items: [{ variantId: f.variant.id, quantity: 1 }],
      delivery: { method: 'self_pickup' as const },
      paymentMethod: 'cash' as const,
    };
    const owner = { webAccountId: account.id, email: account.email };
    await expect(
      web.createOrder(
        f.shop.id,
        { ...req, expectedQuote: checkoutQuoteFixture(50000) },
        'stale-product-price',
        owner,
      ),
    ).rejects.toMatchObject({ code: 'RENTAL_QUOTE_CHANGED' });
    expect(await prisma.rentalOrder.count()).toBe(0);
    const acceptedRequest = { ...req, expectedQuote: checkoutQuoteFixture(90000) };
    const created = await web.createOrder(
      f.shop.id,
      acceptedRequest,
      'product-price-create',
      owner,
    );
    expect(created.totalAmount).toBe(90000);
    await catalog.updateProduct(f.shop.id, f.product.id, { rentalPriceOverride: 120000 });
    await settings.updateRentalPolicy(f.principal, {
      rentalPricing: { defaultRentalPrice: 60000 },
    });
    expect(
      await web.createOrder(f.shop.id, acceptedRequest, 'product-price-create', owner),
    ).toEqual(created);
    const line = await prisma.rentalOrderItem.findFirstOrThrow();
    expect(readRentalCyclePricing(line.pricingSnapshot)).toMatchObject({
      cyclePrice: 80000,
      unitRentalPrice: 90000,
      priceSource: 'PRODUCT',
    });
  });

  it('rechecks catalog price in the booking transaction and preserves explicit Admin overrides', async () => {
    const f = await rentalScenario(prisma);
    const policy = await settings.getPolicy(f.shop.id);
    await catalog.updateProduct(f.shop.id, f.product.id, { rentalPriceOverride: 80000 });
    const staleLine = {
      ...f.data.lines[0]!,
      ...resolveRentalLinePricing({
        durationDays: 2,
        billableQuantity: 1,
        policy: policy.rentalPricing,
        quantity: 1,
        depositPerItem: 200000,
      }),
    };
    await expect(rentals.createOrder({ ...f.data, lines: [staleLine] })).rejects.toMatchObject({
      code: 'RENTAL_PRODUCT_PRICE_CHANGED',
    });
    expect(await prisma.rentalOrder.count()).toBe(0);
    const overridden = {
      ...staleLine,
      ...resolveRentalLinePricing({
        durationDays: 2,
        billableQuantity: 1,
        policy: policy.rentalPricing,
        productCyclePriceOverride: 80000,
        orderCyclePriceOverride: 70000,
        itemCyclePriceOverride: 0,
        quantity: 1,
        depositPerItem: 200000,
      }),
    };
    const order = await rentals.createOrder({ ...f.data, lines: [overridden] });
    expect(order?.rentalSubtotal.toString()).toBe('10000');
  });
});
