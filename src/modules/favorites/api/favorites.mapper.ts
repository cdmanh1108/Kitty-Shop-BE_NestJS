import type { StorefrontProductPage } from '@modules/catalog/public/storefront-catalog';
import type {
  FavoriteProductListItemDto,
  FavoriteProductListResDto,
} from './dto/favorite-products.dto';

export const FavoritesMapper = {
  toProductListResponse(page: StorefrontProductPage): FavoriteProductListResDto {
    return {
      items: page.items.map(
        (product): FavoriteProductListItemDto => ({
          allowFreeAccessory: product.allowFreeAccessory,
          id: product.id,
          code: product.code,
          slug: product.slug,
          name: product.name,
          categoryId: product.categoryId,
          categoryName: product.categoryName,
          imageUrl: product.imageUrl,
          size: product.size,
          color: product.color,
          rentalPrices: product.rentalPrices.map((price) => ({
            days: price.days,
            amount: price.amount,
          })),
          depositAmount: product.depositAmount,
          isRentable: product.isRentable,
        }),
      ),
      meta: {
        page: page.meta.page,
        limit: page.meta.limit,
        total: page.meta.total,
        totalPages: page.meta.totalPages,
      },
    };
  },
};
