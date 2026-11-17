import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { compare, hash } from 'bcryptjs';
import type { PrismaService } from '../../src/database/prisma/prisma.service';
import {
  connectTestDatabase,
  disconnectTestDatabase,
  resetTestDatabase,
  testDatabaseUrl,
} from '../helpers/test-database';

const seedEmail = 'release-owner@example.test';
const seedPassword = 'ReleaseSeedTest123!';
const seedName = 'Release Test Owner';

function runSeed() {
  return spawnSync(
    process.execPath,
    [require.resolve('ts-node/dist/bin.js'), '-r', 'tsconfig-paths/register', 'prisma/seed.ts'],
    {
      cwd: resolve(__dirname, '../..'),
      encoding: 'utf8',
      timeout: 40_000,
      env: {
        ...process.env,
        DATABASE_URL: testDatabaseUrl(),
        NODE_ENV: 'test',
        DEFAULT_SHOP_NAME: 'Fresh Seed Shop',
        DEFAULT_ADMIN_EMAIL: seedEmail,
        DEFAULT_ADMIN_PASSWORD: seedPassword,
        DEFAULT_ADMIN_NAME: seedName,
      },
    },
  );
}

describe('initial release seed', () => {
  let prisma: PrismaService;

  beforeAll(async () => {
    prisma = await connectTestDatabase();
  });
  beforeEach(async () => {
    await resetTestDatabase(prisma);
  });
  afterAll(disconnectTestDatabase);

  it('restores the approved catalog, zero-stock products and env admin without test history', async () => {
    const result = runSeed();
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(
      await Promise.all([
        prisma.category.count(),
        prisma.color.count(),
        prisma.size.count(),
        prisma.product.count(),
        prisma.productVariant.count(),
        prisma.productMedia.count(),
        prisma.inventoryItem.count(),
        prisma.rentalOrder.count(),
        prisma.rentalItemAllocation.count(),
        prisma.inventoryStatusHistory.count(),
        prisma.paymentTransaction.count(),
        prisma.webAccount.count(),
      ]),
    ).toEqual([13, 16, 6, 116, 121, 116, 116, 0, 0, 0, 0, 0]);
    expect(await prisma.product.count({ where: { freeAccessoryLimit: 1 } })).toBe(116);
    expect(await prisma.product.count({ where: { code: { startsWith: 'TEST' } } })).toBe(0);
    expect(
      await prisma.product.findMany({
        where: { variants: { none: { inventoryItems: { some: {} } } } },
        select: { code: true },
        orderBy: { code: 'asc' },
      }),
    ).toEqual(['SP026', 'SP040', 'SP047', 'SP057', 'SP068', 'SP075'].map((code) => ({ code })));
    const items = await prisma.inventoryItem.findMany();
    expect(items.every((item) => item.totalRentalCount === 0 && item.lastRentedAt === null)).toBe(
      true,
    );
    expect(
      items.every((item) => item.currentStatus === 'AVAILABLE' && item.condition === 'GOOD'),
    ).toBe(true);
    const shop = await prisma.shop.findUniqueOrThrow({ where: { code: 'MAIN' } });
    expect(shop).toMatchObject({ name: 'Fresh Seed Shop', timezone: 'Asia/Ho_Chi_Minh' });
    expect(shop.id).not.toBe('e5fe96c2-7c65-49ac-9892-393274f52f34');
    const location = await prisma.shopLocation.findFirstOrThrow({ where: { shopId: shop.id } });
    expect(items.every((item) => item.shopId === shop.id && item.locationId === location.id)).toBe(
      true,
    );
    const child = await prisma.category.findUniqueOrThrow({
      where: { shopId_code: { shopId: shop.id, code: 'DAM_NGAN' } },
      include: { parent: true },
    });
    expect(child.parent?.code).toBe('DAM');
    const media = await prisma.productMedia.findMany();
    expect(media.every((row) => !!row.storageKey && row.isPrimary)).toBe(true);
    const user = await prisma.user.findUniqueOrThrow({ where: { email: seedEmail } });
    expect(user.fullName).toBe(seedName);
    expect(await compare(seedPassword, user.passwordHash!)).toBe(true);
    const roles = await prisma.memberRole.findMany({
      where: { member: { userId: user.id } },
      include: { role: true },
    });
    expect(roles.map((row) => row.role.code)).toEqual(['OWNER']);
    const policy = await prisma.appSetting.findUniqueOrThrow({
      where: { shopId_key: { shopId: shop.id, key: 'rental_policy' } },
    });
    expect(policy.value).toEqual({
      deposit: { defaultCashDeposit: 200000 },
      rentalPricing: { defaultRentalPrice: 50000, additionalDayFee: 10000 },
    });
  }, 60_000);

  it('reruns without duplicating data or overwriting live catalog, counters, policy or passwords', async () => {
    expect(runSeed().status).toBe(0);
    const product = await prisma.product.findFirstOrThrow({ where: { code: 'SP019' } });
    const item = await prisma.inventoryItem.findFirstOrThrow();
    const user = await prisma.user.findUniqueOrThrow({ where: { email: seedEmail } });
    const changedPassword = await hash('ChangedAfterRelease123!', 4);
    await prisma.product.update({
      where: { id: product.id },
      data: { name: 'Edited after release', freeAccessoryLimit: 3 },
    });
    await prisma.inventoryItem.update({
      where: { id: item.id },
      data: {
        currentStatus: 'CLEANING',
        totalRentalCount: 3,
        lastRentedAt: new Date('2026-11-16'),
      },
    });
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: changedPassword } });
    await prisma.appSetting.update({
      where: { shopId_key: { shopId: product.shopId, key: 'rental_policy' } },
      data: { value: { rentalPricing: { defaultRentalPrice: 70000 } } },
    });
    expect(runSeed().status).toBe(0);
    expect(await prisma.product.count()).toBe(116);
    expect(await prisma.productVariant.count()).toBe(121);
    expect(await prisma.inventoryItem.count()).toBe(116);
    expect(await prisma.productMedia.count()).toBe(116);
    expect(await prisma.user.count()).toBe(1);
    expect(await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).toMatchObject({
      name: 'Edited after release',
      freeAccessoryLimit: 3,
    });
    expect(await prisma.inventoryItem.findUniqueOrThrow({ where: { id: item.id } })).toMatchObject({
      currentStatus: 'CLEANING',
      totalRentalCount: 3,
      lastRentedAt: new Date('2026-11-16'),
    });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).passwordHash).toBe(
      changedPassword,
    );
    expect(
      (
        await prisma.appSetting.findUniqueOrThrow({
          where: { shopId_key: { shopId: product.shopId, key: 'rental_policy' } },
        })
      ).value,
    ).toEqual({ rentalPricing: { defaultRentalPrice: 70000 } });
  }, 90_000);

  it('refuses a populated catalog without its marker and rolls back the base seed', async () => {
    const shop = await prisma.shop.create({ data: { code: 'MAIN', name: 'Existing shop' } });
    await prisma.category.create({ data: { shopId: shop.id, code: 'EXISTING', name: 'Keep me' } });
    expect(runSeed().status).not.toBe(0);
    expect(await prisma.category.count()).toBe(1);
    expect(await prisma.product.count()).toBe(0);
    expect(await prisma.user.count()).toBe(0);
    expect(await prisma.permission.count()).toBe(0);
    expect(await prisma.shopLocation.count()).toBe(0);
    expect(await prisma.appSetting.count()).toBe(0);
  }, 60_000);

  it('refuses an older migration history before writing data', async () => {
    const id = randomUUID();
    await prisma.$executeRaw`INSERT INTO "_prisma_migrations"
      (id, checksum, migration_name, finished_at, applied_steps_count)
      VALUES (${id}, ${'0'.repeat(64)}, '202609100001_initial', now(), 1)`;
    try {
      expect(runSeed().status).not.toBe(0);
      expect(await prisma.shop.count()).toBe(0);
      expect(await prisma.user.count()).toBe(0);
      expect(await prisma.product.count()).toBe(0);
    } finally {
      await prisma.$executeRaw`DELETE FROM "_prisma_migrations" WHERE id = ${id}`;
    }
  }, 60_000);
});
