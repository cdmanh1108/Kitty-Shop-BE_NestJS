import type {
  StorefrontCategory,
  StorefrontProductDetails,
  StorefrontProductItem,
  StorefrontProductPage,
  StorefrontSelectionResolution,
} from '../../domain/catalog.models';
import type {
  WebCategoryDto,
  WebProductDetailDto,
  WebProductListItemDto,
  WebProductListResDto,
  WebStorefrontSelectionResolveResDto,
} from './dto/web-catalog.dto';

/**
 * Authoritative Web DTO mapper for the public storefront catalog API surface.
 * Converts internal storefront projections into explicitly whitelisted response DTOs.
 */
export const WebCatalogMapper = {
  /**
   * Maps a single StorefrontCategory into WebCategoryDto.
   * Strips all internal tenant and audit metadata.
   */
  toCategory(category: StorefrontCategory): WebCategoryDto {
    return {
      id: category.id,
      code: category.code,
      name: category.name,
      slug: category.slug ?? null,
      parentId: category.parentId ?? null,
      sortOrder: category.sortOrder,
      description: category.description ?? undefined,
    };
  },

  /**
   * Maps an array of StorefrontCategory into WebCategoryDto[].
   */
  toCategoryList(categories: StorefrontCategory[]): WebCategoryDto[] {
    return categories.map((cat) => WebCatalogMapper.toCategory(cat));
  },

  /**
   * Maps a StorefrontProductItem into WebProductListItemDto.
   * Ensures monetary fields are numeric, internal valuation/cost fields are excluded,
   * and only fields required by storefront list/card consumers are exposed.
   */
  toProductListItem(product: StorefrontProductItem): WebProductListItemDto {
    return {
      id: product.id,
      code: product.code,
      slug: product.slug,
      name: product.name,
      categoryId: product.categoryId,
      categoryName: product.categoryName,
      imageUrl: product.imageUrl,
      size: product.size,
      color: product.color,
      rentalPrices: product.rentalPrices.map((r) => ({
        days: r.days,
        amount: r.amount,
      })),
      depositAmount: product.depositAmount,
      isRentable: product.isRentable,
    };
  },

  /**
   * Maps a paginated StorefrontProductPage into WebProductListResDto.
   */
  toProductListResponse(page: StorefrontProductPage): WebProductListResDto {
    return {
      items: page.items.map((item) => WebCatalogMapper.toProductListItem(item)),
      meta: {
        page: page.meta.page,
        limit: page.meta.limit,
        total: page.meta.total,
        totalPages: page.meta.totalPages,
      },
    };
  },

  /**
   * Maps a StorefrontProductDetails into WebProductDetailDto.
   * Exposes rich media gallery, description, and variant summaries without internal inventory identifiers.
   */
  toProductDetail(product: StorefrontProductDetails): WebProductDetailDto {
    return {
      id: product.id,
      code: product.code,
      slug: product.slug,
      name: product.name,
      categoryId: product.categoryId,
      categoryName: product.categoryName,
      imageUrl: product.imageUrl,
      gallery: product.gallery,
      size: product.size,
      color: product.color,
      rentalPrices: product.rentalPrices.map((r) => ({
        days: r.days,
        amount: r.amount,
      })),
      depositAmount: product.depositAmount,
      isRentable: product.isRentable,
      description: product.description ?? undefined,
      facebookPostUrl: product.facebookPostUrl ?? undefined,
      variants: product.variants.map((v) => ({
        id: v.id,
        code: v.code,
        size: v.size ?? undefined,
        color: v.color ?? undefined,
        depositAmount: v.depositAmount,
      })),
    };
  },

  toSelectionResolution(
    items: StorefrontSelectionResolution[],
  ): WebStorefrontSelectionResolveResDto {
    return { items };
  },
};

// Standalone function aliases for backwards compatibility
export const toWebCategory = (category: StorefrontCategory): WebCategoryDto =>
  WebCatalogMapper.toCategory(category);
export const toWebCategoryList = (categories: StorefrontCategory[]): WebCategoryDto[] =>
  WebCatalogMapper.toCategoryList(categories);
export const toWebProductListItem = (product: StorefrontProductItem): WebProductListItemDto =>
  WebCatalogMapper.toProductListItem(product);
export const toWebProductListResponse = (page: StorefrontProductPage): WebProductListResDto =>
  WebCatalogMapper.toProductListResponse(page);
export const toWebProductDetail = (product: StorefrontProductDetails): WebProductDetailDto =>
  WebCatalogMapper.toProductDetail(product);
