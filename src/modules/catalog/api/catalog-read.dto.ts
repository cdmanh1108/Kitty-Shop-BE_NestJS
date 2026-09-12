import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID, Max } from 'class-validator';
import { PaginationQueryDto } from '@common/dto/pagination.query.dto';
import { PaginationMetaResDto } from '@common/dto/response.dto';

export class ProductListItemResDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty() status!: string;
  @ApiProperty() categoryId!: string;
  @ApiProperty() categoryName!: string;
  @ApiProperty({ type: String, nullable: true }) imageUrl!: string | null;
  @ApiProperty({ type: String }) defaultDepositAmount!: string;
  @ApiProperty() variantCount!: number;
  @ApiProperty({ type: [String] }) sizes!: string[];
  @ApiProperty({ type: [String] }) colors!: string[];
  @ApiProperty({ type: String, nullable: true }) minPrice!: string | null;
  @ApiProperty({ type: String, nullable: true }) maxPrice!: string | null;
}

export class ProductLookupVariantResDto {
  @ApiProperty() id!: string;
  @ApiProperty() variantCode!: string;
  @ApiProperty({ type: String, nullable: true }) sizeName!: string | null;
  @ApiProperty({ type: String, nullable: true }) colorName!: string | null;
}
export class ProductLookupItemResDto {
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
export class InventorySummaryResDto {
  @ApiProperty() total!: number;
  @ApiProperty() available!: number;
  @ApiProperty() occupied!: number;
  @ApiProperty() needsAttention!: number;
}
export class InventoryHistoryQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsUUID(undefined, { message: 'Mã sản phẩm phải là UUID hợp lệ.' })
  @IsOptional()
  productId?: string;
  @ApiPropertyOptional()
  @IsUUID(undefined, { message: 'Mã món đồ phải là UUID hợp lệ.' })
  @IsOptional()
  inventoryItemId?: string;
  @ApiPropertyOptional({ type: Number, maximum: 100, default: 20 })
  @Max(100, { message: 'Số kết quả mỗi trang phải nhỏ hơn hoặc bằng $constraint1.' })
  override limit = 20;
}
export class InventoryHistoryItemResDto {
  @ApiProperty() id!: string;
  @ApiProperty() inventoryItemId!: string;
  @ApiProperty() sku!: string;
  @ApiProperty() productName!: string;
  @ApiProperty({ type: String, nullable: true }) fromStatus!: string | null;
  @ApiProperty() toStatus!: string;
  @ApiProperty({ type: String, nullable: true }) reason!: string | null;
  @ApiProperty() changedAt!: string;
}
export class InventoryHistoryPageResDto {
  @ApiProperty({ type: [InventoryHistoryItemResDto] }) items!: InventoryHistoryItemResDto[];
  @ApiProperty({ type: PaginationMetaResDto }) meta!: PaginationMetaResDto;
}
