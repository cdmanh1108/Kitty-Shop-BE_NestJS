import { rentalPolicies } from '../fixtures/rental-policy.fixture';
import {
  connectTestDatabase,
  disconnectTestDatabase,
  resetTestDatabase,
} from '../helpers/test-database';
import { rentalScenario, fixedClock, payRentalForConfirmation } from '../fixtures/rental.fixture';
import { uniqueCode } from '../fixtures/test-factories';
import type { PrismaService } from '../../src/database/prisma/prisma.service';
import { PrismaRentalRepository } from '../../src/modules/rentals/infrastructure/prisma-rental.repository';
import { PrismaDashboardRepository } from '../../src/modules/dashboard/infrastructure/prisma-dashboard.repository';

describe('Inventory occupancy persistence and read models', () => {
  let prisma: PrismaService;
  beforeAll(async () => {
    prisma = await connectTestDatabase();
  });
  beforeEach(async () => {
    await resetTestDatabase(prisma);
  });
  afterAll(disconnectTestDatabase);

  it('counts physical rented items, not orders, without counting future reservations twice', async () => {
    const f = await rentalScenario(prisma);
    const second = await prisma.inventoryItem.create({
      data: {
        shopId: f.shop.id,
        variantId: f.variant.id,
        sku: uniqueCode('SKU'),
      },
    });
    const repo = new PrismaRentalRepository(prisma, fixedClock, rentalPolicies);
    const order = await repo.createOrder({
      ...f.data,
      lines: f.data.lines.map((line) => ({
        ...line,
        quantity: 2,
        lineTotal: line.unitRentalPrice * 2,
        depositAmount: line.depositAmount * 2,
        pricingSnapshot:
          line.pricingSnapshot.version === 'CYCLE_V1'
            ? { ...line.pricingSnapshot, billableQuantity: 2 }
            : line.pricingSnapshot,
        inventory: [...line.inventory, { id: second.id, sku: second.sku }],
      })),
    });
    await repo.createOrder({
      ...f.data,
      orderNumber: uniqueCode('RT'),
      rentalStartAt: new Date('2026-11-01T00:00:00Z'),
      rentalEndAt: new Date('2026-11-03T00:00:00Z'),
    });
    if (!order) throw new Error('Expected order');
    await payRentalForConfirmation(prisma, {
      shopId: f.shop.id,
      orderId: order.id,
      memberId: f.member.id,
      rentalAmount: 400000,
      depositAmount: 400000,
    });
    await repo.confirm({
      shopId: f.shop.id,
      orderId: order.id,
      actorMemberId: f.member.id,
      actorUserId: f.user.id,
      actorName: f.user.fullName,
      collateralMethod: 'CASH',
      collateralAmount: 400000,
    });
    await repo.transition({
      shopId: f.shop.id,
      orderId: order.id,
      fromStatuses: ['CONFIRMED'],
      toStatus: 'ACTIVE',
      changedBy: f.member.id,
    });
    const summary = await new PrismaDashboardRepository(prisma).summary({
      shopId: f.shop.id,
      now: fixedClock.now(),
      dayStart: f.data.rentalStartAt,
      dayEnd: f.data.rentalEndAt,
      monthStart: new Date('2026-10-01T00:00:00Z'),
      monthEnd: new Date('2026-11-01T00:00:00Z'),
      timezone: 'Asia/Ho_Chi_Minh',
      seriesStart: new Date('2026-10-04T17:00:00Z'),
    });
    expect(summary.rentingProducts).toBe(2);
  });
});
