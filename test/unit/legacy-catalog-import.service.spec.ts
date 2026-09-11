import { LegacyCatalogImportService } from '../../src/modules/catalog/infrastructure/import/legacy-catalog-import.service';
import type { PrismaService } from '@database/prisma/prisma.service';
import type { AuditPort } from '@modules/audit/domain/audit.port';

interface MockPrismaService {
  shop: { findUnique: jest.Mock };
  category: { findMany: jest.Mock; upsert: jest.Mock };
  size: { findMany: jest.Mock; upsert: jest.Mock };
  color: { findMany: jest.Mock; upsert: jest.Mock };
  product: { findMany: jest.Mock; create: jest.Mock };
  productVariant: { create: jest.Mock };
  rentalRate: { create: jest.Mock };
  inventoryItem: { create: jest.Mock };
  productMedia: { create: jest.Mock };
  $transaction: jest.Mock;
}

describe('LegacyCatalogImportService Unit Tests', () => {
  let service: LegacyCatalogImportService;
  let mockPrisma: MockPrismaService;
  let auditLogMock: jest.Mock;
  let mockAudit: AuditPort;

  beforeEach(() => {
    mockPrisma = {
      shop: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'shop-uuid-1',
          code: 'MAIN',
          name: 'Main Shop',
        }),
      },
      category: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'cat-vay', code: 'VAY', name: 'Váy' },
          { id: 'cat-dam-ngan', code: 'DAM_NGAN', name: 'Đầm ngắn' },
        ]),
        upsert: jest.fn().mockImplementation((args: { create: { code: string; name: string } }) =>
          Promise.resolve({ id: `cat-${args.create.code}`, ...args.create }),
        ),
      },
      size: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'size-m', code: 'M', name: 'M', sortOrder: 10 },
          { id: 'size-s', code: 'S', name: 'S', sortOrder: 20 },
        ]),
        upsert: jest.fn().mockImplementation((args: { create: { code: string; name: string } }) =>
          Promise.resolve({ id: `size-${args.create.code}`, ...args.create }),
        ),
      },
      color: {
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn().mockImplementation((args: { create: { code: string; name: string } }) =>
          Promise.resolve({ id: `color-${args.create.code}`, ...args.create }),
        ),
      },
      product: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation((args: { data: { code: string; name: string } }) =>
          Promise.resolve({ id: `prod-${args.data.code}`, ...args.data }),
        ),
      },
      productVariant: {
        create: jest.fn().mockImplementation((args: { data: { variantCode: string } }) =>
          Promise.resolve({ id: `var-${args.data.variantCode}`, ...args.data }),
        ),
      },
      rentalRate: {
        create: jest.fn().mockResolvedValue({ id: 'rate-1' }),
      },
      inventoryItem: {
        create: jest.fn().mockResolvedValue({ id: 'item-1' }),
      },
      productMedia: {
        create: jest.fn().mockResolvedValue({ id: 'media-1' }),
      },
      $transaction: jest
        .fn()
        .mockImplementation((callback: (tx: unknown) => Promise<unknown>) => callback(mockPrisma)),
    };

    auditLogMock = jest.fn().mockResolvedValue(undefined);
    mockAudit = {
      log: auditLogMock,
    };

    service = new LegacyCatalogImportService(
      mockPrisma as unknown as PrismaService,
      mockAudit,
    );
  });

  it('fails cleanly when shop code is not found', async () => {
    mockPrisma.shop.findUnique.mockResolvedValue(null);

    await expect(
      service.execute({
        filePath: './private-data/legacy/Quản lý lịch thuê KITTY.xlsx',
        shopCode: 'NON_EXISTENT_SHOP',
        dryRun: true,
      }),
    ).rejects.toThrow('Shop with code "NON_EXISTENT_SHOP" was not found in the database');
  });

  it('performs dry-run with zero database mutations', async () => {
    const report = await service.execute({
      filePath: './private-data/legacy/Quản lý lịch thuê KITTY.xlsx',
      shopCode: 'MAIN',
      dryRun: true,
    });

    expect(report.mode).toBe('DRY_RUN');
    expect(report.success).toBe(true);
    expect(report.reconciliation.totalProductRows).toBe(116);
    expect(report.reconciliation.uniqueProductCodes).toBe(116);
    expect(report.reconciliation.legacyQuantitySum).toBe(117);

    // Assert zero database write calls occurred in dry-run
    expect(mockPrisma.product.create).not.toHaveBeenCalled();
    expect(mockPrisma.productVariant.create).not.toHaveBeenCalled();
    expect(mockPrisma.inventoryItem.create).not.toHaveBeenCalled();
    expect(auditLogMock).not.toHaveBeenCalled();
  });

  it('detects existing unchanged products on re-run (idempotency)', async () => {
    // Simulate DB having SP001 already imported
    mockPrisma.product.findMany.mockResolvedValue([
      {
        id: 'prod-SP001',
        shopId: 'shop-uuid-1',
        code: 'SP001',
        name: 'Bikini sọc đỏ',
        variants: [
          {
            id: 'var-SP001-M-DO',
            variantCode: 'SP001-M-DO',
            inventoryItems: [{ id: 'item-1', sku: 'SP001-M-DO-001' }],
            rentalRates: [{ id: 'rate-1', durationDays: 1 }],
          },
        ],
        media: [{ id: 'media-1', isPrimary: true }],
      },
    ]);

    const report = await service.execute({
      filePath: './private-data/legacy/Quản lý lịch thuê KITTY.xlsx',
      shopCode: 'MAIN',
      dryRun: true,
    });

    expect(report.mutations.productsUnchanged).toBeGreaterThanOrEqual(1);
    expect(report.mutations.variantsUnchanged).toBeGreaterThanOrEqual(1);
    expect(report.mutations.inventoryItemsUnchanged).toBeGreaterThanOrEqual(1);
  });

  it('detects divergent product in DB and flags EXISTING_PRODUCT_CONFLICT without silent overwrite', async () => {
    // Simulate DB having SP001 with a manually edited different name
    mockPrisma.product.findMany.mockResolvedValue([
      {
        id: 'prod-SP001',
        shopId: 'shop-uuid-1',
        code: 'SP001',
        name: 'Tên đã bị người dùng sửa khác Excel',
        variants: [],
        media: [],
      },
    ]);

    const report = await service.execute({
      filePath: './private-data/legacy/Quản lý lịch thuê KITTY.xlsx',
      shopCode: 'MAIN',
      dryRun: true,
    });

    expect(report.mutations.productsConflicted).toBe(1);
    expect(
      report.issues.some((i) => i.code === 'EXISTING_PRODUCT_CONFLICT' && i.productCode === 'SP001'),
    ).toBe(true);
  });
});
