import { PaginationQueryDto } from '@common/dto/pagination.query.dto';
import { PaginationMetaResDto } from '@common/dto/response.dto';
import { PRODUCT_STATUS } from '@modules/catalog/domain/catalog-status';
import { PRODUCT_KIND, type ProductKind } from '@modules/catalog/domain/product-kind';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, Max, ValidateIf } from 'class-validator';

/** Query parameters for the admin product listing and form lookups. */
export class ProductListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: Object.values(PRODUCT_KIND),
    description: 'Loại sản phẩm; bỏ qua để lấy tất cả.',
  })
  @ValidateIf((_object: ProductListQueryDto, value: unknown) => value !== undefined)
  @IsIn(Object.values(PRODUCT_KIND), { message: 'Loại sản phẩm phải là Sản phẩm hoặc Phụ kiện.' })
  kind?: ProductKind;

  @ApiPropertyOptional()
  @IsString({ message: 'Từ khóa tìm kiếm phải là chuỗi ký tự.' })
  @IsOptional()
  search?: string;

  @ApiPropertyOptional()
  @IsUUID(undefined, { message: 'Mã danh mục phải là UUID hợp lệ.' })
  @IsOptional()
  categoryId?: string;

  @ApiPropertyOptional({ enum: Object.values(PRODUCT_STATUS) })
  @IsIn(Object.values(PRODUCT_STATUS), { message: 'Trạng thái không hợp lệ.' })
  @IsOptional()
  status?: string;
}

export class ProductLookupQueryDto extends ProductListQueryDto {
  @ApiPropertyOptional()
  @IsUUID(undefined, { message: 'Mã sản phẩm phải là UUID hợp lệ.' })
  @IsOptional()
  productId?: string;

  @ApiPropertyOptional({ type: Number, maximum: 50, default: 20 })
  @Max(50, { message: 'Số kết quả mỗi trang phải nhỏ hơn hoặc bằng $constraint1.' })
  override limit = 20;
}

export class ProductLookupRateResDto {
  @ApiProperty() durationDays!: number;
  @ApiProperty() price!: number;
}

export class ProductLookupVariantResDto {
  @ApiProperty() id!: string;
  @ApiProperty() variantCode!: string;
  @ApiProperty({ type: String, nullable: true }) sizeName!: string | null;
  @ApiProperty({ type: String, nullable: true }) colorName!: string | null;
  @ApiPropertyOptional({ type: [ProductLookupRateResDto] })
  rentalRates?: ProductLookupRateResDto[];
}

export class ProductLookupItemResDto {
  @ApiProperty({ enum: Object.values(PRODUCT_KIND) }) kind!: ProductKind;
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty() status!: string;
  @ApiPropertyOptional({ type: [ProductLookupRateResDto] })
  rentalRates?: ProductLookupRateResDto[];
  @ApiProperty({ type: [ProductLookupVariantResDto] }) variants!: ProductLookupVariantResDto[];
}

export class ProductLookupPageResDto {
  @ApiProperty({ type: [ProductLookupItemResDto] }) items!: ProductLookupItemResDto[];
  @ApiProperty({ type: PaginationMetaResDto }) meta!: PaginationMetaResDto;
}
