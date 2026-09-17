import { PrismaClient, Prisma } from '@prisma/client';
import { ApplicationLogger } from '../src/common/logging/application-logger';
import { slugify } from '../src/common/utils/slugify';

const prisma = new PrismaClient();
const logger = new ApplicationLogger('SeedPerformanceData');

// Mulberry32 deterministic PRNG
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = mulberry32(123456789);

function randomInt(min: number, max: number): number {
  return Math.floor(random() * (max - min + 1)) + min;
}

function pickOne<T>(arr: readonly T[]): T {
  return arr[Math.floor(random() * arr.length)]!;
}

const ADJECTIVES = ['Dạ Hội', 'Vintage', 'Công Sở', 'Dạo Phố', 'Hàn Quốc', 'Thiết Kế', 'Cao Cấp', 'Cổ Điển', 'Thanh Lịch', 'Sang Trọng'];
const NOUNS = ['Đầm', 'Váy', 'Áo Dài', 'Sơ Mi', 'Vest', 'Chân Váy', 'Set Đồ', 'Áo Khoác', 'Jumpsuit', 'Blazer'];
const COLORS = ['Trắng', 'Đen', 'Đỏ', 'Xanh Pastel', 'Vàng Nhạt', 'Hồng Pastel', 'Be', 'Nâu', 'Tím Nhạt', 'Cam'];

export async function seedPerformanceCatalog(targetCount = 1000): Promise<void> {
  logger.log(`Starting deterministic performance dataset seeding (target: ${targetCount} products)...`);

  const shop = await prisma.shop.findFirst({ where: { code: 'MAIN' } });
  if (!shop) {
    throw new Error('Default shop (MAIN) not found. Run "npm run db:seed" first.');
  }

  const categories = await prisma.category.findMany({ where: { shopId: shop.id } });
  if (categories.length === 0) {
    throw new Error('Categories not found. Run base seed first.');
  }

  const sizes = await prisma.size.findMany({ where: { shopId: shop.id } });
  const colors = await prisma.color.findMany({ where: { shopId: shop.id } });

  // Ensure color records exist for test
  if (colors.length < 5) {
    for (const colorName of ['Trắng', 'Đen', 'Đỏ', 'Xanh', 'Vàng', 'Hồng']) {
      await prisma.color.upsert({
        where: { shopId_code: { shopId: shop.id, code: slugify(colorName).toUpperCase() } },
        update: {},
        create: { shopId: shop.id, code: slugify(colorName).toUpperCase(), name: colorName },
      });
    }
  }
  const availableColors = await prisma.color.findMany({ where: { shopId: shop.id } });

  // Check how many performance products already exist
  const existingPerfCount = await prisma.product.count({
    where: { shopId: shop.id, code: { startsWith: 'PERF_' } },
  });

  if (existingPerfCount >= targetCount) {
    logger.log(`Dataset already has ${existingPerfCount} performance products. Skipping generation.`);
    return;
  }

  const toCreate = targetCount - existingPerfCount;
  logger.log(`Generating ${toCreate} performance products...`);

  const BATCH_SIZE = 100;
  let createdSoFar = 0;

  for (let b = 0; b < toCreate; b += BATCH_SIZE) {
    const batchLimit = Math.min(BATCH_SIZE, toCreate - b);

    for (let i = 0; i < batchLimit; i++) {
      const idx = existingPerfCount + createdSoFar + 1;
      const code = `PERF_${String(idx).padStart(5, '0')}`;
      const noun = pickOne(NOUNS);
      const adj = pickOne(ADJECTIVES);
      const col = pickOne(COLORS);
      const name = `${noun} ${adj} ${col} #${idx}`;
      const slug = `${slugify(name)}-${idx}`;
      const category = pickOne(categories);

      // Visibility distribution:
      // 80% active rentable public
      // 10% private
      // 5% unrentable
      // 5% archived
      const roll = random();
      let isPublic = true;
      let isRentable = true;
      const status = 'ACTIVE';
      let archivedAt: Date | null = null;

      if (roll > 0.95) {
        archivedAt = new Date(Date.now() - 86400000);
      } else if (roll > 0.90) {
        isRentable = false;
      } else if (roll > 0.80) {
        isPublic = false;
      }

      const depositAmount = new Prisma.Decimal(randomInt(1, 10) * 50000);

      const product = await prisma.product.create({
        data: {
          shopId: shop.id,
          categoryId: category.id,
          code,
          name,
          slug,
          description: `Mô tả chi tiết sản phẩm ${name} cho thuê tại Kitty Shop.`,
          defaultDepositAmount: depositAmount,
          isPublic,
          isRentable,
          status,
          archivedAt,
          createdAt: new Date(Date.now() - randomInt(1, 1000) * 3600000),
        },
      });

      // Add Primary Media
      await prisma.productMedia.create({
        data: {
          shopId: shop.id,
          productId: product.id,
          url: `https://pub-da9772f41ace4dda9871f112ae659353.r2.dev/products/${slug}/thumb.jpg`,
          sortOrder: 0,
          isPrimary: true,
          mediaType: 'IMAGE',
        },
      });

      // Variants
      const numVariants = Math.min(3, Math.max(1, sizes.length));
      const usedCombos = new Set<string>();
      const createdVariants = [];

      for (let v = 0; v < numVariants; v++) {
        const vSize = sizes[v % sizes.length] ?? null;
        const vColor = availableColors[v % availableColors.length] ?? null;
        const comboKey = `${vSize?.id ?? 'none'}:${vColor?.id ?? 'none'}`;
        if (usedCombos.has(comboKey)) continue;
        usedCombos.add(comboKey);

        const variant = await prisma.productVariant.create({
          data: {
            shopId: shop.id,
            productId: product.id,
            variantCode: `${code}-V${v + 1}`,
            sizeId: vSize?.id ?? null,
            colorId: vColor?.id ?? null,
            status: 'ACTIVE',
          },
        });
        createdVariants.push(variant);
      }

      // Rental Rates
      // 50% products have direct product-level rates, 50% have variant-level rates
      const basePrice = randomInt(3, 30) * 10000; // 30,000 to 300,000 VND
      const hasProductLevelRates = random() > 0.5;

      if (hasProductLevelRates) {
        // 1-day rate
        await prisma.rentalRate.create({
          data: {
            shopId: shop.id,
            productId: product.id,
            durationDays: 1,
            price: new Prisma.Decimal(basePrice),
            isActive: true,
          },
        });
        // 3-day rate
        await prisma.rentalRate.create({
          data: {
            shopId: shop.id,
            productId: product.id,
            durationDays: 3,
            price: new Prisma.Decimal(Math.round(basePrice * 1.8)),
            isActive: true,
          },
        });
      } else {
        // Variant level rates
        for (const variant of createdVariants) {
          await prisma.rentalRate.create({
            data: {
              shopId: shop.id,
              productId: product.id,
              variantId: variant.id,
              durationDays: 1,
              price: new Prisma.Decimal(basePrice),
              isActive: true,
            },
          });
          await prisma.rentalRate.create({
            data: {
              shopId: shop.id,
              productId: product.id,
              variantId: variant.id,
              durationDays: 3,
              price: new Prisma.Decimal(Math.round(basePrice * 1.8)),
              isActive: true,
            },
          });
        }
      }

      createdSoFar++;
    }
    logger.log(`Created ${createdSoFar}/${toCreate} products...`);
  }

  logger.log(`Seeding complete! Total performance products: ${existingPerfCount + createdSoFar}`);
}

if (require.main === module) {
  const countArg = process.argv[2] ? parseInt(process.argv[2], 10) : 1000;
  seedPerformanceCatalog(countArg)
    .catch((err) => {
      console.error('Failed to seed performance data:', err);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
