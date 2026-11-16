import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';
import { ApplicationLogger } from '../src/common/logging/application-logger';
import { PERMISSIONS } from '../src/common/constants/permissions';
import {
  assertInitialReleaseDatabase,
  RELEASE_CATALOG_COUNTS,
  ReleaseSeedError,
  seedReleaseCatalog,
  validateReleaseCatalog,
} from './seed/release-catalog';

const prisma = new PrismaClient();

const expenseCategories = [
  ['PURCHASE', 'Mua đồ'],
  ['LAUNDRY', 'Giặt / vệ sinh'],
  ['REPAIR', 'Sửa chữa'],
  ['SHIPPING', 'Vận chuyển'],
  ['MARKETING', 'Marketing'],
  ['RENT', 'Mặt bằng'],
  ['SALARY', 'Lương'],
  ['UTILITIES', 'Điện nước / tiện ích'],
  ['OTHER', 'Khác'],
] as const;

async function main(): Promise<void> {
  validateReleaseCatalog();
  if (process.argv.includes('--check')) {
    console.log('Release catalog validated. No database connection or writes.');
    console.table(RELEASE_CATALOG_COUNTS);
    return;
  }
  const shopCode = 'MAIN';
  const shopName = process.env.DEFAULT_SHOP_NAME ?? 'Rental Shop';
  const adminEmail = (process.env.DEFAULT_ADMIN_EMAIL ?? 'admin@example.com').toLowerCase();
  const adminPassword = process.env.DEFAULT_ADMIN_PASSWORD ?? 'ChangeMe123!';
  if (
    process.env.NODE_ENV === 'production' &&
    (!process.env.DEFAULT_ADMIN_PASSWORD?.trim() || adminPassword === 'ChangeMe123!')
  ) {
    throw new ReleaseSeedError(
      'Khởi tạo dữ liệu production yêu cầu DEFAULT_ADMIN_PASSWORD được chỉ định và khác mật khẩu mặc định.',
    );
  }
  const adminName = process.env.DEFAULT_ADMIN_NAME ?? 'Shop Owner';

  const passwordHash = await hash(adminPassword, 12);
  const result = await prisma.$transaction(
    async (tx) => {
      await assertInitialReleaseDatabase(tx);
      const shop = await tx.shop.upsert({
        where: { code: shopCode },
        update: {},
        create: { code: shopCode, name: shopName, timezone: 'Asia/Ho_Chi_Minh', currency: 'VND' },
      });

      const location = await tx.shopLocation.upsert({
        where: { shopId_code: { shopId: shop.id, code: 'MAIN' } },
        update: { name: 'Cửa hàng chính', isPrimary: true, isActive: true },
        create: { shopId: shop.id, code: 'MAIN', name: 'Cửa hàng chính', isPrimary: true },
      });

      const permissionRows = await Promise.all(
        Object.values(PERMISSIONS).map((code) =>
          tx.permission.upsert({
            where: { code },
            update: {},
            create: { code, description: code },
          }),
        ),
      );

      const ownerRole = await tx.role.upsert({
        where: { shopId_code: { shopId: shop.id, code: 'OWNER' } },
        update: { name: 'Owner', isSystem: true },
        create: {
          shopId: shop.id,
          code: 'OWNER',
          name: 'Owner',
          isSystem: true,
          description: 'Full shop access',
        },
      });
      const managerRole = await tx.role.upsert({
        where: { shopId_code: { shopId: shop.id, code: 'MANAGER' } },
        update: { name: 'Manager', isSystem: true },
        create: { shopId: shop.id, code: 'MANAGER', name: 'Manager', isSystem: true },
      });
      const staffRole = await tx.role.upsert({
        where: { shopId_code: { shopId: shop.id, code: 'STAFF' } },
        update: { name: 'Staff', isSystem: true },
        create: { shopId: shop.id, code: 'STAFF', name: 'Staff', isSystem: true },
      });
      const accountantRole = await tx.role.upsert({
        where: { shopId_code: { shopId: shop.id, code: 'ACCOUNTANT' } },
        update: { name: 'Accountant', isSystem: true },
        create: { shopId: shop.id, code: 'ACCOUNTANT', name: 'Accountant', isSystem: true },
      });

      const byCode = new Map(permissionRows.map((p) => [p.code, p.id]));
      const allPermissionIds = permissionRows.map((p) => p.id);
      const managerCodes = Object.values(PERMISSIONS).filter(
        (code) => code !== PERMISSIONS.MEMBERS_MANAGE,
      );
      const staffCodes = [
        PERMISSIONS.DASHBOARD_VIEW,
        PERMISSIONS.CUSTOMERS_VIEW,
        PERMISSIONS.CUSTOMERS_CREATE,
        PERMISSIONS.CUSTOMERS_UPDATE,
        PERMISSIONS.CATALOG_VIEW,
        PERMISSIONS.INVENTORY_VIEW,
        PERMISSIONS.INVENTORY_MANAGE,
        PERMISSIONS.RENTALS_VIEW,
        PERMISSIONS.RENTALS_CREATE,
        PERMISSIONS.RENTALS_UPDATE,
        PERMISSIONS.DELIVERIES_VIEW,
        PERMISSIONS.DELIVERIES_MANAGE,
        PERMISSIONS.REMINDERS_VIEW,
      ];
      const accountantCodes = [
        PERMISSIONS.DASHBOARD_VIEW,
        PERMISSIONS.CUSTOMERS_VIEW,
        PERMISSIONS.RENTALS_VIEW,
        PERMISSIONS.PAYMENTS_VIEW,
        PERMISSIONS.PAYMENTS_CREATE,
        PERMISSIONS.FINANCE_VIEW,
        PERMISSIONS.FINANCE_MANAGE,
        PERMISSIONS.REPORTS_VIEW,
      ];

      const rolePermissionIds: Array<[string, string[]]> = [
        [ownerRole.id, allPermissionIds],
        [managerRole.id, managerCodes.map((code) => byCode.get(code)!).filter(Boolean)],
        [staffRole.id, staffCodes.map((code) => byCode.get(code)!).filter(Boolean)],
        [accountantRole.id, accountantCodes.map((code) => byCode.get(code)!).filter(Boolean)],
      ];
      // System role permissions are code-owned and synchronized by each seed run.
      for (const [roleId, permissionIds] of rolePermissionIds) {
        await tx.rolePermission.deleteMany({ where: { roleId } });
        await tx.rolePermission.createMany({
          data: permissionIds.map((permissionId) => ({ roleId, permissionId })),
          skipDuplicates: true,
        });
      }

      const user = await tx.user.upsert({
        where: { email: adminEmail },
        update: {},
        create: { email: adminEmail, fullName: adminName, passwordHash, status: 'ACTIVE' },
      });
      // Preserve a changed password on reruns; only set the seed password if the user did not have one.
      if (!user.passwordHash) {
        await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
      }

      const member = await tx.shopMember.upsert({
        where: { shopId_userId: { shopId: shop.id, userId: user.id } },
        update: {},
        create: {
          shopId: shop.id,
          userId: user.id,
          displayName: adminName,
          employeeCode: 'OWNER-001',
        },
      });
      await tx.memberRole.upsert({
        where: { memberId_roleId: { memberId: member.id, roleId: ownerRole.id } },
        update: {},
        create: { memberId: member.id, roleId: ownerRole.id },
      });

      for (const [code, name] of expenseCategories) {
        await tx.expenseCategory.upsert({
          where: { shopId_code: { shopId: shop.id, code } },
          update: {},
          create: { shopId: shop.id, code, name },
        });
      }

      const catalog = await seedReleaseCatalog(tx, shop.id, location.id);
      return { shopCode: shop.code, catalog };
    },
    { isolationLevel: 'Serializable', timeout: 60_000 },
  );

  process.stdout.write(
    `Seed complete. Shop=${result.shopCode}, admin=${adminEmail}, catalog=${result.catalog}\n`,
  );
  if (adminPassword === 'ChangeMe123!') {
    process.stdout.write('WARNING: Change DEFAULT_ADMIN_PASSWORD before production deployment.\n');
  }
}

main()
  .catch((error: unknown) => {
    if (error instanceof ReleaseSeedError) console.error(error.message);
    else new ApplicationLogger().error({ event: 'seed.failed', error });
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
