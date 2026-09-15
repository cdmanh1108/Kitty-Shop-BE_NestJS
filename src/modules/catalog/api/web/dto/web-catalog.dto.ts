import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class WebRentalPriceDto {
  @ApiProperty({ example: 3, description: 'Số ngày thuê' })
  days!: number;

  @ApiProperty({ example: 150000, description: 'Giá thuê (VND)' })
  amount!: number;
}

export class WebCategoryDto {
  @ApiProperty({ example: 'b6e82c18-9717-484d-a915-c26663f721d6' })
  id!: string;

  @ApiProperty({ example: 'VAY' })
  code!: string;

  @ApiProperty({ example: 'Váy thiết kế' })
  name!: string;

  @ApiProperty({ example: 'vay-thiet-ke' })
  slug!: string;

  @ApiPropertyOptional({ example: 'Bộ sưu tập váy tiệc và sự kiện' })
  description?: string;
}

export class WebProductVariantSummaryDto {
  @ApiProperty({ example: 'c7f93d29-0828-4b21-b1e4-d2e82e44f3b1' })
  id!: string;

  @ApiProperty({ example: 'VAR-S-WHITE' })
  code!: string;

  @ApiPropertyOptional({ example: 'S' })
  size?: string;

  @ApiPropertyOptional({ example: 'Trắng' })
  color?: string;

  @ApiPropertyOptional({ example: 500000 })
  depositAmount?: number;
}

export class WebProductListItemDto {
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

  @ApiProperty({ type: [String], example: ['https://images.unsplash.com/photo-1'] })
  gallery!: string[];

  @ApiProperty({ example: 'S' })
  size!: string;

  @ApiProperty({ example: 'Trắng' })
  color!: string;

  @ApiProperty({ type: [WebRentalPriceDto] })
  rentalPrices!: WebRentalPriceDto[];

  @ApiProperty({ example: 500000, description: 'Tiền cọc dự kiến (VND)' })
  depositAmount!: number;

  @ApiProperty({ example: 'available' })
  status!: string;

  @ApiProperty({ example: true })
  isRentable!: boolean;
}

export class WebProductDetailDto extends WebProductListItemDto {
  @ApiPropertyOptional({ example: 'Chất liệu lụa satin cao cấp, phù hợp tiệc tối.' })
  description?: string;

  @ApiPropertyOptional({ example: 'https://facebook.com/kitty/posts/123' })
  facebookPostUrl?: string;

  @ApiProperty({ type: [WebProductVariantSummaryDto] })
  variants!: WebProductVariantSummaryDto[];
}

export class WebPaginationMetaDto {
  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: 45 })
  total!: number;

  @ApiProperty({ example: 3 })
  totalPages!: number;
}

export class WebProductListResDto {
  @ApiProperty({ type: [WebProductListItemDto] })
  items!: WebProductListItemDto[];

  @ApiProperty({ type: WebPaginationMetaDto })
  meta!: WebPaginationMetaDto;
}

export class WebProductListQueryDto {
  @ApiPropertyOptional({ description: 'Từ khóa tìm kiếm theo tên, mã hoặc mô tả' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ description: 'Lọc theo slug, mã hoặc id danh mục' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ example: 'S', description: 'Lọc theo kích cỡ' })
  @IsOptional()
  @IsString()
  size?: string;

  @ApiPropertyOptional({ example: 'Trắng', description: 'Lọc theo màu sắc' })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiPropertyOptional({
    example: 'newest',
    enum: ['newest', 'price_asc', 'price_desc', 'name_asc', 'name_desc'],
    description: 'Thứ tự sắp xếp sản phẩm',
  })
  @IsOptional()
  @IsIn(['newest', 'price_asc', 'price_desc', 'name_asc', 'name_desc'])
  sort?: 'newest' | 'price_asc' | 'price_desc' | 'name_asc' | 'name_desc';

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 20, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
