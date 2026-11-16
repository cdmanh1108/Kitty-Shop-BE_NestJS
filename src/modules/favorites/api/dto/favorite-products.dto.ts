import { ApiProperty, ApiPropertyOptional, ApiSchema } from '@nestjs/swagger';

@ApiSchema({ name: 'WebProductListItemDto' })
export class FavoriteProductListItemDto {
  @ApiProperty({ type: Number, nullable: true }) rentalPriceOverride!: number | null;
  @ApiProperty({ type: Number, minimum: 0 }) rentalPrice!: number;
  @ApiPropertyOptional({ type: Boolean })
  allowFreeAccessory?: boolean;

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
