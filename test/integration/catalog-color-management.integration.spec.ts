import type { AuditPort } from '../../src/modules/audit/domain/audit.port';
import { ColorService } from '../../src/modules/catalog/application/color.service';
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

describe('Admin Color management persistence', () => {
  let prisma: PrismaService;
  let catalog: PrismaCatalogRepository;
  let colors: ColorService;
  const log = jest.fn().mockResolvedValue(undefined);
  const audit: AuditPort = { log };

  beforeAll(async () => {
    prisma = await connectTestDatabase();
    catalog = new PrismaCatalogRepository(
      prisma,
      new ConfiguredPublicMediaUrlResolver('https://assets.test.example'),
    );
    colors = new ColorService(catalog, audit);
  });

  beforeEach(async () => {
    await resetTestDatabase(prisma);
    jest.clearAllMocks();
  });

  afterAll(disconnectTestDatabase);

  async function makeColor(
    shopId: string,
    input: { code?: string; name: string; hexColor?: string | null; isActive?: boolean },
  ) {
    return prisma.color.create({
      data: {
        shopId,
        code: input.code ?? uniqueCode('COLOR'),
        name: input.name,
        hexColor: input.hexColor ?? null,
        isActive: input.isActive ?? true,
      },
    });
  }

  it('lists all statuses by default with search, pagination, stable order, and shop scope', async () => {
    const f = await rentalScenario(prisma);
    const otherShop = await createTestShop(prisma);
    const zulu = await makeColor(f.shop.id, { code: 'BLUE_Z', name: 'Zulu blue' });
    const alpha = await makeColor(f.shop.id, {
      code: 'BLUE_A',
      name: 'Alpha blue',
      isActive: false,
    });
    const red = await makeColor(f.shop.id, { code: 'RED', name: 'Red' });
    await makeColor(otherShop.id, { code: 'OTHER_BLUE', name: 'Alpha blue' });

    const all = await colors.listColors(f.principal, { page: 1, limit: 2 });
    expect(all.items.map(({ id }) => id)).toEqual([alpha.id, red.id]);
    expect(all.meta).toEqual({ page: 1, limit: 2, total: 3, totalPages: 2 });
    expect(all.items[0]).not.toHaveProperty('shopId');

    const searched = await colors.listColors(f.principal, {
      page: 1,
      limit: 10,
      q: '  blue_a  ',
      status: 'INACTIVE',
    });
    expect(searched.items.map(({ id }) => id)).toEqual([alpha.id]);
    expect(searched.meta).toMatchObject({ total: 1, totalPages: 1 });
    const nameSearch = await colors.listColors(f.principal, {
      page: 1,
      limit: 10,
      q: '  bLuE  ',
      status: 'INACTIVE',
    });
    expect(nameSearch.items.map(({ id }) => id)).toEqual([alpha.id]);

    const activeOnly = await colors.listColors(f.principal, {
      page: 1,
      limit: 10,
      status: 'ACTIVE',
    });
    expect(activeOnly.items.map(({ id }) => id)).toEqual([red.id, zulu.id]);
  });

  it('returns inactive detail and treats missing or cross-shop records as not found', async () => {
    const f = await rentalScenario(prisma);
    const otherShop = await createTestShop(prisma);
    const color = await makeColor(f.shop.id, { name: 'Inactive', isActive: false });

    await expect(colors.getColor(f.principal, color.id)).resolves.toMatchObject({
      id: color.id,
      isActive: false,
    });
    await expect(colors.getColor(f.principal, 'missing')).rejects.toMatchObject({
      code: CATALOG_ERROR_CODE.COLOR_NOT_FOUND,
    });
    const otherPrincipal = { ...f.principal, shopId: otherShop.id };
    await expect(colors.getColor(otherPrincipal, color.id)).rejects.toMatchObject({
      code: CATALOG_ERROR_CODE.COLOR_NOT_FOUND,
    });
    await expect(
      colors.updateColor(otherPrincipal, color.id, { name: 'Changed' }),
    ).rejects.toMatchObject({
      code: CATALOG_ERROR_CODE.COLOR_NOT_FOUND,
    });
    await expect(colors.updateColorStatus(otherPrincipal, color.id, true)).rejects.toMatchObject({
      code: CATALOG_ERROR_CODE.COLOR_NOT_FOUND,
    });
    await expect(colors.deleteColor(otherPrincipal, color.id)).rejects.toMatchObject({
      code: CATALOG_ERROR_CODE.COLOR_NOT_FOUND,
    });
  });

  it('applies partial updates, allows inactive records, clears hexColor, and audits business snapshots', async () => {
    const f = await rentalScenario(prisma);
    const color = await makeColor(f.shop.id, {
      code: 'OLD_CODE',
      name: 'Old name',
      hexColor: '#AABBCC',
      isActive: false,
    });
    const duplicate = await makeColor(f.shop.id, { code: 'TAKEN', name: 'Taken' });

    const updated = await colors.updateColor(f.principal, color.id, { name: '  New name  ' });
    expect(updated).toMatchObject({
      code: 'OLD_CODE',
      name: 'New name',
      hexColor: '#AABBCC',
      isActive: false,
    });
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'UPDATE',
        entityType: 'color',
        entityId: color.id,
        oldValues: {
          id: color.id,
          code: 'OLD_CODE',
          name: 'Old name',
          hexColor: '#AABBCC',
          isActive: false,
        },
        newValues: {
          id: color.id,
          code: 'OLD_CODE',
          name: 'New name',
          hexColor: '#AABBCC',
          isActive: false,
        },
      }),
    );

    await expect(
      colors.updateColor(f.principal, color.id, { code: duplicate.code }),
    ).rejects.toMatchObject({ code: CATALOG_ERROR_CODE.COLOR_CODE_ALREADY_EXISTS });
    await expect(
      colors.updateColor(f.principal, color.id, { hexColor: null }),
    ).resolves.toMatchObject({ hexColor: null });
    const beforeNoop = log.mock.calls.length;
    await expect(colors.updateColor(f.principal, color.id, {})).resolves.toMatchObject({
      id: color.id,
    });
    expect(log).toHaveBeenCalledTimes(beforeNoop);
  });

  it('makes status changes idempotent while preserving variant history and active-only lookup', async () => {
    const f = await rentalScenario(prisma);
    const color = await makeColor(f.shop.id, { name: 'Variant color' });
    await prisma.productVariant.update({
      where: { id: f.variant.id },
      data: { colorId: color.id },
    });

    await colors.updateColorStatus(f.principal, color.id, false);
    await colors.updateColorStatus(f.principal, color.id, false);
    expect(log).toHaveBeenCalledTimes(1);
    expect((await catalog.listLookups(f.shop.id)).colors).toEqual([]);
    await expect(
      prisma.productVariant.findUniqueOrThrow({ where: { id: f.variant.id } }),
    ).resolves.toMatchObject({ colorId: color.id });

    await colors.updateColorStatus(f.principal, color.id, true);
    expect(log).toHaveBeenCalledTimes(2);
    expect((await catalog.listLookups(f.shop.id)).colors.map(({ id }) => id)).toContain(color.id);
  });

  it('hard deletes unused colors, blocks active and archived references, and audits only success', async () => {
    const f = await rentalScenario(prisma);
    const free = await makeColor(f.shop.id, { name: 'Unused' });
    await expect(colors.deleteColor(f.principal, free.id)).resolves.toEqual({ deleted: true });
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DELETE',
        entityId: free.id,
        oldValues: {
          id: free.id,
          code: free.code,
          name: free.name,
          hexColor: free.hexColor,
          isActive: free.isActive,
        },
      }),
    );

    const used = await makeColor(f.shop.id, { name: 'Used' });
    await prisma.productVariant.update({ where: { id: f.variant.id }, data: { colorId: used.id } });
    const auditCalls = log.mock.calls.length;
    await expect(colors.deleteColor(f.principal, used.id)).rejects.toMatchObject({
      code: CATALOG_ERROR_CODE.COLOR_IN_USE,
    });
    expect(log).toHaveBeenCalledTimes(auditCalls);

    await prisma.productVariant.update({
      where: { id: f.variant.id },
      data: { archivedAt: new Date() },
    });
    await expect(colors.deleteColor(f.principal, used.id)).rejects.toMatchObject({
      code: CATALOG_ERROR_CODE.COLOR_IN_USE,
    });
    await expect(prisma.color.delete({ where: { id: used.id } })).rejects.toMatchObject({
      code: 'P2003',
    });
  });
});
