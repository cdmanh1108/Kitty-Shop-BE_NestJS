import { Transform } from 'class-transformer';
import { PaginationQueryDto } from '@common/dto/pagination.query.dto';
import { PaginationMetaResDto } from '@common/dto/response.dto';
import { PRODUCT_STATUS } from '@modules/catalog/domain/catalog-status';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, Max, ValidateIf } from 'class-validator';

const productStatuses = Object.values(PRODUCT_STATUS);
const productListStatuses = [...productStatuses, 'ARCHIVED'];

class ProductSearchQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    type: Boolean,
    description: 'Cho phép chọn thuê kèm miễn phí trong hạn mức của đơn.',
  })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean({ message: 'Tùy chọn thuê kèm miễn phí chưa hợp lệ. Vui lòng chọn lại.' })
  allowFreeAccessory?: boolean;

  @ApiPropertyOptional()
  @IsString({ message: 'Từ khóa tìm kiếm nhập chưa hợp lệ. Vui lòng kiểm tra lại.' })
  @IsOptional()
  search?: string;

  @ApiPropertyOptional()
  @IsUUID(undefined, { message: 'Danh mục không hợp lệ. Vui lòng chọn lại.' })
  @IsOptional()
  categoryId?: string;
}

export class ProductListQueryDto extends ProductSearchQueryDto {
  @ApiPropertyOptional({ enum: productListStatuses })
  @IsIn(productListStatuses, { message: 'Trạng thái không hợp lệ.' })
  @IsOptional()
  status?: string;
}

export class ProductLookupQueryDto extends ProductSearchQueryDto {
  @ApiPropertyOptional({ enum: productStatuses })
  @IsIn(productStatuses, { message: 'Trạng thái không hợp lệ.' })
  @IsOptional()
  status?: string;

  @ApiPropertyOptional()
  @IsUUID(undefined, { message: 'Sản phẩm không hợp lệ. Vui lòng chọn lại.' })
  @IsOptional()
  productId?: string;

  @ApiPropertyOptional({ type: Number, maximum: 50, default: 20 })
  @Max(50, { message: 'Số kết quả mỗi trang phải nhỏ hơn hoặc bằng $constraint1.' })
  override limit = 20;
}

export class ProductLookupVariantResDto {
  @ApiProperty() id!: string;
  @ApiProperty() variantCode!: string;
  @ApiProperty({ type: String, nullable: true }) sizeName!: string | null;
  @ApiProperty({ type: String, nullable: true }) colorName!: string | null;
}

export class ProductLookupItemResDto {
  @ApiProperty({ type: String, nullable: true }) rentalPriceOverride!: string | null;
  @ApiProperty({ type: Boolean }) allowFreeAccessory!: boolean;
  @ApiProperty({ type: Number, minimum: 0, default: 1 }) freeAccessoryLimit!: number;
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty() status!: string;
  @ApiProperty({ type: [ProductLookupVariantResDto] }) variants!: ProductLookupVariantResDto[];
}

export class ProductLookupPageResDto {
  @ApiProperty({ type: [ProductLookupItemResDto] }) items!: ProductLookupItemResDto[];
  @ApiProperty({ type: PaginationMetaResDto }) meta!: PaginationMetaResDto;
}
