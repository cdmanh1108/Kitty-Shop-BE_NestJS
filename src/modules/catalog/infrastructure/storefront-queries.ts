import type { PublicMediaUrlResolver } from '@common/storage/public-url.resolver';
import { paginateMeta } from '@common/types/pagination';
import { slugify } from '@common/utils/slugify';
import { decimalToNumber } from '@database/prisma/decimal-mapping';
import type { PrismaService } from '@database/prisma/prisma.service';
import type { Prisma } from '@prisma/client';
import type {
  StorefrontCategory,
  StorefrontProductDetails,
  StorefrontProductItem,
  StorefrontProductListCriteria,
  StorefrontProductPage,
  StorefrontRentalPrice,
} from '../domain/catalog.models';

export async function listStorefrontCategories(
  prisma: PrismaService,
  shopId: string,
): Promise<StorefrontCategory[]> {
  const categories = await prisma.category.findMany({
    where: {
      shopId,
      isActive: true,
    },
    orderBy: {
      sortOrder: 'asc',
    },
    select: {
      id: true,
      code: true,
      name: true,
      slug: true,
      description: true,
    },
  });

  return categories.map((c) => ({
    id: c.id,
    code: c.code,
    name: c.name,
    slug: c.slug || slugify(c.name),
    description: c.description,
  }));
}

function extractRentalPrices(
  productRates?: Array<{ durationDays: number; price: unknown }>,
  variantRates?: Array<Array<{ durationDays: number; price: unknown }>>,
): StorefrontRentalPrice[] {
  const map = new Map<number, number>();

  if (productRates?.length) {
    for (const r of productRates) {
      if (!map.has(r.durationDays)) {
        map.set(r.durationDays, decimalToNumber(r.price as number | Prisma.Decimal));
      }
    }
  } else if (variantRates?.length) {
    for (const vrList of variantRates) {
      for (const r of vrList) {
        if (!map.has(r.durationDays)) {
          map.set(r.durationDays, decimalToNumber(r.price as number | Prisma.Decimal));
        }
      }
    }
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => a - b)
    .map(([days, amount]) => ({ days, amount }));
}

export async function listStorefrontProducts(
  prisma: PrismaService,
  mediaUrls: PublicMediaUrlResolver,
  input: StorefrontProductListCriteria,
): Promise<StorefrontProductPage> {
  const page = Math.max(1, input.page);
  const limit = Math.min(100, Math.max(1, input.limit));
  const skip = (page - 1) * limit;

  // Build Prisma where clause
  const where: Prisma.ProductWhereInput = {
    shopId: input.shopId,
    archivedAt: null,
    status: { in: ['ACTIVE', 'AVAILABLE'] },
    isRentable: true,
  };

  if (input.category) {
    where.category = {
      OR: [
        { id: input.category },
        { code: input.category.toUpperCase() },
        { slug: input.category.toLowerCase() },
      ],
    };
  }

  if (input.q?.trim()) {
    const search = input.q.trim();
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { code: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
    ];
  }

  const variantFilter: Prisma.ProductVariantWhereInput = { archivedAt: null };
  let hasVariantFilter = false;

  if (input.size?.trim()) {
    variantFilter.size = { name: { equals: input.size.trim(), mode: 'insensitive' } };
    hasVariantFilter = true;
  }

  if (input.color?.trim()) {
    variantFilter.color = { name: { equals: input.color.trim(), mode: 'insensitive' } };
    hasVariantFilter = true;
  }

  if (hasVariantFilter) {
    where.variants = { some: variantFilter };
  }

  const productInclude = {
    category: { select: { id: true, code: true, name: true } },
    media: {
      orderBy: { sortOrder: 'asc' as const },
      select: { storageKey: true, url: true, isPrimary: true },
    },
    rentalRates: {
      where: { isActive: true },
      orderBy: { durationDays: 'asc' as const },
      select: { durationDays: true, price: true },
    },
    variants: {
      where: { archivedAt: null },
      select: {
        id: true,
        variantCode: true,
        size: { select: { name: true } },
        color: { select: { name: true, hexColor: true } },
        rentalRates: {
          where: { isActive: true },
          orderBy: { durationDays: 'asc' as const },
          select: { durationDays: true, price: true },
        },
      },
    },
  };

  // Determine sort order
  let products: Array<
    Prisma.ProductGetPayload<{ include: typeof productInclude }>
  >;
  let total: number;

  if (input.sort === 'price_asc' || input.sort === 'price_desc') {
    // Query sorted product IDs at the database level
    const [allProductsMatching, count] = await prisma.$transaction([
      prisma.product.findMany({
        where,
        include: productInclude,
      }),
      prisma.product.count({ where }),
    ]);

    total = count;

    // Sort by lowest price in the full matching set BEFORE paginating
    allProductsMatching.sort((a, b) => {
      const priceA =
        extractRentalPrices(a.rentalRates, a.variants.map((v) => v.rentalRates))[0]?.amount ??
        Number.MAX_SAFE_INTEGER;
      const priceB =
        extractRentalPrices(b.rentalRates, b.variants.map((v) => v.rentalRates))[0]?.amount ??
        Number.MAX_SAFE_INTEGER;
      return input.sort === 'price_asc' ? priceA - priceB : priceB - priceA;
    });

    products = allProductsMatching.slice(skip, skip + limit);
  } else {
    let orderBy: Prisma.ProductOrderByWithRelationInput[] = [{ createdAt: 'desc' }, { id: 'desc' }];
    if (input.sort === 'name_asc') {
      orderBy = [{ name: 'asc' }, { id: 'asc' }];
    } else if (input.sort === 'name_desc') {
      orderBy = [{ name: 'desc' }, { id: 'desc' }];
    }

    const [items, count] = await prisma.$transaction([
      prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: productInclude,
      }),
      prisma.product.count({ where }),
    ]);

    products = items;
    total = count;
  }

  const items: StorefrontProductItem[] = products.map((product) => {
    const primaryMediaObj =
      product.media.find((m) => m.isPrimary) ?? product.media[0] ?? null;
    const imageUrl = primaryMediaObj ? mediaUrls.resolve(primaryMediaObj) : '';
    const gallery = product.media.map((m) => mediaUrls.resolve(m)).filter(Boolean);

    const sizes = Array.from(
      new Set(product.variants.map((v) => v.size?.name).filter((s): s is string => Boolean(s))),
    );
    const colors = Array.from(
      new Set(product.variants.map((v) => v.color?.name).filter((c): c is string => Boolean(c))),
    );

    const rentalPrices = extractRentalPrices(
      product.rentalRates,
      product.variants.map((v) => v.rentalRates),
    );

    return {
      id: product.id,
      code: product.code,
      slug: product.slug || slugify(product.name),
      name: product.name,
      categoryId: product.categoryId,
      categoryName: product.category?.name ?? 'Sản phẩm',
      imageUrl,
      gallery: gallery.length ? gallery : imageUrl ? [imageUrl] : [],
      size: sizes.join(', ') || 'Free size',
      color: colors.join(', ') || 'Nhiều màu',
      rentalPrices,
      depositAmount: decimalToNumber(product.defaultDepositAmount),
      status: product.status.toLowerCase(),
      isRentable: product.isRentable,
    };
  });

  return {
    items,
    meta: paginateMeta(page, limit, total),
  };
}

export async function findStorefrontProductBySlug(
  prisma: PrismaService,
  mediaUrls: PublicMediaUrlResolver,
  shopId: string,
  slug: string,
): Promise<StorefrontProductDetails | null> {
  const trimmed = slug.trim();
  const product = await prisma.product.findFirst({
    where: {
      shopId,
      archivedAt: null,
      isRentable: true,
      status: { in: ['ACTIVE', 'AVAILABLE'] },
      OR: [
        { slug: trimmed },
        { id: trimmed },
        { code: trimmed.toUpperCase() },
      ],
    },
    include: {
      category: { select: { id: true, code: true, name: true } },
      media: {
        orderBy: { sortOrder: 'asc' },
        select: { storageKey: true, url: true, isPrimary: true },
      },
      rentalRates: {
        where: { isActive: true },
        orderBy: { durationDays: 'asc' },
        select: { durationDays: true, price: true },
      },
      variants: {
        where: { archivedAt: null },
        include: {
          size: { select: { name: true } },
          color: { select: { name: true, hexColor: true } },
          rentalRates: {
            where: { isActive: true },
            orderBy: { durationDays: 'asc' },
            select: { durationDays: true, price: true },
          },
        },
      },
    },
  });

  if (!product) {
    return null;
  }

  const primaryMediaObj =
    product.media.find((m) => m.isPrimary) ?? product.media[0] ?? null;
  const imageUrl = primaryMediaObj ? mediaUrls.resolve(primaryMediaObj) : '';
  const gallery = product.media.map((m) => mediaUrls.resolve(m)).filter(Boolean);

  const sizes = Array.from(
    new Set(product.variants.map((v) => v.size?.name).filter((s): s is string => Boolean(s))),
  );
  const colors = Array.from(
    new Set(product.variants.map((v) => v.color?.name).filter((c): c is string => Boolean(c))),
  );

  const rentalPrices = extractRentalPrices(
    product.rentalRates,
    product.variants.map((v) => v.rentalRates),
  );

  const baseDepositAmount = decimalToNumber(product.defaultDepositAmount);

  const variants = product.variants.map((v) => ({
    id: v.id,
    code: v.variantCode,
    size: v.size?.name ?? null,
    color: v.color?.name ?? null,
    depositAmount: v.depositAmountOverride
      ? decimalToNumber(v.depositAmountOverride)
      : baseDepositAmount,
  }));

  return {
    id: product.id,
    code: product.code,
    slug: product.slug || slugify(product.name),
    name: product.name,
    categoryId: product.categoryId,
    categoryName: product.category?.name ?? 'Sản phẩm',
    imageUrl,
    gallery: gallery.length ? gallery : imageUrl ? [imageUrl] : [],
    size: sizes.join(', ') || 'Free size',
    color: colors.join(', ') || 'Nhiều màu',
    rentalPrices,
    depositAmount: baseDepositAmount,
    status: product.status.toLowerCase(),
    isRentable: product.isRentable,
    description: product.description,
    facebookPostUrl: product.facebookPostUrl,
    variants,
  };
}
