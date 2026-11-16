import type { PrismaService } from '../../src/database/prisma/prisma.service';
import { PrismaCartRepository } from '../../src/modules/cart/infrastructure/prisma-cart.repository';
import {
  connectTestDatabase,
  disconnectTestDatabase,
  resetTestDatabase,
} from '../helpers/test-database';
import { createTestShop } from '../fixtures/test-factories';

const account = {
  email: 'cart@example.test',
  emailVerifiedAt: new Date(),
  passwordHash: '$2b$12$C6UzMDM.H6dfI/f/IKcEe.5bH5XmGYWlkJKMYRnHX4CILJQUPB6eW',
};
const draft = {
  pickupDate: '2026-10-01T08:30:00+07:00',
  returnDate: '2026-10-03T08:30:00+07:00',
  items: [
    {
      productId: '00000000-0000-4000-8000-000000000001',
      variantId: '00000000-0000-4000-8000-000000000002',
      quantity: 1,
    },
  ],
};

describe('PrismaCartRepository', () => {
  let prisma: PrismaService;

  beforeAll(async () => {
    prisma = await connectTestDatabase();
  });

  beforeEach(async () => {
    await resetTestDatabase(prisma);
  });

  afterAll(disconnectTestDatabase);

  it('persists one account/shop draft and rejects a stale optimistic version instead of overwriting it', async () => {
    const shop = await createTestShop(prisma);
    const webAccount = await prisma.webAccount.create({ data: account });
    const repository = new PrismaCartRepository(prisma);

    const first = await repository.replace(webAccount.id, shop.id, 0, draft);
    expect(first).toEqual({
      kind: 'updated',
      cart: {
        ...draft,
        pickupDate: new Date(draft.pickupDate).toISOString(),
        returnDate: new Date(draft.returnDate).toISOString(),
        version: 1,
      },
    });

    const secondDraft = { ...draft, items: [{ ...draft.items[0]!, quantity: 2 }] };
    const second = await repository.replace(webAccount.id, shop.id, 1, secondDraft);
    expect(second).toEqual({
      kind: 'updated',
      cart: {
        ...secondDraft,
        pickupDate: new Date(secondDraft.pickupDate).toISOString(),
        returnDate: new Date(secondDraft.returnDate).toISOString(),
        version: 2,
      },
    });

    await expect(repository.replace(webAccount.id, shop.id, 1, draft)).resolves.toEqual({
      kind: 'conflict',
      cart: {
        ...secondDraft,
        pickupDate: new Date(secondDraft.pickupDate).toISOString(),
        returnDate: new Date(secondDraft.returnDate).toISOString(),
        version: 2,
      },
    });
    expect(await repository.find(webAccount.id, shop.id)).toEqual({
      ...secondDraft,
      pickupDate: new Date(secondDraft.pickupDate).toISOString(),
      returnDate: new Date(secondDraft.returnDate).toISOString(),
      version: 2,
    });
  });
});
