import type { AuditPort } from '../../src/modules/audit/domain/audit.port';
import { ColorService } from '../../src/modules/catalog/application/color.service';
import { SizeService } from '../../src/modules/catalog/application/size.service';
import {
  CATALOG_ERROR_CODE,
  CatalogColorError,
  CatalogSizeError,
} from '../../src/modules/catalog/domain/catalog-errors';
import { ConfiguredPublicMediaUrlResolver } from '../../src/common/storage/public-url.resolver';
import type { PrismaService } from '../../src/database/prisma/prisma.service';
import { PrismaCatalogRepository } from '../../src/modules/catalog/infrastructure/prisma-catalog.repository';
import {
  connectTestDatabase,
  disconnectTestDatabase,
  resetTestDatabase,
} from '../helpers/test-database';
import { rentalScenario } from '../fixtures/rental.fixture';
import { uniqueCode } from '../fixtures/test-factories';

describe('Catalog Color and Size persistence invariants', () => {
  let prisma: PrismaService;
  let catalog: PrismaCatalogRepository;
  let colors: ColorService;
  let sizes: SizeService;
  const audit: AuditPort = { log: jest.fn().mockResolvedValue(undefined) };

  beforeAll(async () => {
    prisma = await connectTestDatabase();
    catalog = new PrismaCatalogRepository(
      prisma,
      new ConfiguredPublicMediaUrlResolver('https://assets.test.example'),
    );
    colors = new ColorService(catalog, audit);
    sizes = new SizeService(catalog, audit);
  });

  beforeEach(async () => {
    await resetTestDatabase(prisma);
  });

  afterAll(disconnectTestDatabase);

  it('returns only active references and preserves historical inactive relations', async () => {
    const f = await rentalScenario(prisma);
    const size = await catalog.createSize(f.shop.id, {
      code: uniqueCode('SIZE'),
      name: 'Size inactive',
      sortOrder: 10,
    });
    const activeSize = await catalog.createSize(f.shop.id, {
      code: uniqueCode('SIZE'),
      name: 'Size active',
      sortOrder: 5,
    });
    const color = await catalog.createColor(f.shop.id, {
      code: uniqueCode('COLOR'),
      name: 'Color inactive',
      hexColor: '#AABBCC',
    });
    const activeColor = await catalog.createColor(f.shop.id, {
      code: uniqueCode('COLOR'),
      name: 'Color active',
      hexColor: null,
    });
    await prisma.size.update({ where: { id: size.id }, data: { isActive: false } });
    await prisma.color.update({ where: { id: color.id }, data: { isActive: false } });
    await prisma.productVariant.update({
      where: { id: f.variant.id },
      data: { sizeId: size.id, colorId: color.id },
    });

    const lookups = await catalog.listLookups(f.shop.id);
    expect(lookups.sizes.map(({ id }) => id)).toEqual([activeSize.id]);
    expect(lookups.colors.map(({ id }) => id)).toEqual([activeColor.id]);
    const historical = await prisma.productVariant.findUniqueOrThrow({
      where: { id: f.variant.id },
      include: { size: true, color: true },
    });
    expect(historical.size?.id).toBe(size.id);
    expect(historical.color?.id).toBe(color.id);
    expect(historical.size?.isActive).toBe(false);
    expect(historical.color?.isActive).toBe(false);
  });

  it('orders active Size lookup values by sortOrder then name', async () => {
    const f = await rentalScenario(prisma);
    await prisma.size.createMany({
      data: [
        { shopId: f.shop.id, code: 'SIZE_Z', name: 'Zulu', sortOrder: 10 },
        { shopId: f.shop.id, code: 'SIZE_B', name: 'Beta', sortOrder: 5 },
        { shopId: f.shop.id, code: 'SIZE_A', name: 'Alpha', sortOrder: 5 },
      ],
    });
    const lookups = await catalog.listLookups(f.shop.id);
    expect(lookups.sizes.map(({ code }) => code)).toEqual(['SIZE_A', 'SIZE_B', 'SIZE_Z']);
  });

  it('allows assignment to active Color and Size and rejects inactive assignments', async () => {
    const f = await rentalScenario(prisma);
    const [activeSize, inactiveSize, activeColor, inactiveColor] = await Promise.all([
      prisma.size.create({ data: { shopId: f.shop.id, code: 'SIZE_ACTIVE', name: 'Active size' } }),
      prisma.size.create({
        data: { shopId: f.shop.id, code: 'SIZE_INACTIVE', name: 'Inactive size', isActive: false },
      }),
      prisma.color.create({
        data: { shopId: f.shop.id, code: 'COLOR_ACTIVE', name: 'Active color' },
      }),
      prisma.color.create({
        data: {
          shopId: f.shop.id,
          code: 'COLOR_INACTIVE',
          name: 'Inactive color',
          isActive: false,
        },
      }),
    ]);
    const variantInput = {
      variantCode: uniqueCode('VAR'),
      rentalRates: [{ durationDays: 1, price: 1000 }],
      inventoryCount: 0,
    };

    await expect(
      catalog.addVariant(f.shop.id, f.product.id, {
        ...variantInput,
        sizeId: activeSize.id,
        colorId: activeColor.id,
      }),
    ).resolves.toMatchObject({ sizeId: activeSize.id, colorId: activeColor.id });
    await expect(
      catalog.addVariant(f.shop.id, f.product.id, {
        ...variantInput,
        variantCode: uniqueCode('VAR'),
        sizeId: inactiveSize.id,
      }),
    ).rejects.toMatchObject({ code: CATALOG_ERROR_CODE.SIZE_INACTIVE });
    await expect(
      catalog.addVariant(f.shop.id, f.product.id, {
        ...variantInput,
        variantCode: uniqueCode('VAR'),
        colorId: inactiveColor.id,
      }),
    ).rejects.toMatchObject({ code: CATALOG_ERROR_CODE.COLOR_INACTIVE });
  });

  it('keeps unrelated rate updates available for a variant with inactive historical references', async () => {
    const f = await rentalScenario(prisma);
    const size = await prisma.size.create({
      data: { shopId: f.shop.id, code: 'HIST_SIZE', name: 'Historical size' },
    });
    const color = await prisma.color.create({
      data: { shopId: f.shop.id, code: 'HIST_COLOR', name: 'Historical color' },
    });
    await prisma.productVariant.update({
      where: { id: f.variant.id },
      data: { sizeId: size.id, colorId: color.id },
    });
    await prisma.size.update({ where: { id: size.id }, data: { isActive: false } });
    await prisma.color.update({ where: { id: color.id }, data: { isActive: false } });

    await expect(
      catalog.upsertRentalRate(f.shop.id, f.variant.id, { durationDays: 7, price: 7000 }),
    ).resolves.toMatchObject({ durationDays: 7 });
  });

  it('blocks Color and Size deletes for active and archived variants and preserves DB references', async () => {
    const f = await rentalScenario(prisma);
    const size = await prisma.size.create({
      data: { shopId: f.shop.id, code: 'USED_SIZE', name: 'Used size' },
    });
    const color = await prisma.color.create({
      data: { shopId: f.shop.id, code: 'USED_COLOR', name: 'Used color' },
    });
    await prisma.productVariant.update({
      where: { id: f.variant.id },
      data: { sizeId: size.id, colorId: color.id },
    });

    await expect(colors.deleteColor(f.principal, color.id)).rejects.toMatchObject({
      code: CATALOG_ERROR_CODE.COLOR_IN_USE,
    });
    await expect(sizes.deleteSize(f.principal, size.id)).rejects.toMatchObject({
      code: CATALOG_ERROR_CODE.SIZE_IN_USE,
    });
    await prisma.productVariant.update({
      where: { id: f.variant.id },
      data: { archivedAt: new Date() },
    });
    await expect(colors.deleteColor(f.principal, color.id)).rejects.toBeInstanceOf(
      CatalogColorError,
    );
    await expect(sizes.deleteSize(f.principal, size.id)).rejects.toBeInstanceOf(CatalogSizeError);

    await expect(prisma.color.delete({ where: { id: color.id } })).rejects.toMatchObject({
      code: 'P2003',
    });
    await expect(prisma.size.delete({ where: { id: size.id } })).rejects.toMatchObject({
      code: 'P2003',
    });
    const stillReferenced = await prisma.productVariant.findUniqueOrThrow({
      where: { id: f.variant.id },
      select: { sizeId: true, colorId: true },
    });
    expect(stillReferenced).toEqual({ sizeId: size.id, colorId: color.id });
  });

  it('hard deletes unused Color and Size records', async () => {
    const f = await rentalScenario(prisma);
    const color = await prisma.color.create({
      data: { shopId: f.shop.id, code: 'FREE_COLOR', name: 'Free color' },
    });
    const size = await prisma.size.create({
      data: { shopId: f.shop.id, code: 'FREE_SIZE', name: 'Free size' },
    });

    await expect(colors.deleteColor(f.principal, color.id)).resolves.toEqual({ deleted: true });
    await expect(sizes.deleteSize(f.principal, size.id)).resolves.toEqual({ deleted: true });
    await expect(prisma.color.findUnique({ where: { id: color.id } })).resolves.toBeNull();
    await expect(prisma.size.findUnique({ where: { id: size.id } })).resolves.toBeNull();
  });
});
