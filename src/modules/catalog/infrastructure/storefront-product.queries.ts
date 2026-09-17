import type { PublicMediaUrlResolver } from '@common/storage/public-url.resolver';
import { slugify } from '@common/utils/slugify';
import { paginateMeta } from '@common/types/pagination';
import { decimalToNumber } from '@database/prisma/decimal-mapping';
import type { PrismaService } from '@database/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import type {
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

/**
 * Retrieves a paginated list of public, rentable products matching search and filter criteria.
 */
export async function listStorefrontProducts(
  prisma: PrismaService,
  mediaUrls: PublicMediaUrlResolver,
  input: StorefrontProductListCriteria,
): Promise<StorefrontProductPage> {
  const page = Math.min(1000, Math.max(1, input.page));
  const limit = Math.min(100, Math.max(1, input.limit));
  const skip = (page - 1) * limit;

  // Build Prisma where clause enforcing shop tenancy and public visibility
  const where: Prisma.ProductWhereInput = {
    ...storefrontProductBaseWhere(input.shopId),
  };

  if (input.category) {
    const cat = input.category.trim();
    const isCatUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cat);
    const catOr: Prisma.CategoryWhereInput[] = [
      { code: { equals: cat, mode: 'insensitive' } },
      { slug: { equals: cat, mode: 'insensitive' } },
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

  const productSelect = {
    id: true,
    code: true,
    slug: true,
    name: true,
    categoryId: true,
    defaultDepositAmount: true,
    isRentable: true,
    category: { select: { name: true } },
    media: {
      where: {
        OR: [{ variantId: null }, { variant: storefrontVariantBaseWhere() }],
      },
      orderBy: [{ isPrimary: 'desc' as const }, { sortOrder: 'asc' as const }],
      take: 1,
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
        size: { select: { name: true } },
        color: { select: { name: true } },
        rentalRates: {
          where: { isActive: true },
          orderBy: { durationDays: 'asc' as const },
          select: { durationDays: true, price: true },
        },
      },
    },
  };

  // Determine sort order
  let products: Array<Prisma.ProductGetPayload<{ select: typeof productSelect }>>;
  let total: number;

  if (input.sort === 'price_asc' || input.sort === 'price_desc') {
    // Authoritative database price sorting: resolve page IDs via SQL correlated subquery,
    // avoiding fetching the entire matching catalog into Node.js application memory.
    const sqlConditions: Prisma.Sql[] = [
      Prisma.sql`p.shop_id = ${input.shopId}::uuid`,
      Prisma.sql`p.is_public = true`,
      Prisma.sql`p.is_rentable = true`,
      Prisma.sql`p.archived_at IS NULL`,
      Prisma.sql`p.status = ${PRODUCT_STATUS.ACTIVE}`,
    ];

    if (input.category) {
      const cat = input.category.trim();
      const isCatUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cat);
      if (isCatUuid) {
        sqlConditions.push(
          Prisma.sql`p.category_id IN (
            SELECT c.id FROM categories c
            WHERE c.shop_id = ${input.shopId}::uuid
              AND (UPPER(c.code) = UPPER(${cat}) OR LOWER(c.slug) = LOWER(${cat}) OR c.id = ${cat}::uuid)
          )`,
        );
      } else {
        sqlConditions.push(
          Prisma.sql`p.category_id IN (
            SELECT c.id FROM categories c
            WHERE c.shop_id = ${input.shopId}::uuid
              AND (UPPER(c.code) = UPPER(${cat}) OR LOWER(c.slug) = LOWER(${cat}))
          )`,
        );
      }
    }

    if (input.q?.trim()) {
      const searchPattern = `%${input.q.trim()}%`;
      sqlConditions.push(
        Prisma.sql`(p.name ILIKE ${searchPattern} OR p.code ILIKE ${searchPattern} OR (p.description IS NOT NULL AND p.description ILIKE ${searchPattern}))`,
      );
    }

    if (input.size?.trim()) {
      sqlConditions.push(
        Prisma.sql`EXISTS (
          SELECT 1 FROM product_variants pv
          JOIN sizes s ON s.id = pv.size_id
          WHERE pv.product_id = p.id
            AND pv.archived_at IS NULL
            AND pv.status = ${PRODUCT_STATUS.ACTIVE}
            AND LOWER(s.name) = LOWER(${input.size.trim()})
        )`,
      );
    }

    if (input.color?.trim()) {
      sqlConditions.push(
        Prisma.sql`EXISTS (
          SELECT 1 FROM product_variants pv
          JOIN colors c ON c.id = pv.color_id
          WHERE pv.product_id = p.id
            AND pv.archived_at IS NULL
            AND pv.status = ${PRODUCT_STATUS.ACTIVE}
            AND LOWER(c.name) = LOWER(${input.color.trim()})
        )`,
      );
    }

    const whereClause = Prisma.sql`WHERE ${Prisma.join(sqlConditions, ' AND ')}`;
    const orderDirection = input.sort === 'price_asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`;

    const [pageRows, count] = await Promise.all([
      prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT p.id
        FROM products p
        ${whereClause}
        ORDER BY (
          COALESCE(
            (
              SELECT rr.price
              FROM rental_rates rr
              WHERE rr.product_id = p.id
                AND rr.variant_id IS NULL
                AND rr.is_active = true
              ORDER BY rr.duration_days ASC, rr.price ASC
              LIMIT 1
            ),
            (
              SELECT rr.price
              FROM rental_rates rr
              JOIN product_variants pv ON pv.id = rr.variant_id
              WHERE rr.product_id = p.id
                AND rr.is_active = true
                AND pv.archived_at IS NULL
                AND pv.status = ${PRODUCT_STATUS.ACTIVE}
              ORDER BY rr.duration_days ASC, rr.price ASC
              LIMIT 1
            )
          )
        ) ${orderDirection} NULLS LAST, p.id ASC
        LIMIT ${limit} OFFSET ${skip}
      `),
      prisma.product.count({ where }),
    ]);

    total = count;

    if (pageRows.length === 0) {
      products = [];
    } else {
      const pageIds = pageRows.map((r) => r.id);
      const hydrated = await prisma.product.findMany({
        where: { id: { in: pageIds } },
        select: productSelect,
      });
      const byId = new Map(hydrated.map((p) => [p.id, p]));
      products = pageIds.map((id) => byId.get(id)!).filter(Boolean);
    }
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
        select: productSelect,
      }),
      prisma.product.count({ where }),
    ]);

    products = items;
    total = count;
  }

  const items: StorefrontProductItem[] = products.map((product) => {
    const primaryMediaObj = product.media[0] ?? null;
    const imageUrl = primaryMediaObj ? mediaUrls.resolve(primaryMediaObj) : '';

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
      size: sizes.join(', ') || 'Free size',
      color: colors.join(', ') || 'Nhiều màu',
      rentalPrices,
      depositAmount: decimalToNumber(product.defaultDepositAmount),
      isRentable: product.isRentable,
    };
  });

  return {
    items,
    meta: paginateMeta(page, limit, total),
  };
}

/**
 * Finds a single public product by slug, code, or UUID for storefront detail view.
 * Strictly scopes to current shop and verifies storefront visibility conditions.
 * Returns null if the product is private, unrentable, archived, or in another shop.
 */
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
    select: {
      id: true,
      code: true,
      slug: true,
      name: true,
      categoryId: true,
      description: true,
      defaultDepositAmount: true,
      facebookPostUrl: true,
      isRentable: true,
      category: { select: { name: true } },
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
        select: {
          id: true,
          variantCode: true,
          depositAmountOverride: true,
          size: { select: { name: true } },
          color: { select: { name: true } },
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
    isRentable: product.isRentable,
    description: product.description,
    facebookPostUrl: product.facebookPostUrl,
    variants,
  };
}
