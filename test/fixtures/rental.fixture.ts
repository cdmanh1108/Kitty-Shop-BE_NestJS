import type { PrismaService } from '../../src/database/prisma/prisma.service';
import type { Clock } from '../../src/common/clock/clock';
import type { CurrentUser } from '../../src/common/types/current-user';
import type { CreateRentalOrderData } from '../../src/modules/rentals/domain/rental.repository';
import type { CreateRentalOrderInput } from '../../src/modules/rentals/application/rental.contracts';
import {
  createTestShop,
  createTestCustomer,
  createTestUserAndMember,
  createTestProductWithVariant,
  uniqueCode,
} from './test-factories';

export const fixedClock: Clock = { now: () => new Date('2026-10-01T12:00:00.000Z') };

export async function rentalScenario(prisma: PrismaService) {
  const shop = await createTestShop(prisma);
  const customer = await createTestCustomer(prisma, shop.id);
  const { user, member } = await createTestUserAndMember(prisma, shop.id);
  const { product, variant, inventoryItems } = await createTestProductWithVariant(prisma, shop.id);
  const inventory = inventoryItems[0];
  if (!inventory) throw new Error('Rental fixture requires inventory');
  const principal: CurrentUser = {
    userId: user.id,
    memberId: member.id,
    shopId: shop.id,
    email: user.email,
    fullName: user.fullName,
    permissions: ['rentals.create', 'rentals.update'],
  };
  const input: CreateRentalOrderInput = {
    customerId: customer.id,
    rentalStartAt: '2026-10-10T00:00:00.000Z',
    rentalEndAt: '2026-10-12T00:00:00.000Z',
    discountTotal: 0,
    items: [{ variantId: variant.id, quantity: 1 }],
    charges: [],
  };
  const data: CreateRentalOrderData = {
    orderNumber: uniqueCode('RT'),
    shopId: shop.id,
    customerId: customer.id,
    rentalStartAt: new Date(input.rentalStartAt),
    rentalEndAt: new Date(input.rentalEndAt),
    discountTotal: 0,
    createdBy: member.id,
    charges: [],
    lines: [
      {
        productId: product.id,
        variantId: variant.id,
        productName: product.name,
        variantName: variant.variantCode,
        quantity: 1,
        unitRentalPrice: 200000,
        depositAmount: 200000,
        lineTotal: 200000,
        pricingSnapshot: { durationDays: 2, unitRentalPrice: 200000, depositPerItem: 200000 },
        inventory: [{ id: inventory.id, sku: inventory.sku }],
      },
    ],
  };
  return { shop, customer, member, user, variant, product, inventory, principal, input, data };
}
