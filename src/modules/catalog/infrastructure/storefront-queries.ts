import type { PublicMediaUrlResolver } from '@common/storage/public-url.resolver';
import { slugify } from '@common/utils/slugify';
import { paginateMeta } from '@common/types/pagination';
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
import { PRODUCT_STATUS } from '../domain/catalog-status';

/**
 * Shared base query filter for products eligible to appear on the storefront.
 * Both product listing and product detail by slug MUST enforce identical conditions:
 * - Current shop tenancy (`shopId = current resolved shop`)
 * - Explicitly public (`isPublic = true`)
 * - Rentable (`isRentable = true`)
 * - Unarchived (`archivedAt = null`)
 * - Active product status (`status = PRODUCT_STATUS.ACTIVE`)
 */
export function storefrontProductBaseWhere(shopId: string): Prisma.ProductWhereInput {
  return {
    shopId,
    isPublic: true,
    isRentable: true,
    archivedAt: null,
    status: PRODUCT_STATUS.ACTIVE,
  };
}

/**
 * Shared base query filter for variants eligible to appear on the storefront.
 * Excludes variants that are archived or inactive.
 */
export function storefrontVariantBaseWhere(): Prisma.ProductVariantWhereInput {
  return {
    archivedAt: null,
    status: PRODUCT_STATUS.ACTIVE,
  };
}

export async function listStorefrontCategories(
  prisma: PrismaService,
  shopId: string,
): Promise<StorefrontCategory[]> {
  const categories = await prisma.category.findMany({
    where: {
      shopId,
      isActive: true,
    },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }, { code: 'asc' }],
    select: {
      id: true,
      code: true,
      name: true,
      slug: true,
      parentId: true,
      sortOrder: true,
      description: true,
    },
  });

  return categories.map((c) => ({
    id: c.id,
    code: c.code,
    name: c.name,
    slug: c.slug,
    parentId: c.parentId,
    sortOrder: c.sortOrder,
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
  //
  // Note on Category Visibility Ambiguity:
  // In the existing domain, Category defines `isActive: boolean` (enforced when listing storefront
  // categories and validating product category assignments). However, the domain does not specify
  // whether deactivating a category cascades to hiding its products from the storefront, or whether
  // product visibility is strictly governed by product-level visibility fields (isPublic, status, etc.).
  // As instructed, we do not invent a cascading business rule and keep product-level visibility authoritative.
  const where: Prisma.ProductWhereInput = {
    ...storefrontProductBaseWhere(input.shopId),
  };

  if (input.category) {
    const cat = input.category.trim();
    const isCatUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cat);
    const catOr: Prisma.CategoryWhereInput[] = [
      { code: cat.toUpperCase() },
      { slug: cat.toLowerCase() },
    ];
    if (isCatUuid) {
      catOr.push({ id: cat });
    }
    where.category = { OR: catOr };
  }

  if (input.q?.trim()) {
    const search = input.q.trim();
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { code: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
    ];
  }

  const variantFilter: Prisma.ProductVariantWhereInput = {
    ...storefrontVariantBaseWhere(),
  };
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
      where: {
        OR: [{ variantId: null }, { variant: storefrontVariantBaseWhere() }],
      },
      orderBy: { sortOrder: 'asc' as const },
      select: { storageKey: true, url: true, isPrimary: true },
    },
    rentalRates: {
      where: {
        isActive: true,
        OR: [{ variantId: null }, { variant: storefrontVariantBaseWhere() }],
      },
      orderBy: { durationDays: 'asc' as const },
      select: { durationDays: true, price: true },
    },
    variants: {
      where: storefrontVariantBaseWhere(),
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
  let products: Array<Prisma.ProductGetPayload<{ include: typeof productInclude }>>;
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
        extractRentalPrices(
          a.rentalRates,
          a.variants.map((v) => v.rentalRates),
        )[0]?.amount ?? Number.MAX_SAFE_INTEGER;
      const priceB =
        extractRentalPrices(
          b.rentalRates,
          b.variants.map((v) => v.rentalRates),
        )[0]?.amount ?? Number.MAX_SAFE_INTEGER;
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
    const primaryMediaObj = product.media.find((m) => m.isPrimary) ?? product.media[0] ?? null;
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
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed);
  const identifierOr: Prisma.ProductWhereInput[] = [
    { slug: trimmed },
    { code: trimmed.toUpperCase() },
  ];
  if (isUuid) {
    identifierOr.push({ id: trimmed });
  }

  const product = await prisma.product.findFirst({
    where: {
      ...storefrontProductBaseWhere(shopId),
      OR: identifierOr,
    },
    include: {
      category: { select: { id: true, code: true, name: true } },
      media: {
        where: {
          OR: [{ variantId: null }, { variant: storefrontVariantBaseWhere() }],
        },
        orderBy: { sortOrder: 'asc' },
        select: { storageKey: true, url: true, isPrimary: true },
      },
      rentalRates: {
        where: {
          isActive: true,
          OR: [{ variantId: null }, { variant: storefrontVariantBaseWhere() }],
        },
        orderBy: { durationDays: 'asc' },
        select: { durationDays: true, price: true },
      },
      variants: {
        where: storefrontVariantBaseWhere(),
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

  const primaryMediaObj = product.media.find((m) => m.isPrimary) ?? product.media[0] ?? null;
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
