import { mkdtempSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as XLSX from 'xlsx';
import { Test } from '@nestjs/testing';
import { ConfiguredPublicMediaUrlResolver } from '../../src/common/storage/public-url.resolver';
import { LegacyCatalogImportModule } from '../../src/cli/legacy-catalog/legacy-catalog-import.module';
import { LegacyCatalogImportService } from '../../src/cli/legacy-catalog/legacy-catalog-import.service';
import { PrismaCatalogRepository } from '../../src/modules/catalog/infrastructure/prisma-catalog.repository';
import { PrismaService } from '../../src/database/prisma/prisma.service';
import {
  connectTestDatabase,
  resetTestDatabase,
  disconnectTestDatabase,
} from '../helpers/test-database';
import { createTestShop, createTestProductWithVariant } from '../fixtures/test-factories';

describe('Storage persistence and CLI isolation', () => {
  let prisma: PrismaService;
  beforeAll(async () => {
    prisma = await connectTestDatabase();
  });
  beforeEach(async () => {
    await resetTestDatabase(prisma);
  });
  afterAll(disconnectTestDatabase);

  it('changes catalog URLs through configuration without rewriting stored media', async () => {
    const shop = await createTestShop(prisma);
    const { product } = await createTestProductWithVariant(prisma, shop.id);
    const media = await prisma.productMedia.create({
      data: {
        shopId: shop.id,
        productId: product.id,
        storageKey: 'shops/test/image.jpg',
        url: 'https://legacy.example.com/source.jpg',
        isPrimary: true,
      },
    });
    for (const base of ['https://first.example.com', 'https://second.example.com']) {
      const repo = new PrismaCatalogRepository(prisma, new ConfiguredPublicMediaUrlResolver(base));
      expect((await repo.findProduct(shop.id, product.id))?.media[0]?.url).toBe(
        `${base}/${media.storageKey}`,
      );
      expect(
        (await repo.listProducts({ shopId: shop.id, page: 1, limit: 20 })).items[0]?.imageUrl,
      ).toBe(`${base}/${media.storageKey}`);
    }
    expect(await prisma.productMedia.findUnique({ where: { id: media.id } })).toEqual(media);
  });

  it('bootstraps the standalone CLI module and dry-runs a synthetic workbook without writes', async () => {
    const shop = await createTestShop(prisma);
    const directory = mkdtempSync(join(tmpdir(), 'kitty-cli-test-'));
    const file = join(directory, 'synthetic.xlsx');
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        [
          'Mã sản phẩm',
          'Tên sản phẩm',
          'Nhóm sản phẩm',
          'Số lượng tổng',
          'Giá thuê mặc định',
          'Tiền cọc mặc định',
          'Trạng thái hoạt động',
        ],
        ['TEST001', 'Synthetic dress', 'Test category', 1, 50000, 0, 'Có'],
      ]),
      'Sản phẩm',
    );
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        ['Nhóm sản phẩm', 'Size'],
        ['Test category', 'M'],
      ]),
      'Danh mục',
    );
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        ['Khóa', 'Giá trị'],
        ['Tiền tệ', 'VND'],
      ]),
      'Cài đặt',
    );
    XLSX.writeFile(workbook, file);
    const app = await Test.createTestingModule({ imports: [LegacyCatalogImportModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();
    try {
      await app.init();
      const report = await app
        .get(LegacyCatalogImportService)
        .execute({ filePath: file, shopCode: shop.code, dryRun: true, apply: true });
      expect(report.mode).toBe('DRY_RUN');
      expect(report.success).toBe(true);
      expect(report.reconciliation.totalProductRows).toBe(1);
      expect(await prisma.product.count()).toBe(0);
      expect(await prisma.category.count()).toBe(0);
      expect(await prisma.productMedia.count()).toBe(0);
    } finally {
      await app.close();
      unlinkSync(file);
      rmdirSync(directory);
    }
  });
});
