import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../src/database/prisma/prisma.service';
import { PERMISSIONS } from '../../src/common/constants/permissions';

let counter = 1;
export const nextCounter = (): number => counter++;
export const uniqueCode = (prefix: string): string => `${prefix}_${nextCounter()}`;

// Precomputed bcrypt hash for password "TestPassword123!" with cost 12
export const TEST_PASSWORD = 'TestPassword123!';
export const TEST_PASSWORD_HASH = '$2b$12$vrFPZiTzL/BznUagqb2GTOxz8kA.OhnqUbnYbAVX8dvLEpGMdI53W';

export async function ensurePermissionsSeeded(
  prisma: PrismaService,
  selected?: string[],
): Promise<string[]> {
  const permissionCodes = Object.values(PERMISSIONS).filter(
    (code) => selected === undefined || selected.includes(code),
  );
  const rows = await Promise.all(
    permissionCodes.map((code) =>
      prisma.permission.upsert({
        where: { code },
        update: {},
        create: { code, description: code },
      }),
    ),
  );
  return rows.map((r) => r.id);
}

export async function createTestShop(
  prisma: PrismaService,
  override?: Partial<Prisma.ShopCreateInput>,
) {
  const code = uniqueCode('shop');
  return prisma.shop.create({
    data: {
      code,
      name: `Shop ${code}`,
      currency: 'VND',
      timezone: 'Asia/Ho_Chi_Minh',
      status: 'ACTIVE',
      ...override,
    },
  });
}

export async function createTestLocation(
  prisma: PrismaService,
  shopId: string,
  override?: Partial<Prisma.ShopLocationUncheckedCreateInput>,
) {
  const code = uniqueCode('loc');
  return prisma.shopLocation.create({
    data: {
      shopId,
      code,
      name: `Location ${code}`,
      isPrimary: true,
      isActive: true,
      ...override,
    },
  });
}

export async function createTestUserAndMember(
  prisma: PrismaService,
  shopId: string,
  options?: {
    permissions?: string[];
    roleCode?: string;
    email?: string;
  },
) {
  const permissionIds = await ensurePermissionsSeeded(prisma, options?.permissions);
  const email = options?.email || `user_${nextCounter()}@example.com`.toLowerCase();

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: TEST_PASSWORD_HASH,
      fullName: 'Test User',
      status: 'ACTIVE',
    },
  });

  const member = await prisma.shopMember.create({
    data: {
      shopId,
      userId: user.id,
      displayName: 'Test Member',
      status: 'ACTIVE',
    },
  });

  const roleCode = options?.roleCode || uniqueCode('role');
  const role = await prisma.role.create({
    data: {
      shopId,
      code: roleCode,
      name: `Role ${roleCode}`,
      isSystem: false,
    },
  });

  // Assign permissions to role
  await prisma.rolePermission.createMany({
    data: permissionIds.map((permissionId) => ({
      roleId: role.id,
      permissionId,
    })),
  });

  // Assign role to member
  await prisma.memberRole.create({
    data: {
      memberId: member.id,
      roleId: role.id,
    },
  });

  return { user, member, role };
}

export async function createTestCustomer(
  prisma: PrismaService,
  shopId: string,
  override?: Partial<Prisma.CustomerUncheckedCreateInput>,
) {
  const code = uniqueCode('cust');
  return prisma.customer.create({
    data: {
      shopId,
      customerCode: code,
      fullName: `Customer ${code}`,
      phone: '0901234567',
      normalizedPhone: '0901234567',
      status: 'ACTIVE',
      ...override,
    },
  });
}

export async function createTestCategory(prisma: PrismaService, shopId: string) {
  const code = uniqueCode('cat');
  return prisma.category.create({
    data: {
      shopId,
      code,
      name: `Category ${code}`,
      isActive: true,
    },
  });
}

export async function createTestProductWithVariant(
  prisma: PrismaService,
  shopId: string,
  options?: {
    dailyRate?: number;
    depositAmount?: number;
    inventoryCount?: number;
  },
) {
  const category = await createTestCategory(prisma, shopId);
  const productCode = uniqueCode('prod');
  const dailyRate = options?.dailyRate ?? 100000;
  const depositAmount = options?.depositAmount ?? 200000;

  const product = await prisma.product.create({
    data: {
      shopId,
      categoryId: category.id,
      code: productCode,
      name: `Product ${productCode}`,
      currency: 'VND',
      defaultDepositAmount: new Prisma.Decimal(depositAmount),
      isRentable: true,
      isPublic: true,
      status: 'ACTIVE',
    },
  });

  const variantCode = `${productCode}-V1`;
  const variant = await prisma.productVariant.create({
    data: {
      shopId,
      productId: product.id,
      variantCode,
      status: 'ACTIVE',
    },
  });

  await prisma.rentalRate.createMany({
    data: [1, 2, 3, 4, 5].map((days) => ({
      shopId,
      productId: product.id,
      variantId: variant.id,
      durationDays: days,
      price: new Prisma.Decimal(dailyRate * days),
      currency: 'VND',
      isActive: true,
    })),
  });

  const count = options?.inventoryCount ?? 1;
  const inventoryItems = [];
  for (let i = 0; i < count; i++) {
    const sku = `${variantCode}-ITEM-${i + 1}`;
    const item = await prisma.inventoryItem.create({
      data: {
        shopId,
        variantId: variant.id,
        sku,
        barcode: sku,
        currentStatus: 'AVAILABLE',
      },
    });
    inventoryItems.push(item);
  }

  return { product, variant, inventoryItems };
}
