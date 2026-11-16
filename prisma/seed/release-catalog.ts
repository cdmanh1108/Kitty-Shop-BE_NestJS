import type { Prisma } from '@prisma/client';
import {
  releaseCatalog,
  RELEASE_CATALOG_SOURCE_SHA256,
  RELEASE_CATALOG_VERSION,
} from './release-catalog.data';

export const RELEASE_CATALOG_MARKER = 'seed.release_catalog';
export class ReleaseSeedError extends Error {}
export const RELEASE_CATALOG_COUNTS = {
  categories: 13,
  colors: 16,
  sizes: 6,
  products: 116,
  variants: 121,
  media: 116,
  inventory: 116,
} as const;

function requireReference(ids: Set<string>, id: string | null, label: string): void {
  if (id !== null && !ids.has(id)) throw new ReleaseSeedError(`Release catalog: invalid ${label}`);
}

function requireUnique(values: string[], label: string): void {
  if (new Set(values).size !== values.length) {
    throw new ReleaseSeedError(`Release catalog: duplicate ${label}`);
  }
}

/** Validate the checked-in data before opening a write transaction. */
export function validateReleaseCatalog(): void {
  for (const key of Object.keys(RELEASE_CATALOG_COUNTS) as Array<
    keyof typeof RELEASE_CATALOG_COUNTS
  >) {
    const rows = releaseCatalog[key];
    if (
      rows.length !== RELEASE_CATALOG_COUNTS[key] ||
      new Set(rows.map((row) => row.id)).size !== rows.length ||
      rows.some((row) => !/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(row.id))
    ) {
      throw new ReleaseSeedError(`Release catalog: unexpected count or duplicate ID in ${key}`);
    }
  }
  requireUnique(
    releaseCatalog.categories.map((row) => row.code),
    'category code',
  );
  requireUnique(
    releaseCatalog.colors.map((row) => row.code),
    'color code',
  );
  requireUnique(
    releaseCatalog.sizes.map((row) => row.code),
    'size code',
  );
  requireUnique(
    releaseCatalog.products.map((row) => row.code),
    'product code',
  );
  requireUnique(
    releaseCatalog.products.map((row) => row.slug),
    'product slug',
  );
  requireUnique(
    releaseCatalog.variants.map((row) => row.variantCode),
    'variant code',
  );
  requireUnique(
    releaseCatalog.variants.map((row) => JSON.stringify([row.productId, row.sizeId, row.colorId])),
    'product/size/color combination',
  );
  requireUnique(
    releaseCatalog.inventory.map((row) => row.sku),
    'SKU',
  );
  requireUnique(
    releaseCatalog.inventory.map((row) => row.barcode).filter((value) => value !== null),
    'barcode',
  );
  const categoryIds = new Set(releaseCatalog.categories.map((row) => row.id));
  const sizeIds = new Set(releaseCatalog.sizes.map((row) => row.id));
  const colorIds = new Set(releaseCatalog.colors.map((row) => row.id));
  const productIds = new Set(releaseCatalog.products.map((row) => row.id));
  const variants = new Map(releaseCatalog.variants.map((row) => [row.id, row]));
  const categories = new Map(releaseCatalog.categories.map((row) => [row.id, row]));
  for (const category of releaseCatalog.categories) {
    const visited = new Set([category.id]);
    let parentId = category.parentId;
    while (parentId !== null) {
      requireReference(categoryIds, parentId, 'parent category');
      if (visited.has(parentId))
        throw new ReleaseSeedError('Release catalog: cyclic category tree');
      visited.add(parentId);
      parentId = categories.get(parentId)!.parentId;
    }
  }
  for (const product of releaseCatalog.products) {
    requireReference(categoryIds, product.categoryId, 'product category');
    if (
      ['TEST', 'TEST-02', 'TEST-PHU-KIEN-FREE'].includes(product.code) ||
      product.archivedAt !== null ||
      product.status !== 'ACTIVE'
    ) {
      throw new ReleaseSeedError('Release catalog contains an excluded test or archived product');
    }
    if (
      releaseCatalog.media.filter((row) => row.productId === product.id && row.isPrimary).length !==
      1
    ) {
      throw new ReleaseSeedError('Release catalog: each product must have one primary image');
    }
  }
  for (const variant of releaseCatalog.variants) {
    requireReference(productIds, variant.productId, 'variant product');
    requireReference(sizeIds, variant.sizeId, 'variant size');
    requireReference(colorIds, variant.colorId, 'variant color');
  }
  for (const media of releaseCatalog.media) {
    requireReference(productIds, media.productId, 'media product');
    if (media.variantId !== null && variants.get(media.variantId)?.productId !== media.productId) {
      throw new ReleaseSeedError('Release catalog: media belongs to another product variant');
    }
  }
  for (const item of releaseCatalog.inventory) {
    if (!variants.has(item.variantId))
      throw new ReleaseSeedError('Release catalog: invalid inventory variant');
  }
  const stockedProducts = new Set(
    releaseCatalog.inventory.map((row) => variants.get(row.variantId)!.productId),
  );
  const withoutStock = releaseCatalog.products
    .filter((row) => !stockedProducts.has(row.id))
    .map((row) => row.code)
    .sort();
  if (withoutStock.join(',') !== 'SP026,SP040,SP047,SP057,SP068,SP075') {
    throw new ReleaseSeedError('Release catalog: the approved zero-stock products have changed');
  }
}

export async function assertInitialReleaseDatabase(tx: Prisma.TransactionClient): Promise<void> {
  const migrations = await tx.$queryRaw<
    Array<{ migration_name: string; finished_at: Date | null }>
  >`SELECT migration_name, finished_at FROM "_prisma_migrations" WHERE rolled_back_at IS NULL`;
  if (
    migrations.some(
      (row) =>
        !row.finished_at ||
        !['202610230001_initial_release', '202611160001_product_rental_price_override'].includes(
          row.migration_name,
        ),
    ) ||
    !['202610230001_initial_release', '202611160001_product_rental_price_override'].every((name) =>
      migrations.some((row) => row.migration_name === name && row.finished_at),
    )
  ) {
    throw new ReleaseSeedError(
      'Release seed requires all committed release migrations on a new/reset database. Run db:migrate first. Existing migration history was left unchanged.',
    );
  }
}

/** Import once; a rerun must preserve subsequent catalog, stock and price edits. */
export async function seedReleaseCatalog(
  tx: Prisma.TransactionClient,
  shopId: string,
  locationId: string,
): Promise<'imported' | 'already seeded'> {
  const marker = await tx.appSetting.findUnique({
    where: { shopId_key: { shopId, key: RELEASE_CATALOG_MARKER } },
  });
  if (marker) {
    const value = marker.value;
    if (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      value.version === RELEASE_CATALOG_VERSION &&
      value.sourceSha256 === RELEASE_CATALOG_SOURCE_SHA256
    ) {
      return 'already seeded';
    }
    throw new ReleaseSeedError(
      'This database has a different release-catalog seed marker; no data was changed.',
    );
  }
  const existing = await Promise.all([
    tx.category.count(),
    tx.color.count(),
    tx.size.count(),
    tx.product.count(),
    tx.productVariant.count(),
    tx.productMedia.count(),
    tx.inventoryItem.count(),
    tx.appSetting.count({ where: { key: 'rental_policy' } }),
  ]);
  if (existing.some((count) => count !== 0)) {
    throw new ReleaseSeedError(
      'Release catalog seed requires an empty catalog, or its own completed seed marker. Use a new/reset database; no existing catalog was changed.',
    );
  }

  await tx.category.createMany({
    data: releaseCatalog.categories.map((row) => ({ ...row, shopId, parentId: null })),
  });
  for (const category of releaseCatalog.categories) {
    if (category.parentId !== null) {
      await tx.category.update({
        where: { id: category.id },
        data: { parentId: category.parentId, updatedAt: category.updatedAt },
      });
    }
  }
  await tx.color.createMany({ data: releaseCatalog.colors.map((row) => ({ ...row, shopId })) });
  await tx.size.createMany({ data: releaseCatalog.sizes.map((row) => ({ ...row, shopId })) });
  await tx.product.createMany({ data: releaseCatalog.products.map((row) => ({ ...row, shopId })) });
  await tx.productVariant.createMany({
    data: releaseCatalog.variants.map((row) => ({ ...row, shopId })),
  });
  await tx.productMedia.createMany({
    data: releaseCatalog.media.map((row) => ({ ...row, shopId })),
  });
  await tx.inventoryItem.createMany({
    data: releaseCatalog.inventory.map((row) => ({
      ...row,
      shopId,
      locationId,
      totalRentalCount: 0,
      lastRentedAt: null,
    })),
  });
  await tx.appSetting.create({ data: { ...releaseCatalog.rentalPolicy, shopId } });
  await tx.appSetting.create({
    data: {
      shopId,
      key: RELEASE_CATALOG_MARKER,
      value: {
        version: RELEASE_CATALOG_VERSION,
        sourceSha256: RELEASE_CATALOG_SOURCE_SHA256,
        counts: RELEASE_CATALOG_COUNTS,
      },
      description: 'Completed initial catalog seed; reruns preserve business edits.',
    },
  });
  return 'imported';
}
