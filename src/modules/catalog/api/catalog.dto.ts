import { ProductListItemResDto } from './catalog-read.dto';
import {
  type InventoryStatus,
  PRODUCT_STATUS,
  INVENTORY_STATUS,
} from '@modules/catalog/domain/catalog-status';

import { ApiProperty, ApiPropertyOptional, PickType } from '@nestjs/swagger';
import { Transform, Type, type TransformFnParams } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  MaxLength,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '@common/dto/pagination.query.dto';
import { PaginationMetaResDto } from '@common/dto/response.dto';

const trimString = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() : value;
const normalizeCode = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export class RentalRateReqDto {
  @ApiProperty({ example: 1 }) @Type(() => Number) @IsInt() @Min(1) @Max(365) durationDays!: number;
  @ApiProperty({ example: 300000 }) @Type(() => Number) @IsNumber() @Min(0) price!: number;
}

export class ProductVariantReqDto {
  @ApiProperty({ example: 'AURORA-S-RED' }) @IsString() variantCode!: string;
  @ApiPropertyOptional() @IsUUID() @IsOptional() sizeId?: string;
  @ApiPropertyOptional() @IsUUID() @IsOptional() colorId?: string;
  @ApiPropertyOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  depositAmountOverride?: number;
  @ApiPropertyOptional({ type: Number, default: 1, minimum: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  inventoryCount = 1;
  @ApiPropertyOptional({ example: 'AUR-S-R' }) @IsString() @IsOptional() skuPrefix?: string;
  @ApiProperty({ type: [RentalRateReqDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RentalRateReqDto)
  rentalRates!: RentalRateReqDto[];
}

export class ProductMediaReqDto {
  @ApiProperty() @IsUrl() url!: string;
  @ApiPropertyOptional() @IsString() @IsOptional() altText?: string;
  @ApiPropertyOptional({ type: Boolean, default: false }) @IsBoolean() @IsOptional() isPrimary =
    false;
  @ApiPropertyOptional({ type: Number, default: 0 })
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  sortOrder = 0;
}

export class CreateProductReqDto {
  @ApiProperty({ example: 'DRESS-AURORA' }) @IsString() code!: string;
  @ApiProperty({ example: 'Váy Aurora Satin' }) @IsString() name!: string;
  @ApiProperty() @IsUUID() categoryId!: string;
  @ApiPropertyOptional() @IsString() @IsOptional() description?: string;
  @ApiPropertyOptional({ type: Number, default: 0, minimum: 0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  defaultDepositAmount = 0;
  @ApiPropertyOptional({ nullable: true, type: Number, minimum: 0, example: 1500000 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  replacementValue?: number | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: 'https://www.facebook.com/share/p/123456/',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && value.trim() === ''
      ? null
      : typeof value === 'string'
        ? value.trim()
        : value,
  )
  @ValidateIf((o: CreateProductReqDto) => o.facebookPostUrl != null)
  @IsUrl(
    { protocols: ['http', 'https'], require_protocol: true },
    { message: 'facebookPostUrl must be a valid HTTP/HTTPS URL' },
  )
  @IsOptional()
  facebookPostUrl?: string | null;
  @ApiPropertyOptional({ type: Boolean, default: false }) @IsBoolean() @IsOptional() isPublic =
    false;
  @ApiProperty({ type: [ProductVariantReqDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ProductVariantReqDto)
  variants!: ProductVariantReqDto[];
  @ApiPropertyOptional({ type: [ProductMediaReqDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductMediaReqDto)
  @IsOptional()
  media: ProductMediaReqDto[] = [];
}

export class UpdateProductReqDto {
  @ApiPropertyOptional() @IsString() @IsOptional() name?: string;
  @ApiPropertyOptional() @IsUUID() @IsOptional() categoryId?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() description?: string;
  @ApiPropertyOptional({ type: Number, minimum: 0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  defaultDepositAmount?: number;
  @ApiPropertyOptional({ nullable: true, type: Number, minimum: 0, example: 1500000 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  replacementValue?: number | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: 'https://www.facebook.com/share/p/123456/',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && value.trim() === ''
      ? null
      : typeof value === 'string'
        ? value.trim()
        : value,
  )
  @ValidateIf((o: UpdateProductReqDto) => o.facebookPostUrl != null)
  @IsUrl(
    { protocols: ['http', 'https'], require_protocol: true },
    { message: 'facebookPostUrl must be a valid HTTP/HTTPS URL' },
  )
  @IsOptional()
  facebookPostUrl?: string | null;
  @ApiPropertyOptional() @IsBoolean() @IsOptional() isPublic?: boolean;
  @ApiPropertyOptional() @IsBoolean() @IsOptional() isRentable?: boolean;
  @ApiPropertyOptional({ enum: Object.values(PRODUCT_STATUS) })
  @IsIn(Object.values(PRODUCT_STATUS))
  @IsOptional()
  status?: string;
}

export class CreateCategoryReqDto {
  @ApiPropertyOptional({ example: 'DRESS' })
  @Transform(normalizeCode)
  @IsString()
  @Matches(/^[A-Z0-9_]+$/)
  @MaxLength(50)
  @IsOptional()
  code?: string;
  @ApiProperty()
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;
  @ApiPropertyOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(2000)
  @IsOptional()
  description?: string;
  @ApiPropertyOptional({ enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' })
  @IsIn(['ACTIVE', 'INACTIVE'])
  @IsOptional()
  status?: 'ACTIVE' | 'INACTIVE';
  @ApiPropertyOptional({ type: Number, default: 0, minimum: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  sortOrder?: number;
}

export class UpdateCategoryReqDto {
  @ApiPropertyOptional()
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @IsOptional()
  name?: string;
  @ApiPropertyOptional({ nullable: true, type: String })
  @Transform(trimString)
  @IsString()
  @MaxLength(2000)
  @IsOptional()
  description?: string | null;
  @ApiPropertyOptional({ enum: ['ACTIVE', 'INACTIVE'] })
  @IsIn(['ACTIVE', 'INACTIVE'])
  @IsOptional()
  status?: 'ACTIVE' | 'INACTIVE';
  @ApiPropertyOptional({ type: Number, minimum: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  sortOrder?: number;
}

export class CategoryListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional() @IsString() @IsOptional() search?: string;
  @ApiPropertyOptional({ enum: ['ACTIVE', 'INACTIVE'] })
  @IsIn(['ACTIVE', 'INACTIVE'])
  @IsOptional()
  status?: 'ACTIVE' | 'INACTIVE';
}

export class CreateSizeReqDto {
  @ApiProperty() @IsString() code!: string;
  @ApiProperty() @IsString() name!: string;
  @ApiPropertyOptional({ type: Number, default: 0 })
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  sortOrder = 0;
}

export class CreateColorReqDto {
  @ApiProperty() @IsString() code!: string;
  @ApiProperty() @IsString() name!: string;
  @ApiPropertyOptional({ example: '#000000' }) @IsString() @IsOptional() hexColor?: string;
}

export class AddVariantReqDto extends ProductVariantReqDto {}

export class UpsertRentalRateReqDto extends RentalRateReqDto {}

export class ProductListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional() @IsString() @IsOptional() search?: string;
  @ApiPropertyOptional() @IsUUID() @IsOptional() categoryId?: string;
  @ApiPropertyOptional({ enum: Object.values(PRODUCT_STATUS) })
  @IsIn(Object.values(PRODUCT_STATUS))
  @IsOptional()
  status?: string;
}

export class AddInventoryReqDto {
  @ApiProperty() @IsUUID() variantId!: string;
  @ApiPropertyOptional() @IsUUID() @IsOptional() locationId?: string;
  @ApiPropertyOptional({ example: 'AUR-S-R-001' }) @IsString() @IsOptional() sku?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() barcode?: string;
  @ApiPropertyOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  purchasePrice?: number;
  @ApiPropertyOptional() @IsDateString() @IsOptional() purchaseDate?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() notes?: string;
}

export class UpdateInventoryStatusReqDto {
  @ApiProperty({ enum: Object.values(INVENTORY_STATUS) })
  @IsIn(Object.values(INVENTORY_STATUS))
  status!: InventoryStatus;
  @ApiPropertyOptional({ enum: Object.values(INVENTORY_STATUS) })
  @IsIn(Object.values(INVENTORY_STATUS))
  @IsOptional()
  expectedFromStatus?: InventoryStatus;
  @ApiPropertyOptional() @IsString() @IsOptional() condition?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() reason?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() notes?: string;
}

export class ArchiveInventoryItemReqDto {
  @ApiPropertyOptional() @IsString() @IsOptional() reason?: string;
}

export class InventoryListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional() @IsUUID() @IsOptional() variantId?: string;
  @ApiPropertyOptional() @IsUUID() @IsOptional() productId?: string;
  @ApiPropertyOptional() @IsUUID() @IsOptional() categoryId?: string;
  @ApiPropertyOptional({ enum: Object.values(INVENTORY_STATUS) })
  @IsIn(Object.values(INVENTORY_STATUS))
  @IsOptional()
  status?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() search?: string;
}

export class AvailabilityQueryDto {
  @ApiProperty() @IsUUID() variantId!: string;
  @ApiProperty() @IsDateString() from!: string;
  @ApiProperty() @IsDateString() until!: string;
}

export class CategorySummaryResDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) description!: string | null;
}

export class SizeSummaryResDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty() sortOrder!: number;
}

export class ColorSummaryResDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) hexColor!: string | null;
}

export class RentalRateResDto {
  @ApiProperty() id!: string;
  @ApiProperty() durationDays!: number;
  @ApiProperty({ type: String, example: '50000.00' }) price!: string;
  @ApiProperty() currency!: string;
  @ApiProperty() isActive!: boolean;
}

export class ProductMediaResDto {
  @ApiProperty() id!: string;
  @ApiProperty() url!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) storageKey?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) altText!: string | null;
  @ApiProperty() isPrimary!: boolean;
  @ApiProperty() sortOrder!: number;
}

export class VariantInventoryCountDto {
  @ApiProperty() inventoryItems!: number;
}

export class ProductVariantResDto {
  @ApiProperty() id!: string;
  @ApiProperty() variantCode!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) sizeId!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) colorId!: string | null;
  @ApiPropertyOptional({ nullable: true, type: SizeSummaryResDto }) size!: SizeSummaryResDto | null;
  @ApiPropertyOptional({ nullable: true, type: ColorSummaryResDto })
  color!: ColorSummaryResDto | null;
  @ApiPropertyOptional({ nullable: true, type: String }) depositAmountOverride!: string | null;
  @ApiProperty() status!: string;
  @ApiPropertyOptional({ type: [RentalRateResDto] }) rentalRates?: RentalRateResDto[];
  @ApiPropertyOptional({ type: VariantInventoryCountDto }) _count?: VariantInventoryCountDto;
  @ApiPropertyOptional({ type: [Object] }) inventoryItems?: object[];
}

export class ProductCategorySummaryResDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: ['ACTIVE', 'INACTIVE'] }) status!: 'ACTIVE' | 'INACTIVE';
}

export class ProductResDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty() categoryId!: string;
  @ApiPropertyOptional({ type: ProductCategorySummaryResDto })
  category?: ProductCategorySummaryResDto;
  @ApiProperty() status!: string;
  @ApiProperty() isRentable!: boolean;
  @ApiProperty() isPublic!: boolean;
  @ApiProperty({ type: String, example: '500000.00' }) defaultDepositAmount!: string;
  @ApiPropertyOptional({ nullable: true, type: String, example: '1500000.00' }) replacementValue!:
    | string
    | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: 'https://www.facebook.com/share/p/...',
  })
  facebookPostUrl!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) description!: string | null;
  @ApiProperty({ type: [ProductVariantResDto] }) variants!: ProductVariantResDto[];
  @ApiProperty({ type: [ProductMediaResDto] }) media!: ProductMediaResDto[];
  @ApiPropertyOptional({ type: [RentalRateResDto] }) rentalRates?: RentalRateResDto[];
  @ApiPropertyOptional() createdAt?: string;
  @ApiPropertyOptional() updatedAt?: string;
}

export class ProductPageResDto {
  @ApiProperty({ type: [ProductListItemResDto] }) items!: ProductListItemResDto[];
  @ApiProperty({ type: PaginationMetaResDto }) meta!: PaginationMetaResDto;
}

export class ShopLocationSummaryResDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty() isPrimary!: boolean;
}

export class CategoryLookupResDto extends CategorySummaryResDto {
  @ApiProperty() productCount!: number;
}

export class CategoryOptionResDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: ['ACTIVE', 'INACTIVE'] }) status!: 'ACTIVE' | 'INACTIVE';
}

export class CategoryOptionsQueryDto {
  @ApiPropertyOptional({ type: Boolean, default: false })
  @Transform(({ value }: TransformFnParams) => value === true || value === 'true')
  @IsBoolean()
  @IsOptional()
  includeInactive = false;
}

export class CategoryResDto extends CategorySummaryResDto {
  @ApiProperty({ enum: ['ACTIVE', 'INACTIVE'] }) status!: 'ACTIVE' | 'INACTIVE';
  @ApiProperty() sortOrder!: number;
  @ApiProperty() productCount!: number;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}

export class CategoryPageResDto {
  @ApiProperty({ type: [CategoryResDto] }) items!: CategoryResDto[];
  @ApiProperty({ type: PaginationMetaResDto }) meta!: PaginationMetaResDto;
}

export class CatalogLookupsResDto {
  @ApiProperty({ type: [CategoryLookupResDto] }) categories!: CategoryLookupResDto[];
  @ApiProperty({ type: [SizeSummaryResDto] }) sizes!: SizeSummaryResDto[];
  @ApiProperty({ type: [ColorSummaryResDto] }) colors!: ColorSummaryResDto[];
  @ApiProperty({ type: [ShopLocationSummaryResDto] }) locations!: ShopLocationSummaryResDto[];
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

export class ProductLookupQueryDto extends ProductListQueryDto {
  @ApiPropertyOptional() @IsUUID() @IsOptional() productId?: string;
  @ApiPropertyOptional({ type: Number, maximum: 50, default: 20 }) @Max(50) override limit = 20;
}
