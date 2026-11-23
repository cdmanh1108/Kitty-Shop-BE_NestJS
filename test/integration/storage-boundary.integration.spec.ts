import { rentalPolicies } from '../fixtures/rental-policy.fixture';
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

  it('commits a media upload intent with the row and rejects reuse after removal', async () => {
    const shop = await createTestShop(prisma);
    const { product } = await createTestProductWithVariant(prisma, shop.id);
    const repository = new PrismaCatalogRepository(
      prisma,
      new ConfiguredPublicMediaUrlResolver('https://assets.example.com'),
      rentalPolicies,
    );
    const now = new Date('2026-10-01T00:00:00Z');
    const intent = {
      scope: 'product-media.upload:' + product.id,
      key: 'media-retry',
      requestHash: 'same-image',
      expiresAt: new Date(now.getTime() + 60_000),
    };
    const claimed = await repository.claimProductMediaUpload(shop.id, product.id, intent, now);
    if (claimed.state !== 'CLAIMED') throw new Error('Expected the first claim');
    const input = { url: 'https://assets.example.com/image.jpg', isPrimary: true, sortOrder: 0 };
    const media = await repository.addProductMedia(shop.id, product.id, input, {
      scope: intent.scope,
      key: intent.key,
      claimId: claimed.claimId,
      completedAt: now,
    });
    if (!media) throw new Error('Expected saved media');
    await expect(
      repository.claimProductMediaUpload(shop.id, product.id, intent, now),
    ).resolves.toMatchObject({
      state: 'COMPLETED',
      media: { id: media.id },
    });
    await expect(
      repository.claimProductMediaUpload(
        shop.id,
        product.id,
        { ...intent, requestHash: 'different' },
        now,
      ),
    ).resolves.toEqual({
      state: 'HASH_MISMATCH',
    });
    await repository.removeProductMedia(shop.id, product.id, media.id);
    await expect(
      repository.claimProductMediaUpload(shop.id, product.id, intent, now),
    ).resolves.toEqual({
      state: 'COMPLETED',
      media: null,
    });
  });

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
        rentalPolicies,
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
