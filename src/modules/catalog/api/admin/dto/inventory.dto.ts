import { PaginationMetaResDto } from '@common/dto/response.dto';
import { PaginationQueryDto } from '@common/dto/pagination.query.dto';
import { INVENTORY_STATUS, type InventoryStatus } from '@modules/catalog/domain/catalog-status';
import { ApiProperty, ApiPropertyOptional, PickType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { ColorSummaryResDto, ShopLocationSummaryResDto, SizeSummaryResDto } from './category.dto';
import { RentalRateResDto } from './product.dto';

export class AddInventoryReqDto {
  @ApiProperty()
  @IsUUID(undefined, { message: 'Mã biến thể phải là UUID hợp lệ.' })
  variantId!: string;
  @ApiPropertyOptional()
  @IsUUID(undefined, { message: 'Mã địa điểm phải là UUID hợp lệ.' })
  @IsOptional()
  locationId?: string;
  @ApiPropertyOptional({ example: 'AUR-S-R-001' })
  @IsString({ message: 'Mã SKU phải là chuỗi ký tự.' })
  @IsOptional()
  sku?: string;
  @ApiPropertyOptional()
  @IsString({ message: 'Mã vạch phải là chuỗi ký tự.' })
  @IsOptional()
  barcode?: string;
  @ApiPropertyOptional()
  @Type(() => Number)
  @IsNumber(undefined, { message: 'Giá mua phải là số hợp lệ.' })
  @Min(0, { message: 'Giá mua phải lớn hơn hoặc bằng $constraint1.' })
  @IsOptional()
  purchasePrice?: number;
  @ApiPropertyOptional()
  @IsDateString(undefined, { message: 'Ngày mua phải là ngày giờ hợp lệ theo định dạng ISO 8601.' })
  @IsOptional()
  purchaseDate?: string;
  @ApiPropertyOptional()
  @IsString({ message: 'Ghi chú phải là chuỗi ký tự.' })
  @IsOptional()
  notes?: string;
}

export class UpdateInventoryStatusReqDto {
  @ApiProperty({ enum: Object.values(INVENTORY_STATUS) })
  @IsIn(Object.values(INVENTORY_STATUS), { message: 'Trạng thái không hợp lệ.' })
  status!: InventoryStatus;
  @ApiPropertyOptional({ enum: Object.values(INVENTORY_STATUS) })
  @IsIn(Object.values(INVENTORY_STATUS), {
    message: 'Trạng thái kho trước khi thay đổi không hợp lệ.',
  })
  @IsOptional()
  expectedFromStatus?: InventoryStatus;
  @ApiPropertyOptional()
  @IsString({ message: 'Tình trạng phải là chuỗi ký tự.' })
  @IsOptional()
  condition?: string;
  @ApiPropertyOptional()
  @IsString({ message: 'Lý do phải là chuỗi ký tự.' })
  @IsOptional()
  reason?: string;
  @ApiPropertyOptional()
  @IsString({ message: 'Ghi chú phải là chuỗi ký tự.' })
  @IsOptional()
  notes?: string;
}

export class ArchiveInventoryItemReqDto {
  @ApiPropertyOptional()
  @IsString({ message: 'Lý do phải là chuỗi ký tự.' })
  @IsOptional()
  reason?: string;
}

export class InventoryListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsUUID(undefined, { message: 'Mã biến thể phải là UUID hợp lệ.' })
  @IsOptional()
  variantId?: string;
  @ApiPropertyOptional()
  @IsUUID(undefined, { message: 'Mã sản phẩm phải là UUID hợp lệ.' })
  @IsOptional()
  productId?: string;
  @ApiPropertyOptional()
  @IsUUID(undefined, { message: 'Mã danh mục phải là UUID hợp lệ.' })
  @IsOptional()
  categoryId?: string;
  @ApiPropertyOptional({ enum: Object.values(INVENTORY_STATUS) })
  @IsIn(Object.values(INVENTORY_STATUS), { message: 'Trạng thái không hợp lệ.' })
  @IsOptional()
  status?: string;
  @ApiPropertyOptional()
  @IsString({ message: 'Từ khóa tìm kiếm phải là chuỗi ký tự.' })
  @IsOptional()
  search?: string;
}

export class AvailabilityQueryDto {
  @ApiProperty()
  @IsUUID(undefined, { message: 'Mã biến thể phải là UUID hợp lệ.' })
  variantId!: string;
  @ApiProperty()
  @IsDateString(undefined, {
    message: 'Thời gian bắt đầu phải là ngày giờ hợp lệ theo định dạng ISO 8601.',
  })
  from!: string;
  @ApiProperty()
  @IsDateString(undefined, {
    message: 'Thời gian kết thúc phải là ngày giờ hợp lệ theo định dạng ISO 8601.',
  })
  until!: string;
}
export class InventoryProductSummaryResDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty() categoryId!: string;
}

export class InventoryVariantSummaryResDto {
  @ApiProperty() id!: string;
  @ApiProperty() variantCode!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) sizeId!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) colorId!: string | null;
  @ApiProperty({ type: InventoryProductSummaryResDto }) product!: InventoryProductSummaryResDto;
  @ApiPropertyOptional({ nullable: true, type: SizeSummaryResDto }) size!: SizeSummaryResDto | null;
  @ApiPropertyOptional({ nullable: true, type: ColorSummaryResDto })
  color!: ColorSummaryResDto | null;
  @ApiPropertyOptional({ type: [RentalRateResDto] }) rentalRates?: RentalRateResDto[];
}

export class InventoryStatusHistoryResDto {
  @ApiProperty() id!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) fromStatus!: string | null;
  @ApiProperty() toStatus!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) reason!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) notes!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) changedBy!: string | null;
  @ApiProperty() changedAt!: string;
}

export class InventoryCurrentRentalResDto {
  @ApiProperty() orderId!: string;
  @ApiProperty() orderNumber!: string;
  @ApiProperty() status!: string;
  @ApiProperty() reservedFrom!: string;
  @ApiProperty() reservedUntil!: string;
}

export class InventoryAllocationOrderCustomerResDto {
  @ApiProperty() fullName!: string;
  @ApiProperty() phone!: string;
}

export class InventoryAllocationOrderResDto {
  @ApiProperty() id!: string;
  @ApiProperty() orderNumber!: string;
  @ApiProperty() status!: string;
  @ApiProperty({ type: InventoryAllocationOrderCustomerResDto })
  customer!: InventoryAllocationOrderCustomerResDto;
}

export class InventoryAllocationResDto {
  @ApiProperty() id!: string;
  @ApiProperty() status!: string;
  @ApiProperty() reservedFrom!: string;
  @ApiProperty() reservedUntil!: string;
  @ApiProperty({ type: InventoryAllocationOrderResDto }) order!: InventoryAllocationOrderResDto;
}

export class InventoryItemResDto {
  @ApiProperty() id!: string;
  @ApiProperty() variantId!: string;
  @ApiProperty() sku!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) barcode!: string | null;
  @ApiProperty({ enum: Object.values(INVENTORY_STATUS) }) currentStatus!: string;
  @ApiProperty() condition!: string;
  @ApiProperty({ enum: ['FREE', 'RESERVED', 'RENTED'] }) occupancyStatus!: string;
  @ApiProperty({ type: [String] }) allowedManualTransitions!: string[];
  @ApiPropertyOptional({ nullable: true, type: InventoryCurrentRentalResDto })
  currentRental!: InventoryCurrentRentalResDto | null;
  @ApiPropertyOptional({ nullable: true, type: String }) purchasePrice!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) notes!: string | null;
  @ApiProperty({ type: InventoryVariantSummaryResDto }) variant!: InventoryVariantSummaryResDto;
  @ApiPropertyOptional({ nullable: true, type: ShopLocationSummaryResDto })
  location!: ShopLocationSummaryResDto | null;
  @ApiPropertyOptional({ type: [InventoryStatusHistoryResDto] })
  statusHistory?: InventoryStatusHistoryResDto[];
  @ApiPropertyOptional({ type: [InventoryAllocationResDto] })
  allocations?: InventoryAllocationResDto[];
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;
}

export class InventoryListItemResDto extends PickType(InventoryItemResDto, [
  'id',
  'variantId',
  'sku',
  'currentStatus',
  'condition',
  'occupancyStatus',
  'allowedManualTransitions',
  'currentRental',
  'variant',
  'updatedAt',
] as const) {}

export class InventoryPageResDto {
  @ApiProperty({ type: [InventoryListItemResDto] }) items!: InventoryListItemResDto[];
  @ApiProperty({ type: PaginationMetaResDto }) meta!: PaginationMetaResDto;
}
