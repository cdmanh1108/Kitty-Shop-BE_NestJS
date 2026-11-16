import { returnAndSettle } from '../fixtures/return.fixture';
import { rentalPolicies } from '../fixtures/rental-policy.fixture';
import { ConfiguredPublicMediaUrlResolver } from '../../src/common/storage/public-url.resolver';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  connectTestDatabase,
  disconnectTestDatabase,
  resetTestDatabase,
} from '../helpers/test-database';
import { rentalScenario, fixedClock, payRentalForConfirmation } from '../fixtures/rental.fixture';
import {
  createTestProductWithVariant,
  createTestShop,
  uniqueCode,
} from '../fixtures/test-factories';
import { PrismaCatalogRepository } from '../../src/modules/catalog/infrastructure/prisma-catalog.repository';
import { PrismaRentalRepository } from '../../src/modules/rentals/infrastructure/prisma-rental.repository';
import { CatalogInvariantError } from '../../src/modules/catalog/domain/catalog-errors';
import { RentalInventoryUnavailableError } from '../../src/modules/rentals/domain/rental-errors';
import type { PrismaService } from '../../src/database/prisma/prisma.service';

describe('Catalog persistence invariants', () => {
  let prisma: PrismaService;
  let catalog: PrismaCatalogRepository;
  let rentals: PrismaRentalRepository;
  beforeAll(async () => {
    prisma = await connectTestDatabase();
    catalog = new PrismaCatalogRepository(
      prisma,
      new ConfiguredPublicMediaUrlResolver('https://assets.test.example'),
      rentalPolicies,
    );
    rentals = new PrismaRentalRepository(prisma, fixedClock, rentalPolicies);
  });
  beforeEach(async () => {
    await resetTestDatabase(prisma);
  });
  afterAll(disconnectTestDatabase);

  it.each(['RESERVED', 'CONFIRMED', 'ACTIVE'] as const)(
    'unreleased %s protects archives even after planned end',
    async (status) => {
      const f = await rentalScenario(prisma);
      const order = await rentals.createOrder({
        ...f.data,
        rentalStartAt: new Date('2000-01-01T00:00:00Z'),
        rentalEndAt: new Date('2000-01-03T00:00:00Z'),
      });
      if (!order) throw new Error('Expected order');
      if (status !== 'RESERVED') {
        await payRentalForConfirmation(prisma, {
          shopId: f.shop.id,
          orderId: order.id,
          memberId: f.member.id,
          rentalAmount: 200000,
          depositAmount: 200000,
        });
        await rentals.confirm({
          shopId: f.shop.id,
          orderId: order.id,
          actorMemberId: f.member.id,
          actorUserId: f.user.id,
          actorName: f.user.fullName,
          collateralMethod: 'CASH',
          collateralAmount: 200000,
        });
        if (status === 'ACTIVE')
          await rentals.transition({
            shopId: f.shop.id,
            orderId: order.id,
            fromStatuses: ['CONFIRMED'],
            toStatus: 'ACTIVE',
            changedBy: f.member.id,
          });
      }
      await expect(catalog.archiveProduct(f.shop.id, f.product.id)).rejects.toBeInstanceOf(
        CatalogInvariantError,
      );
      await expect(
        catalog.updateProduct(f.shop.id, f.product.id, { status: 'ARCHIVED' }),
      ).rejects.toBeInstanceOf(CatalogInvariantError);
      await expect(
        catalog.archiveInventoryItem(f.shop.id, f.inventory.id, 'Audit', f.member.id),
      ).rejects.toBeInstanceOf(CatalogInvariantError);
      expect(
        (await prisma.product.findUniqueOrThrow({ where: { id: f.product.id } })).archivedAt,
      ).toBeNull();
      expect(
        (await prisma.inventoryItem.findUniqueOrThrow({ where: { id: f.inventory.id } }))
          .archivedAt,
      ).toBeNull();
    },
  );

  it.each(['CANCELLED', 'COMPLETED'] as const)(
    'allows archive after %s releases occupancy',
    async (status) => {
      const f = await rentalScenario(prisma);
      const order = await rentals.createOrder(f.data);
      if (!order) throw new Error('Expected order');
      if (status === 'COMPLETED') {
        await payRentalForConfirmation(prisma, {
          shopId: f.shop.id,
          orderId: order.id,
          memberId: f.member.id,
          rentalAmount: 200000,
          depositAmount: 200000,
        });
        await rentals.confirm({
          shopId: f.shop.id,
          orderId: order.id,
          actorMemberId: f.member.id,
          actorUserId: f.user.id,
          actorName: f.user.fullName,
          collateralMethod: 'CASH',
          collateralAmount: 200000,
        });
        await rentals.transition({
          shopId: f.shop.id,
          orderId: order.id,
          fromStatuses: ['CONFIRMED'],
          toStatus: 'ACTIVE',
          changedBy: f.member.id,
        });
      }
      if (status === 'COMPLETED') await returnAndSettle(rentals, f, order.id);
      else
        await rentals.transition({
          shopId: f.shop.id,
          orderId: order.id,
          fromStatuses: ['RESERVED'],
          toStatus: 'CANCELLED',
          changedBy: f.member.id,
        });
      expect(
        await catalog.archiveInventoryItem(f.shop.id, f.inventory.id, 'Audit', f.member.id),
      ).toBe(true);
      expect(await catalog.archiveProduct(f.shop.id, f.product.id)).toBe(true);
      expect(await prisma.rentalItemAllocation.count({ where: { orderId: order.id } })).toBe(1);
    },
  );

  it.each(['product', 'inventory'] as const)(
    'booking versus %s archive has exactly one winner',
    async (target) => {
      const f = await rentalScenario(prisma);
      const [booking, archive] = await Promise.allSettled([
        rentals.createOrder(f.data),
        target === 'product'
          ? catalog.archiveProduct(f.shop.id, f.product.id)
          : catalog.archiveInventoryItem(f.shop.id, f.inventory.id, 'Audit', f.member.id),
      ]);
      expect([booking, archive].filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const item =
        target === 'product'
          ? await prisma.product.findUniqueOrThrow({ where: { id: f.product.id } })
          : await prisma.inventoryItem.findUniqueOrThrow({ where: { id: f.inventory.id } });
      const count = await prisma.rentalItemAllocation.count({
        where: { inventoryItemId: f.inventory.id },
      });
      if (archive.status === 'fulfilled') {
        expect(archive.value).toBe(true);
        expect(item.archivedAt).not.toBeNull();
        expect(count).toBe(0);
        if (booking.status === 'rejected')
          expect(booking.reason).toBeInstanceOf(RentalInventoryUnavailableError);
      } else {
        expect(archive.reason).toBeInstanceOf(CatalogInvariantError);
        expect(item.archivedAt).toBeNull();
        expect(count).toBe(1);
      }
    },
  );

  describe('ProductVariant update, archive and deletion lifecycle', () => {
    async function createSize(shopId: string, name: string, isActive = true) {
      return prisma.size.create({
        data: { shopId, code: uniqueCode('SIZE'), name, isActive },
      });
    }

    async function createColor(shopId: string, name: string, isActive = true) {
      return prisma.color.create({
        data: { shopId, code: uniqueCode('COLOR'), name, isActive },
      });
    }

    it('preserves omitted fields, clears explicit nulls and enforces nullable combination uniqueness', async () => {
      const f = await rentalScenario(prisma);
      const size = await createSize(f.shop.id, 'Medium');
      const otherSize = await createSize(f.shop.id, 'Large');
      const color = await createColor(f.shop.id, 'Red');
      const otherColor = await createColor(f.shop.id, 'Blue');
      await prisma.productVariant.update({
        where: { id: f.variant.id },
        data: { sizeId: size.id, colorId: color.id, depositAmountOverride: 200000 },
      });
      const second = await catalog.addVariant(f.shop.id, f.product.id, {
        variantCode: uniqueCode('VAR'),
        sizeId: otherSize.id,
        colorId: otherColor.id,
        inventoryCount: 0,
      });
      if (!second) throw new Error('Expected second variant');

      await expect(
        catalog.updateProductVariant(f.shop.id, f.product.id, second.id, { sizeId: size.id }),
      ).resolves.toMatchObject({ variant: { sizeId: size.id, colorId: otherColor.id } });
      await expect(
        catalog.updateProductVariant(f.shop.id, f.product.id, second.id, {
          variantCode: f.variant.variantCode,
        }),
      ).rejects.toMatchObject({ code: 'PRODUCT_VARIANT_CODE_ALREADY_EXISTS' });
      await expect(
        catalog.updateProductVariant(f.shop.id, f.product.id, second.id, {
          colorId: color.id,
        }),
      ).rejects.toMatchObject({ code: 'PRODUCT_VARIANT_COMBINATION_DUPLICATE' });

      const updated = await catalog.updateProductVariant(f.shop.id, f.product.id, f.variant.id, {
        depositAmountOverride: 350000,
      });
      expect(updated?.variant).toMatchObject({
        sizeId: size.id,
        colorId: color.id,
      });
      expect(updated?.variant.depositAmountOverride?.toString()).toBe('350000');

      await catalog.updateProductVariant(f.shop.id, f.product.id, f.variant.id, { colorId: null });
      await expect(
        catalog.updateProductVariant(f.shop.id, f.product.id, second.id, {
          sizeId: size.id,
          colorId: null,
        }),
      ).rejects.toMatchObject({ code: 'PRODUCT_VARIANT_COMBINATION_DUPLICATE' });
      expect(
        await catalog.updateProductVariant(f.shop.id, f.product.id, f.variant.id, {}),
      ).toMatchObject({
        variant: { variantCode: f.variant.variantCode, sizeId: size.id, colorId: null },
      });

      const otherShop = await createTestShop(prisma);
      const otherProduct = await createTestProductWithVariant(prisma, f.shop.id, {
        inventoryCount: 0,
      });
      expect(
        await catalog.updateProductVariant(otherShop.id, f.product.id, f.variant.id, {
          variantCode: 'CROSS-SHOP',
        }),
      ).toBeNull();
      expect(
        await catalog.updateProductVariant(f.shop.id, otherProduct.product.id, second.id, {
          variantCode: 'WRONG-PRODUCT',
        }),
      ).toBeNull();
    });

    it('allows unrelated updates with inactive existing references but rejects new inactive assignments and reactivation', async () => {
      const f = await rentalScenario(prisma);
      const inactiveSize = await createSize(f.shop.id, 'Old size', false);
      const inactiveColor = await createColor(f.shop.id, 'Old color', false);
      await prisma.productVariant.update({
        where: { id: f.variant.id },
        data: { sizeId: inactiveSize.id, colorId: inactiveColor.id },
      });

      await expect(
        catalog.updateProductVariant(f.shop.id, f.product.id, f.variant.id, {
          variantCode: 'UPDATED-CODE',
        }),
      ).resolves.toMatchObject({ variant: { variantCode: 'UPDATED-CODE' } });
      await expect(
        catalog.updateProductVariant(f.shop.id, f.product.id, f.variant.id, {
          sizeId: inactiveSize.id,
        }),
      ).resolves.toMatchObject({ variant: { sizeId: inactiveSize.id } });

      const anotherInactiveSize = await createSize(f.shop.id, 'Inactive target', false);
      const anotherInactiveColor = await createColor(f.shop.id, 'Inactive target', false);
      await expect(
        catalog.updateProductVariant(f.shop.id, f.product.id, f.variant.id, {
          sizeId: anotherInactiveSize.id,
        }),
      ).rejects.toMatchObject({ code: 'SIZE_INACTIVE' });
      await expect(
        catalog.updateProductVariant(f.shop.id, f.product.id, f.variant.id, {
          colorId: anotherInactiveColor.id,
        }),
      ).rejects.toMatchObject({ code: 'COLOR_INACTIVE' });

      await catalog.setProductVariantArchived(f.shop.id, f.product.id, f.variant.id, true);
      await expect(
        catalog.setProductVariantArchived(f.shop.id, f.product.id, f.variant.id, false),
      ).rejects.toMatchObject({ code: 'SIZE_INACTIVE' });
    });

    it('archives idempotently without changing inventory/rates and keeps archived variants in Admin detail', async () => {
      const f = await rentalScenario(prisma);
      const inventoryBefore = await prisma.inventoryItem.count({
        where: { variantId: f.variant.id },
      });

      const archived = await catalog.setProductVariantArchived(
        f.shop.id,
        f.product.id,
        f.variant.id,
        true,
      );
      expect(archived?.changed).toBe(true);
      expect(archived?.variant.archivedAt).not.toBeNull();
      const adminProduct = await catalog.findProduct(f.shop.id, f.product.id);
      expect(adminProduct?.variants[0]?.id).toBe(f.variant.id);
      expect(adminProduct?.variants[0]?.archivedAt).toBeInstanceOf(Date);
      expect(await prisma.inventoryItem.count({ where: { variantId: f.variant.id } })).toBe(
        inventoryBefore,
      );
      expect(
        (await catalog.setProductVariantArchived(f.shop.id, f.product.id, f.variant.id, true))
          ?.changed,
      ).toBe(false);
      const conflictingActiveVariant = await prisma.productVariant.create({
        data: {
          shopId: f.shop.id,
          productId: f.product.id,
          variantCode: uniqueCode('ACTIVE'),
        },
      });
      await expect(
        catalog.setProductVariantArchived(f.shop.id, f.product.id, f.variant.id, false),
      ).rejects.toMatchObject({ code: 'PRODUCT_VARIANT_COMBINATION_DUPLICATE' });
      await prisma.productVariant.delete({ where: { id: conflictingActiveVariant.id } });
      expect(
        (await catalog.setProductVariantArchived(f.shop.id, f.product.id, f.variant.id, false))
          ?.variant.archivedAt,
      ).toBeNull();
    });

    it('hard deletes an unused variant with owned rates, but historical inventory blocks deletion', async () => {
      const shop = await createTestShop(prisma);
      const unused = await createTestProductWithVariant(prisma, shop.id, { inventoryCount: 0 });
      expect(
        await catalog.deleteProductVariant(shop.id, unused.product.id, unused.variant.id),
      ).toMatchObject({ kind: 'DELETED', variant: { id: unused.variant.id } });
      expect(
        await prisma.productVariant.findUnique({ where: { id: unused.variant.id } }),
      ).toBeNull();

      const used = await rentalScenario(prisma);
      await prisma.inventoryItem.update({
        where: { id: used.inventory.id },
        data: { archivedAt: new Date(), isActive: false },
      });
      expect(
        await catalog.deleteProductVariant(used.shop.id, used.product.id, used.variant.id),
      ).toMatchObject({ kind: 'IN_USE', variant: { id: used.variant.id } });
    });
  });

  it('DB protects nullable variant combinations while allowing archived history', async () => {
    const f = await rentalScenario(prisma);
    const data = { shopId: f.shop.id, productId: f.product.id, variantCode: uniqueCode('V') };
    await expect(prisma.productVariant.create({ data })).rejects.toMatchObject({ code: 'P2002' });
    await prisma.productVariant.create({ data: { ...data, archivedAt: fixedClock.now() } });
  });

  it('concurrent variant additions cannot duplicate size/color', async () => {
    const f = await rentalScenario(prisma);
    const size = await prisma.size.create({
      data: { shopId: f.shop.id, code: uniqueCode('SIZE'), name: 'Other' },
    });
    const results = await Promise.allSettled(
      [1, 2].map(() =>
        catalog.addVariant(f.shop.id, f.product.id, {
          variantCode: uniqueCode('V'),
          sizeId: size.id,
          inventoryCount: 0,
        }),
      ),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(
      await prisma.productVariant.count({ where: { productId: f.product.id, sizeId: size.id } }),
    ).toBe(1);
  });

  it('DB and concurrent media writes preserve one primary image', async () => {
    const f = await rentalScenario(prisma);
    const data = {
      shopId: f.shop.id,
      productId: f.product.id,
      url: 'https://example.com/one.jpg',
      isPrimary: true,
    };
    await prisma.productMedia.create({ data });
    await expect(prisma.productMedia.create({ data })).rejects.toMatchObject({ code: 'P2002' });
    const results = await Promise.allSettled(
      [1, 2].map((id) =>
        catalog.addProductMedia(f.shop.id, f.product.id, {
          url: `https://example.com/${id}.jpg`,
          isPrimary: true,
          sortOrder: id,
        }),
      ),
    );
    expect(results.some((r) => r.status === 'fulfilled')).toBe(true);
    expect(
      await prisma.productMedia.count({ where: { productId: f.product.id, isPrimary: true } }),
    ).toBe(1);
  });

  it('ships the custom PostgreSQL invariants in the single release baseline', () => {
    const migration = readFileSync(
      join(process.cwd(), 'prisma/migrations/202610230001_initial_release/migration.sql'),
      'utf8',
    );
    expect(migration).toContain('CREATE EXTENSION IF NOT EXISTS btree_gist');
    expect(migration).toContain('EXCLUDE USING gist');
    expect(migration).toContain('product_variants_unarchived_combination_unique');
    expect(migration).toContain('product_media_product_id_primary_unique');
    expect(migration).not.toContain('rental_rates');
  });
});
