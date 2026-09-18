import { PaginationQueryDto } from '@common/dto/pagination.query.dto';
import { PRODUCT_STATUS } from '@modules/catalog/domain/catalog-status';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, Max } from 'class-validator';

/** Query parameters for the admin product listing and form lookups. */
export class ProductListQueryDto extends PaginationQueryDto {
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
