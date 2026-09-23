import { ConfiguredPublicMediaUrlResolver } from '../../src/common/storage/public-url.resolver';
import type { PrismaService } from '../../src/database/prisma/prisma.service';
import { PrismaCatalogRepository } from '../../src/modules/catalog/infrastructure/prisma-catalog.repository';
import {
  connectTestDatabase,
  disconnectTestDatabase,
  resetTestDatabase,
} from '../helpers/test-database';
import { createTestProductWithVariant, createTestShop } from '../fixtures/test-factories';

describe('Storage persistence', () => {
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
      const repository = new PrismaCatalogRepository(
        prisma,
        new ConfiguredPublicMediaUrlResolver(base),
      );
      expect((await repository.findProduct(shop.id, product.id))?.media[0]?.url).toBe(
        `${base}/${media.storageKey}`,
      );
      expect(
        (await repository.listProducts({ shopId: shop.id, page: 1, limit: 20 })).items[0]?.imageUrl,
      ).toBe(`${base}/${media.storageKey}`);
    }

    expect(await prisma.productMedia.findUnique({ where: { id: media.id } })).toEqual(media);
  });
});
