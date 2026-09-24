import type { PrismaService } from '../../src/database/prisma/prisma.service';
import { PrismaFavoriteRepository } from '../../src/modules/favorites/infrastructure/prisma-favorite.repository';
import {
  connectTestDatabase,
  disconnectTestDatabase,
  resetTestDatabase,
} from '../helpers/test-database';
import { createTestProductWithVariant, createTestShop } from '../fixtures/test-factories';

describe('PrismaFavoriteRepository', () => {
  let prisma: PrismaService;

  beforeAll(async () => {
    prisma = await connectTestDatabase();
  });

  beforeEach(async () => resetTestDatabase(prisma));
  afterAll(disconnectTestDatabase);

  it('enforces one favorite per account/product under concurrent adds and preserves account isolation', async () => {
    const shop = await createTestShop(prisma);
    const { product } = await createTestProductWithVariant(prisma, shop.id);
    const first = await prisma.webAccount.create({
      data: { phone: '+84912345678', passwordHash: 'not-used' },
    });
    const second = await prisma.webAccount.create({
      data: { phone: '+84912345679', passwordHash: 'not-used' },
    });
    const repository = new PrismaFavoriteRepository(prisma);

    await Promise.all(Array.from({ length: 10 }, () => repository.add(first.id, product.id)));
    await repository.add(second.id, product.id);

    expect(
      await prisma.favorite.count({ where: { accountId: first.id, productId: product.id } }),
    ).toBe(1);
    expect(await repository.listProductIds(first.id, shop.id, 1, 20)).toEqual({
      productIds: [product.id],
      total: 1,
    });
    expect(await repository.listProductIds(second.id, shop.id, 1, 20)).toEqual({
      productIds: [product.id],
      total: 1,
    });

    await repository.remove(second.id, product.id);
    expect(await repository.listProductIds(first.id, shop.id, 1, 20)).toEqual({
      productIds: [product.id],
      total: 1,
    });
    expect(await repository.listProductIds(second.id, shop.id, 1, 20)).toEqual({
      productIds: [],
      total: 0,
    });
  });

  it('paginates and counts only currently storefront-eligible favorites', async () => {
    const shop = await createTestShop(prisma);
    const { product: visible } = await createTestProductWithVariant(prisma, shop.id);
    const { product: hidden } = await createTestProductWithVariant(prisma, shop.id);
    const account = await prisma.webAccount.create({
      data: { phone: '+84912345678', passwordHash: 'not-used' },
    });
    const repository = new PrismaFavoriteRepository(prisma);

    await repository.add(account.id, visible.id);
    await repository.add(account.id, hidden.id);
    await prisma.product.update({ data: { archivedAt: new Date() }, where: { id: hidden.id } });

    await expect(repository.listProductIds(account.id, shop.id, 1, 1)).resolves.toEqual({
      productIds: [visible.id],
      total: 1,
    });
    await expect(repository.status(account.id, shop.id, [visible.id, hidden.id])).resolves.toEqual({
      productIds: [visible.id],
      total: 1,
    });
  });
});
