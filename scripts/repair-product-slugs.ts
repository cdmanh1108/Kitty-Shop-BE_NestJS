import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export function vietnameseSlugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function main(): Promise<void> {
  console.log('=== BẮT ĐẦU DỌN DẸP BENCHMARK DATA VÀ SỬA SLUG SẢN PHẨM ===\n');

  // 1. Dọn dẹp dữ liệu benchmark (PERF_*)
  const perfProducts = await prisma.product.findMany({
    where: { code: { startsWith: 'PERF_' } },
    select: { id: true, code: true },
  });

  if (perfProducts.length > 0) {
    console.log(`1. Phát hiện ${perfProducts.length} sản phẩm benchmark. Đang tiến hành xóa...`);
    const perfIds = perfProducts.map((p) => p.id);

    const deletedRates = await prisma.rentalRate.deleteMany({
      where: {
        OR: [{ productId: { in: perfIds } }, { variant: { productId: { in: perfIds } } }],
      },
    });

    const deletedMedia = await prisma.productMedia.deleteMany({
      where: { productId: { in: perfIds } },
    });

    const deletedVariants = await prisma.productVariant.deleteMany({
      where: { productId: { in: perfIds } },
    });

    const deletedProducts = await prisma.product.deleteMany({
      where: { id: { in: perfIds } },
    });

    console.log(
      `   ✓ Đã xóa: ${deletedProducts.count} products, ${deletedVariants.count} variants, ${deletedRates.count} rental rates, ${deletedMedia.count} media.\n`,
    );
  } else {
    console.log('1. Không có sản phẩm benchmark (PERF_*) nào cần xóa.\n');
  }

  // 2. Lấy toàn bộ sản phẩm thật để chuẩn hóa lại slug theo tên tiếng Việt không dấu
  console.log('2. Đang kiểm tra và chuẩn hóa lại slug cho tất cả sản phẩm thật...');
  const products = await prisma.product.findMany({
    select: {
      id: true,
      shopId: true,
      code: true,
      name: true,
      slug: true,
    },
    orderBy: { code: 'asc' },
  });

  console.log(`   Tìm thấy ${products.length} sản phẩm.`);

  // Quản lý slug theo từng shop để đảm bảo tính unique (shopId_slug)
  const usedSlugsByShop = new Map<string, Set<string>>();
  let updatedCount = 0;
  let unchangedCount = 0;

  for (const product of products) {
    if (!usedSlugsByShop.has(product.shopId)) {
      usedSlugsByShop.set(product.shopId, new Set<string>());
    }
    const takenSlugs = usedSlugsByShop.get(product.shopId)!;

    // Tạo slug chuẩn từ name
    let baseSlug = vietnameseSlugify(product.name);
    if (!baseSlug) {
      baseSlug = product.code.toLowerCase();
    }

    let targetSlug = baseSlug;
    if (takenSlugs.has(targetSlug)) {
      // Nếu trùng tên trong cùng shop, thêm mã sản phẩm để phân biệt
      targetSlug = `${baseSlug}-${vietnameseSlugify(product.code)}`;
      let counter = 2;
      while (takenSlugs.has(targetSlug)) {
        targetSlug = `${baseSlug}-${vietnameseSlugify(product.code)}-${counter}`;
        counter++;
      }
    }

    takenSlugs.add(targetSlug);

    if (product.slug !== targetSlug) {
      await prisma.product.update({
        where: { id: product.id },
        data: { slug: targetSlug },
      });
      console.log(`   [CẬP NHẬT] ${product.code.padEnd(7)} | "${product.name}"`);
      console.log(`     Cũ:  ${product.slug}`);
      console.log(`     Mới: ${targetSlug}`);
      updatedCount++;
    } else {
      unchangedCount++;
    }
  }

  console.log('\n=== KẾT QUẢ HOÀN TẤT ===');
  console.log(`- Tổng số sản phẩm: ${products.length}`);
  console.log(`- Đã sửa slug:      ${updatedCount}`);
  console.log(`- Giữ nguyên:       ${unchangedCount}`);
}

main()
  .catch((err) => {
    console.error('Lỗi khi thực hiện:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
