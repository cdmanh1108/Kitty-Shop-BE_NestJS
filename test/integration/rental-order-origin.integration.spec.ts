import type { PrismaService } from '../../src/database/prisma/prisma.service';
import { PrismaRentalRepository } from '../../src/modules/rentals/infrastructure/prisma-rental.repository';
import { fixedClock, rentalScenario } from '../fixtures/rental.fixture';
import { rentalPolicies } from '../fixtures/rental-policy.fixture';
import {
  connectTestDatabase,
  disconnectTestDatabase,
  resetTestDatabase,
} from '../helpers/test-database';

describe('Rental order source and storefront ownership integration', () => {
  let prisma: PrismaService;
  let rentals: PrismaRentalRepository;

  beforeAll(async () => {
    prisma = await connectTestDatabase();
    rentals = new PrismaRentalRepository(prisma, fixedClock, rentalPolicies);
  });

  beforeEach(async () => {
    await resetTestDatabase(prisma);
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  it('persists an ONLINE guest order without a WebAccount owner', async () => {
    const fixture = await rentalScenario(prisma);
    const order = await rentals.createOrder({ ...fixture.data, source: 'ONLINE' });
    if (!order) throw new Error('Expected persisted rental order');

    const persisted = await prisma.rentalOrder.findUniqueOrThrow({ where: { id: order.id } });
    expect(persisted).toMatchObject({ source: 'ONLINE', webAccountId: null });
  });

  it('keeps a rental order after its optional WebAccount owner is deleted', async () => {
    const fixture = await rentalScenario(prisma);
    const order = await rentals.createOrder({ ...fixture.data, source: 'OFFLINE' });
    if (!order) throw new Error('Expected persisted rental order');
    const account = await prisma.webAccount.create({
      data: { phone: '+84912345678', passwordHash: 'test-password-hash' },
    });

    const owned = await prisma.rentalOrder.update({
      where: { id: order.id },
      data: { webAccountId: account.id },
      include: { webAccount: true },
    });
    expect(owned.webAccount?.id).toBe(account.id);

    await prisma.webAccount.delete({ where: { id: account.id } });

    await expect(
      prisma.rentalOrder.findUniqueOrThrow({ where: { id: order.id } }),
    ).resolves.toMatchObject({
      source: 'OFFLINE',
      webAccountId: null,
    });
  });
});
