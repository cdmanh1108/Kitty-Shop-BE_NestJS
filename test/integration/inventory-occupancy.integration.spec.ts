import { rentalPolicies } from '../fixtures/rental-policy.fixture';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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
    });
    expect(summary.currentlyRented).toBe(2);
    expect(summary.inventory).toMatchObject({ AVAILABLE: 0, RESERVED: 0, RENTED: 2, TOTAL: 2 });
  });

  it('migrates legacy occupancy without deleting allocations or historical statuses', async () => {
    const f = await rentalScenario(prisma);
    const repo = new PrismaRentalRepository(prisma, fixedClock, rentalPolicies);
    await repo.createOrder(f.data);
    const orphan = await prisma.inventoryItem.create({
      data: {
        shopId: f.shop.id,
        variantId: f.variant.id,
        sku: uniqueCode('ORPHAN'),
      },
    });
    const migration = readFileSync(
      join(
        process.cwd(),
        'prisma/migrations/202609110003_repair_inventory_operational_status/migration.sql',
      ),
      'utf8',
    );
    const rollback = new Error('Rollback migration test');
    // Reconstruct the previous inventory schema inside a rollback-only transaction.
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          'ALTER TABLE inventory_items DROP CONSTRAINT inventory_items_operational_status_check',
        );
        await tx.inventoryItem.update({
          where: { id: f.inventory.id },
          data: { currentStatus: 'RENTED' },
        });
        await tx.inventoryItem.update({
          where: { id: orphan.id },
          data: { currentStatus: 'RESERVED' },
        });
        await tx.inventoryStatusHistory.create({
          data: { shopId: f.shop.id, inventoryItemId: f.inventory.id, toStatus: 'RENTED' },
        });
        for (const statement of migration.replace(/^BEGIN;|^COMMIT;/gm, '').split(';')) {
          if (statement.trim()) await tx.$executeRawUnsafe(statement);
        }
        expect(
          (await tx.inventoryItem.findUniqueOrThrow({ where: { id: f.inventory.id } }))
            .currentStatus,
        ).toBe('AVAILABLE');
        expect(
          (await tx.inventoryItem.findUniqueOrThrow({ where: { id: orphan.id } })).currentStatus,
        ).toBe('CLEANING');
        expect(await tx.rentalItemAllocation.count()).toBe(1);
        expect(await tx.inventoryStatusHistory.count({ where: { toStatus: 'RENTED' } })).toBe(1);
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  });
});
