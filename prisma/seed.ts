import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';
import { ApplicationLogger } from '../src/common/logging/application-logger';
import { PERMISSIONS } from '../src/common/constants/permissions';

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

const categories = [
  ['DRESS', 'Váy'],
  ['TOP', 'Áo'],
  ['PANTS', 'Quần'],
  ['ACCESSORY', 'Phụ kiện'],
  ['BAG', 'Túi'],
  ['SHOES', 'Giày'],
] as const;

const sizes = [
  ['XS', 'XS', 10],
  ['S', 'S', 20],
  ['M', 'M', 30],
  ['L', 'L', 40],
  ['XL', 'XL', 50],
  ['FREE_SIZE', 'Free size', 60],
] as const;

async function main(): Promise<void> {
  const shopCode = process.env.DEFAULT_SHOP_CODE ?? 'MAIN';
  const shopName = process.env.DEFAULT_SHOP_NAME ?? 'Rental Shop';
  const adminEmail = (process.env.DEFAULT_ADMIN_EMAIL ?? 'admin@example.com').toLowerCase();
  const adminPassword = process.env.DEFAULT_ADMIN_PASSWORD ?? 'ChangeMe123!';
  if (
    process.env.NODE_ENV === 'production' &&
    (!process.env.DEFAULT_ADMIN_PASSWORD?.trim() || adminPassword === 'ChangeMe123!')
  ) {
    throw new Error(
      'Khởi tạo dữ liệu production yêu cầu DEFAULT_ADMIN_PASSWORD được chỉ định và khác mật khẩu mặc định.',
    );
  }
  const adminName = process.env.DEFAULT_ADMIN_NAME ?? 'Shop Owner';

  const shop = await prisma.shop.upsert({
    where: { code: shopCode },
    update: { name: shopName },
    create: { code: shopCode, name: shopName, timezone: 'Asia/Ho_Chi_Minh', currency: 'VND' },
  });

  await prisma.shopLocation.upsert({
    where: { shopId_code: { shopId: shop.id, code: 'MAIN' } },
    update: { name: 'Cửa hàng chính', isPrimary: true, isActive: true },
    create: { shopId: shop.id, code: 'MAIN', name: 'Cửa hàng chính', isPrimary: true },
  });

  const permissionRows = await Promise.all(
    Object.values(PERMISSIONS).map((code) =>
      prisma.permission.upsert({
        where: { code },
        update: {},
        create: { code, description: code },
      }),
    ),
  );

  const ownerRole = await prisma.role.upsert({
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
  const managerRole = await prisma.role.upsert({
    where: { shopId_code: { shopId: shop.id, code: 'MANAGER' } },
    update: { name: 'Manager', isSystem: true },
    create: { shopId: shop.id, code: 'MANAGER', name: 'Manager', isSystem: true },
  });
  const staffRole = await prisma.role.upsert({
    where: { shopId_code: { shopId: shop.id, code: 'STAFF' } },
    update: { name: 'Staff', isSystem: true },
    create: { shopId: shop.id, code: 'STAFF', name: 'Staff', isSystem: true },
  });
  const accountantRole = await prisma.role.upsert({
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
  for (const [roleId, permissionIds] of rolePermissionIds) {
    await prisma.rolePermission.deleteMany({ where: { roleId } });
    await prisma.rolePermission.createMany({
      data: permissionIds.map((permissionId) => ({ roleId, permissionId })),
      skipDuplicates: true,
    });
  }

  const passwordHash = await hash(adminPassword, 12);
  const user = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { fullName: adminName, status: 'ACTIVE' },
    create: { email: adminEmail, fullName: adminName, passwordHash, status: 'ACTIVE' },
  });
  // Preserve a changed password on reruns; only set the seed password if the user did not have one.
  if (!user.passwordHash) {
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
  }

  const member = await prisma.shopMember.upsert({
    where: { shopId_userId: { shopId: shop.id, userId: user.id } },
    update: { displayName: adminName, status: 'ACTIVE' },
    create: { shopId: shop.id, userId: user.id, displayName: adminName, employeeCode: 'OWNER-001' },
  });
  await prisma.memberRole.upsert({
    where: { memberId_roleId: { memberId: member.id, roleId: ownerRole.id } },
    update: {},
    create: { memberId: member.id, roleId: ownerRole.id },
  });

  for (const [code, name] of categories) {
    await prisma.category.upsert({
      where: { shopId_code: { shopId: shop.id, code } },
      update: { name, isActive: true },
      create: { shopId: shop.id, code, name },
    });
  }
  for (const [code, name, sortOrder] of sizes) {
    await prisma.size.upsert({
      where: { shopId_code: { shopId: shop.id, code } },
      update: { name, sortOrder },
      create: { shopId: shop.id, code, name, sortOrder },
    });
  }
  for (const [code, name] of expenseCategories) {
    await prisma.expenseCategory.upsert({
      where: { shopId_code: { shopId: shop.id, code } },
      update: { name, isActive: true },
      create: { shopId: shop.id, code, name },
    });
  }

  const defaults: Array<[string, unknown, string]> = [
    ['rental.default_buffer_hours', 0, 'Extra blocked hours between consecutive rentals.'],
    [
      'rental.allow_manual_overlap_override',
      false,
      'Reserved for a future privileged override flow.',
    ],
    ['notification.return_reminder_hours', 24, 'Hours before return time to surface a reminder.'],
    ['order.number_prefix', 'RO', 'Rental order number prefix.'],
  ];
  for (const [key, value, description] of defaults) {
    await prisma.appSetting.upsert({
      where: { shopId_key: { shopId: shop.id, key } },
      update: {},
      create: { shopId: shop.id, key, value: value as never, description },
    });
  }

  process.stdout.write(`Seed complete. Shop=${shop.code}, admin=${adminEmail}\n`);
  if (adminPassword === 'ChangeMe123!') {
    process.stdout.write('WARNING: Change DEFAULT_ADMIN_PASSWORD before production deployment.\n');
  }
}

main()
  .catch((error: unknown) => {
    new ApplicationLogger().error({ event: 'seed.failed', error });
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
