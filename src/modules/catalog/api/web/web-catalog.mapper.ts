import type { Category } from '@prisma/client';
import type {
  WebCategoryDto,
  WebProductDetailDto,
  WebProductListItemDto,
  WebRentalPriceDto,
} from './dto/web-catalog.dto';

export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

interface RawRate {
  durationDays: number;
  price: number | { toNumber?: () => number } | string;
}

interface RawMedia {
  url: string | null;
  isPrimary?: boolean;
}

interface RawVariant {
  id: string;
  variantCode: string;
  depositAmountOverride?: number | { toNumber?: () => number } | string | null;
  size?: { name: string } | null;
  color?: { name: string } | null;
  rentalRates?: RawRate[];
}

export interface RawProduct {
  id: string;
  code: string;
  name: string;
  slug?: string | null;
  categoryId: string;
  description?: string | null;
  defaultDepositAmount?: number | { toNumber?: () => number } | string | null;
  replacementValue?: number | { toNumber?: () => number } | string | null;
  facebookPostUrl?: string | null;
  status: string;
  isRentable?: boolean;
  isPublic?: boolean;
  category?: { id: string; name: string } | null;
  media?: RawMedia[];
  rentalRates?: RawRate[];
  variants?: RawVariant[];
  tags?: string[];
}

function parseDecimalNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'object' && value !== null && 'toNumber' in value && typeof (value as { toNumber: () => number }).toNumber === 'function') {
    return (value as { toNumber: () => number }).toNumber();
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function extractRentalPrices(product: RawProduct): WebRentalPriceDto[] {
  // Collect rental rates from product level or variant level
  const rates: RawRate[] = [];
  if (product.rentalRates?.length) {
    rates.push(...product.rentalRates);
  } else if (product.variants?.length) {
    for (const v of product.variants) {
      if (v.rentalRates?.length) {
        rates.push(...v.rentalRates);
      }
    }
  }

  // Deduplicate by durationDays
  const map = new Map<number, number>();
  for (const r of rates) {
    if (!map.has(r.durationDays)) {
      map.set(r.durationDays, parseDecimalNumber(r.price));
    }
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => a - b)
    .map(([days, amount]) => ({ days, amount }));
}

export function toWebCategory(category: Category | { id: string; code: string; name: string; slug?: string | null; description?: string | null }): WebCategoryDto {
  return {
    id: category.id,
    code: category.code,
    name: category.name,
    slug: 'slug' in category && category.slug ? category.slug : slugify(category.name),
    description: category.description ?? undefined,
  };
}

export function toWebProductListItem(product: RawProduct): WebProductListItemDto {
  const primaryMedia = product.media?.find((m) => m.isPrimary)?.url ?? product.media?.[0]?.url ?? '';
  const gallery = (product.media ?? []).map((m) => m.url).filter((u): u is string => Boolean(u));

  const sizes = Array.from(
    new Set(
      (product.variants ?? [])
        .map((v) => v.size?.name)
        .filter((s): s is string => Boolean(s)),
    ),
  );

  const colors = Array.from(
    new Set(
      (product.variants ?? [])
        .map((v) => v.color?.name)
        .filter((c): c is string => Boolean(c)),
    ),
  );

  const slug = product.slug || slugify(product.name);
  const rentalPrices = extractRentalPrices(product);
  const depositAmount = parseDecimalNumber(product.defaultDepositAmount);

  return {
    id: product.id,
    code: product.code,
    slug,
    name: product.name,
    categoryId: product.categoryId,
    categoryName: product.category?.name ?? 'Sản phẩm',
    imageUrl: primaryMedia,
    gallery: gallery.length ? gallery : primaryMedia ? [primaryMedia] : [],
    size: sizes.join(', ') || 'Free size',
    color: colors.join(', ') || 'Nhiều màu',
    rentalPrices,
    depositAmount,
    status: product.status?.toLowerCase() ?? 'available',
    isRentable: product.isRentable ?? true,
    featured: false,
    tags: product.tags ?? [],
  };
}

export function toWebProductDetail(product: RawProduct): WebProductDetailDto {
  const base = toWebProductListItem(product);

  const variants = (product.variants ?? []).map((v) => ({
    id: v.id,
    code: v.variantCode,
    size: v.size?.name ?? undefined,
    color: v.color?.name ?? undefined,
    depositAmount: v.depositAmountOverride ? parseDecimalNumber(v.depositAmountOverride) : base.depositAmount,
  }));

  return {
    ...base,
    description: product.description ?? undefined,
    facebookPostUrl: product.facebookPostUrl ?? undefined,
    variants,
  };
}
