import type { AuditPort } from '../../src/modules/audit/domain/audit.port';
import { SizeService } from '../../src/modules/catalog/application/size.service';
import { CATALOG_ERROR_CODE } from '../../src/modules/catalog/domain/catalog-errors';
import { ConfiguredPublicMediaUrlResolver } from '../../src/common/storage/public-url.resolver';
import type { PrismaService } from '../../src/database/prisma/prisma.service';
import { PrismaCatalogRepository } from '../../src/modules/catalog/infrastructure/prisma-catalog.repository';
import {
  connectTestDatabase,
  disconnectTestDatabase,
  resetTestDatabase,
} from '../helpers/test-database';
import { rentalScenario } from '../fixtures/rental.fixture';
import { createTestShop, uniqueCode } from '../fixtures/test-factories';

describe('Admin Size management persistence', () => {
  let prisma: PrismaService;
  let catalog: PrismaCatalogRepository;
  let sizes: SizeService;
  const log = jest.fn().mockResolvedValue(undefined);
  const audit: AuditPort = { log };

  beforeAll(async () => {
    prisma = await connectTestDatabase();
    catalog = new PrismaCatalogRepository(
      prisma,
      new ConfiguredPublicMediaUrlResolver('https://assets.test.example'),
    );
    sizes = new SizeService(catalog, audit);
  });

  beforeEach(async () => {
    await resetTestDatabase(prisma);
    jest.clearAllMocks();
  });

  afterAll(disconnectTestDatabase);

  async function makeSize(
    shopId: string,
    input: { code?: string; name: string; sortOrder?: number; isActive?: boolean },
  ) {
    return prisma.size.create({
      data: {
        shopId,
        code: input.code ?? uniqueCode('SIZE'),
        name: input.name,
        sortOrder: input.sortOrder ?? 0,
        isActive: input.isActive ?? true,
      },
    });
  }

  it('creates a normalized active Size with default sortOrder and a business audit snapshot', async () => {
    const f = await rentalScenario(prisma);

    const created = await sizes.createSize(f.principal, {
      code: ' xl ',
      name: ' Extra large ',
    });

    expect(created).toMatchObject({
      code: 'XL',
      name: 'Extra large',
      sortOrder: 0,
      isActive: true,
    });
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CREATE',
        entityType: 'size',
        entityId: created.id,
        newValues: {
          id: created.id,
          code: 'XL',
          name: 'Extra large',
          sortOrder: 0,
          isActive: true,
        },
      }),
    );
  });

  it('lists active and inactive sizes with search, status, pagination, ordering, and shop scope', async () => {
    const f = await rentalScenario(prisma);
    const otherShop = await createTestShop(prisma);
    const xs = await makeSize(f.shop.id, { code: 'XS', name: 'Extra small', sortOrder: 10 });
    const s = await makeSize(f.shop.id, { code: 'S', name: 'Small', sortOrder: 20 });
    const m = await makeSize(f.shop.id, { code: 'M', name: 'Medium', sortOrder: 30 });
    await makeSize(f.shop.id, {
      code: 'XL',
      name: 'Extra large',
      sortOrder: 50,
      isActive: false,
    });
    await makeSize(otherShop.id, { code: 'OTHER', name: 'Other shop', sortOrder: 1 });

    const all = await sizes.listSizes(f.principal, { page: 1, limit: 2 });
    expect(all.items.map(({ id }) => id)).toEqual([xs.id, s.id]);
    expect(all.meta).toEqual({ page: 1, limit: 2, total: 4, totalPages: 2 });
    expect(all.items[0]).not.toHaveProperty('shopId');

    const inactive = await sizes.listSizes(f.principal, {
      page: 1,
      limit: 10,
      q: '  xL ',
      status: 'INACTIVE',
    });
    expect(inactive.items.map(({ code }) => code)).toEqual(['XL']);
    expect(inactive.meta.total).toBe(1);
    const nameSearch = await sizes.listSizes(f.principal, {
      page: 1,
      limit: 10,
      q: '  medium  ',
      status: 'ACTIVE',
    });
    expect(nameSearch.items.map(({ id }) => id)).toEqual([m.id]);

    const active = await sizes.listSizes(f.principal, {
      page: 1,
      limit: 10,
      status: 'ACTIVE',
    });
    expect(active.items.map(({ code }) => code)).toEqual(['XS', 'S', 'M']);
  });

  it('returns inactive details and treats missing or cross-shop Size IDs as not found', async () => {
    const f = await rentalScenario(prisma);
    const otherShop = await createTestShop(prisma);
    const size = await makeSize(f.shop.id, {
      code: 'XL',
      name: 'Inactive XL',
      isActive: false,
    });
    const otherPrincipal = { ...f.principal, shopId: otherShop.id };

    await expect(sizes.getSize(f.principal, size.id)).resolves.toMatchObject({
      id: size.id,
      isActive: false,
    });
    await expect(sizes.getSize(f.principal, 'missing')).rejects.toMatchObject({
      code: CATALOG_ERROR_CODE.SIZE_NOT_FOUND,
    });
    await expect(
      sizes.updateSize(f.principal, 'missing', { name: 'Changed' }),
    ).rejects.toMatchObject({
      code: CATALOG_ERROR_CODE.SIZE_NOT_FOUND,
    });
    await expect(sizes.updateSizeStatus(f.principal, 'missing', false)).rejects.toMatchObject({
      code: CATALOG_ERROR_CODE.SIZE_NOT_FOUND,
    });
    await expect(sizes.deleteSize(f.principal, 'missing')).rejects.toMatchObject({
      code: CATALOG_ERROR_CODE.SIZE_NOT_FOUND,
    });
    await expect(sizes.getSize(otherPrincipal, size.id)).rejects.toMatchObject({
      code: CATALOG_ERROR_CODE.SIZE_NOT_FOUND,
    });
    await expect(
      sizes.updateSize(otherPrincipal, size.id, { name: 'Changed' }),
    ).rejects.toMatchObject({
      code: CATALOG_ERROR_CODE.SIZE_NOT_FOUND,
    });
    await expect(sizes.updateSizeStatus(otherPrincipal, size.id, true)).rejects.toMatchObject({
      code: CATALOG_ERROR_CODE.SIZE_NOT_FOUND,
    });
    await expect(sizes.deleteSize(otherPrincipal, size.id)).rejects.toMatchObject({
      code: CATALOG_ERROR_CODE.SIZE_NOT_FOUND,
    });
  });

  it('partially updates inactive Size and permits same sortOrder without renumbering other records', async () => {
    const f = await rentalScenario(prisma);
    const s = await makeSize(f.shop.id, { code: 'S', name: 'S', sortOrder: 20 });
    const m = await makeSize(f.shop.id, { code: 'M', name: 'M', sortOrder: 30 });
    const l = await makeSize(f.shop.id, {
      code: 'L',
      name: 'L',
      sortOrder: 40,
      isActive: false,
    });
    const beta = await makeSize(f.shop.id, { code: 'BETA', name: 'Beta', sortOrder: 50 });
    const alpha = await makeSize(f.shop.id, { code: 'ALPHA', name: 'Alpha', sortOrder: 50 });

    await expect(
      sizes.updateSize(f.principal, l.id, { code: ' l ', sortOrder: 25 }),
    ).resolves.toMatchObject({
      code: 'L',
      sortOrder: 25,
      isActive: false,
    });
    const orderedAt25 = await sizes.listSizes(f.principal, { page: 1, limit: 20 });
    expect(orderedAt25.items.map(({ id }) => id)).toEqual([s.id, l.id, m.id, alpha.id, beta.id]);
    const updated = await sizes.updateSize(f.principal, l.id, { name: '  Long  ' });
    expect(updated).toMatchObject({ code: 'L', name: 'Long', sortOrder: 25, isActive: false });
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'UPDATE',
        entityId: l.id,
        oldValues: {
          id: l.id,
          code: 'L',
          name: 'L',
          sortOrder: 25,
          isActive: false,
        },
        newValues: {
          id: l.id,
          code: 'L',
          name: 'Long',
          sortOrder: 25,
          isActive: false,
        },
      }),
    );

    await sizes.updateSize(f.principal, l.id, { sortOrder: 20 });
    const ordered = await sizes.listSizes(f.principal, { page: 1, limit: 20 });
    expect(ordered.items.map(({ id }) => id)).toEqual([l.id, s.id, m.id, alpha.id, beta.id]);
    expect(await prisma.size.findUniqueOrThrow({ where: { id: s.id } })).toMatchObject({
      sortOrder: 20,
    });
    expect(await prisma.size.findUniqueOrThrow({ where: { id: m.id } })).toMatchObject({
      sortOrder: 30,
    });
  });

  it('makes status changes idempotent, preserves variant history, and keeps lookup active-only', async () => {
    const f = await rentalScenario(prisma);
    const size = await makeSize(f.shop.id, { code: 'XL', name: 'XL' });
    await prisma.productVariant.update({ where: { id: f.variant.id }, data: { sizeId: size.id } });

    await sizes.updateSizeStatus(f.principal, size.id, false);
    await sizes.updateSizeStatus(f.principal, size.id, false);
    expect(log).toHaveBeenCalledTimes(1);
    expect((await catalog.listLookups(f.shop.id)).sizes.map(({ id }) => id)).not.toContain(size.id);
    await expect(
      prisma.productVariant.findUniqueOrThrow({
        where: { id: f.variant.id },
        include: { size: true },
      }),
    ).resolves.toMatchObject({ sizeId: size.id, size: { id: size.id, isActive: false } });

    await sizes.updateSizeStatus(f.principal, size.id, true);
    expect(log).toHaveBeenCalledTimes(2);
    expect((await catalog.listLookups(f.shop.id)).sizes.map(({ id }) => id)).toContain(size.id);
  });

  it('hard deletes unused Size and blocks active or archived variant references without false audit', async () => {
    const f = await rentalScenario(prisma);
    const free = await makeSize(f.shop.id, { name: 'Unused' });
    await expect(sizes.deleteSize(f.principal, free.id)).resolves.toEqual({ deleted: true });
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DELETE',
        entityId: free.id,
        oldValues: {
          id: free.id,
          code: free.code,
          name: free.name,
          sortOrder: free.sortOrder,
          isActive: free.isActive,
        },
      }),
    );

    const used = await makeSize(f.shop.id, { code: 'USED', name: 'Used' });
    await prisma.productVariant.update({ where: { id: f.variant.id }, data: { sizeId: used.id } });
    const auditCalls = log.mock.calls.length;
    await expect(sizes.deleteSize(f.principal, used.id)).rejects.toMatchObject({
      code: CATALOG_ERROR_CODE.SIZE_IN_USE,
    });
    expect(log).toHaveBeenCalledTimes(auditCalls);

    await prisma.productVariant.update({
      where: { id: f.variant.id },
      data: { archivedAt: new Date() },
    });
    await expect(sizes.deleteSize(f.principal, used.id)).rejects.toMatchObject({
      code: CATALOG_ERROR_CODE.SIZE_IN_USE,
    });
    await expect(prisma.size.delete({ where: { id: used.id } })).rejects.toMatchObject({
      code: 'P2003',
    });
  });
});
