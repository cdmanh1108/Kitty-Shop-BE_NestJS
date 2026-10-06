import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';
import { PRODUCT_KIND, type ProductKind } from '@modules/catalog/domain/product-kind';

export class WebCatalogFiltersQueryDto {
  @ApiPropertyOptional({ enum: Object.values(PRODUCT_KIND) })
  @ValidateIf((_object: WebCatalogFiltersQueryDto, value: unknown) => value !== undefined)
  @IsIn(Object.values(PRODUCT_KIND), { message: 'Loại sản phẩm phải là Sản phẩm hoặc Phụ kiện.' })
  kind?: ProductKind;

  @ApiPropertyOptional({
    description: 'Giới hạn lựa chọn theo slug, mã hoặc id danh mục',
    maxLength: 100,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'Danh mục phải là chuỗi ký tự.' })
  @MaxLength(100, { message: 'Danh mục không được dài quá 100 ký tự.' })
  category?: string;
}

export class WebSizeFilterOptionDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'M' })
  code!: string;

  @ApiProperty({ example: 'M' })
  name!: string;

  @ApiProperty({ example: 2 })
  sortOrder!: number;
}

export class WebColorFilterOptionDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'TRANG' })
  code!: string;

  @ApiProperty({ example: 'Trắng' })
  name!: string;

  @ApiProperty({ type: String, nullable: true, example: '#FFFFFF' })
  hexColor!: string | null;
}

export class WebCatalogFiltersResDto {
  @ApiProperty({
    type: [WebSizeFilterOptionDto],
    description: 'Kích thước hoạt động có dùng trên phân loại công khai đang cho thuê',
  })
  sizes!: WebSizeFilterOptionDto[];

  @ApiProperty({
    type: [WebColorFilterOptionDto],
    description: 'Màu hoạt động có dùng trên phân loại công khai đang cho thuê',
  })
  colors!: WebColorFilterOptionDto[];
}
