import type { PrismaService } from '../../src/database/prisma/prisma.service';
import { lookupStorefrontOrder } from '../../src/modules/rentals/infrastructure/rental-web-order.queries';

describe('lookupStorefrontOrder', () => {
  it('limits public guest lookup to storefront-created ONLINE orders', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const prisma = { rentalOrder: { findFirst } } as unknown as PrismaService;

    await lookupStorefrontOrder(prisma, 'shop-a', ' RT260929-001 ');

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          shopId: 'shop-a',
          orderNumber: 'RT260929-001',
          source: 'ONLINE',
        },
      }),
    );
  });
});
