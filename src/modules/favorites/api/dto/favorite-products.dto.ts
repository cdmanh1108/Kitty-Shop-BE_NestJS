import { PRODUCT_KIND, type ProductKind } from '@modules/catalog/public/product-kind';
import { ApiProperty, ApiPropertyOptional, ApiSchema } from '@nestjs/swagger';

// Keep the existing OpenAPI component names while Favorites owns these DTOs.
@ApiSchema({ name: 'WebRentalPriceDto' })
export class FavoriteRentalPriceDto {
  @ApiProperty({ example: 3, description: 'Số ngày thuê' })
  days!: number;

  @ApiProperty({ example: 150000, description: 'Giá thuê (VND)' })
  amount!: number;
}

@ApiSchema({ name: 'WebProductListItemDto' })
export class FavoriteProductListItemDto {
  @ApiPropertyOptional({ enum: Object.values(PRODUCT_KIND) })
  kind?: ProductKind;

  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  id!: string;

  @ApiProperty({ example: 'SP-001' })
  code!: string;

  @ApiProperty({ example: 'dam-da-hoi-trang' })
  slug!: string;

  @ApiProperty({ example: 'Đầm dạ hội trắng lụa cao cấp' })
  name!: string;

  @ApiProperty({ example: 'b6e82c18-9717-484d-a915-c26663f721d6' })
  categoryId!: string;

  @ApiProperty({ example: 'Váy thiết kế' })
  categoryName!: string;

  @ApiProperty({ example: 'https://images.unsplash.com/photo-1' })
  imageUrl!: string;

  @ApiProperty({ example: 'S' })
  size!: string;

  @ApiProperty({ example: 'Trắng' })
  color!: string;

  @ApiProperty({ type: [FavoriteRentalPriceDto] })
  rentalPrices!: FavoriteRentalPriceDto[];

  @ApiProperty({ example: 500000, description: 'Tiền cọc dự kiến (VND)' })
  depositAmount!: number;

  @ApiProperty({ example: true })
  isRentable!: boolean;
}

@ApiSchema({ name: 'WebPaginationMetaDto' })
export class FavoriteProductsPaginationMetaDto {
  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: 45 })
  total!: number;

  @ApiProperty({ example: 3 })
  totalPages!: number;
}

@ApiSchema({ name: 'WebProductListResDto' })
export class FavoriteProductListResDto {
  @ApiProperty({ type: [FavoriteProductListItemDto] })
  items!: FavoriteProductListItemDto[];

  @ApiProperty({ type: FavoriteProductsPaginationMetaDto })
  meta!: FavoriteProductsPaginationMetaDto;
}
