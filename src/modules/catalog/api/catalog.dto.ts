import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '@common/dto/pagination.query.dto';
import { PaginationMetaResDto } from '@common/dto/response.dto';

export class RentalRateReqDto {
  @ApiProperty({ example: 1 }) @Type(() => Number) @IsInt() @Min(1) @Max(365) durationDays!: number;
  @ApiProperty({ example: 300000 }) @Type(() => Number) @IsNumber() @Min(0) price!: number;
}

export class ProductVariantReqDto {
  @ApiProperty({ example: 'AURORA-S-RED' }) @IsString() variantCode!: string;
  @ApiPropertyOptional() @IsUUID() @IsOptional() sizeId?: string;
  @ApiPropertyOptional() @IsUUID() @IsOptional() colorId?: string;
  @ApiPropertyOptional() @Type(() => Number) @IsNumber() @Min(0) @IsOptional() depositAmountOverride?: number;
  @ApiPropertyOptional({ default: 1, minimum: 0 }) @Type(() => Number) @IsInt() @Min(0) @IsOptional() inventoryCount = 1;
  @ApiPropertyOptional({ example: 'AUR-S-R' }) @IsString() @IsOptional() skuPrefix?: string;
  @ApiProperty({ type: [RentalRateReqDto] }) @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => RentalRateReqDto) rentalRates!: RentalRateReqDto[];
}

export class ProductMediaReqDto {
  @ApiProperty() @IsUrl() url!: string;
  @ApiPropertyOptional() @IsString() @IsOptional() altText?: string;
  @ApiPropertyOptional({ default: false }) @IsBoolean() @IsOptional() isPrimary = false;
  @ApiPropertyOptional({ default: 0 }) @Type(() => Number) @IsInt() @IsOptional() sortOrder = 0;
}

export class CreateProductReqDto {
  @ApiProperty({ example: 'DRESS-AURORA' }) @IsString() code!: string;
  @ApiProperty({ example: 'Váy Aurora Satin' }) @IsString() name!: string;
  @ApiProperty() @IsUUID() categoryId!: string;
  @ApiPropertyOptional() @IsString() @IsOptional() description?: string;
  @ApiPropertyOptional({ default: 0 }) @Type(() => Number) @IsNumber() @Min(0) @IsOptional() defaultDepositAmount = 0;
  @ApiPropertyOptional({ default: false }) @IsBoolean() @IsOptional() isPublic = false;
  @ApiProperty({ type: [ProductVariantReqDto] }) @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => ProductVariantReqDto) variants!: ProductVariantReqDto[];
  @ApiPropertyOptional({ type: [ProductMediaReqDto] }) @IsArray() @ValidateNested({ each: true }) @Type(() => ProductMediaReqDto) @IsOptional() media: ProductMediaReqDto[] = [];
}

export class UpdateProductReqDto {
  @ApiPropertyOptional() @IsString() @IsOptional() name?: string;
  @ApiPropertyOptional() @IsUUID() @IsOptional() categoryId?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() description?: string;
  @ApiPropertyOptional() @Type(() => Number) @IsNumber() @Min(0) @IsOptional() defaultDepositAmount?: number;
  @ApiPropertyOptional() @IsBoolean() @IsOptional() isPublic?: boolean;
  @ApiPropertyOptional() @IsBoolean() @IsOptional() isRentable?: boolean;
  @ApiPropertyOptional({ enum: ['ACTIVE', 'INACTIVE'] }) @IsIn(['ACTIVE', 'INACTIVE']) @IsOptional() status?: string;
}

export class CreateCategoryReqDto {
  @ApiProperty() @IsString() code!: string;
  @ApiProperty() @IsString() name!: string;
  @ApiPropertyOptional() @IsUUID() @IsOptional() parentId?: string;
}

export class CreateSizeReqDto {
  @ApiProperty() @IsString() code!: string;
  @ApiProperty() @IsString() name!: string;
  @ApiPropertyOptional({ default: 0 }) @Type(() => Number) @IsInt() @IsOptional() sortOrder = 0;
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
  @ApiPropertyOptional({ enum: ['ACTIVE', 'INACTIVE'] }) @IsIn(['ACTIVE', 'INACTIVE']) @IsOptional() status?: string;
}

export class AddInventoryReqDto {
  @ApiProperty() @IsUUID() variantId!: string;
  @ApiPropertyOptional() @IsUUID() @IsOptional() locationId?: string;
  @ApiProperty({ example: 'AUR-S-R-001' }) @IsString() sku!: string;
  @ApiPropertyOptional() @IsString() @IsOptional() barcode?: string;
  @ApiPropertyOptional() @Type(() => Number) @IsNumber() @Min(0) @IsOptional() purchasePrice?: number;
  @ApiPropertyOptional() @IsDateString() @IsOptional() purchaseDate?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() notes?: string;
}

export class UpdateInventoryStatusReqDto {
  @ApiProperty({ enum: ['AVAILABLE', 'RESERVED', 'RENTED', 'CLEANING', 'REPAIRING', 'DAMAGED', 'LOST', 'RETIRED'] })
  @IsIn(['AVAILABLE', 'RESERVED', 'RENTED', 'CLEANING', 'REPAIRING', 'DAMAGED', 'LOST', 'RETIRED']) status!: string;
  @ApiPropertyOptional() @IsString() @IsOptional() condition?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() reason?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() notes?: string;
}

export class InventoryListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional() @IsUUID() @IsOptional() variantId?: string;
  @ApiPropertyOptional({ enum: ['AVAILABLE', 'RESERVED', 'RENTED', 'CLEANING', 'REPAIRING', 'DAMAGED', 'LOST', 'RETIRED'] }) @IsIn(['AVAILABLE', 'RESERVED', 'RENTED', 'CLEANING', 'REPAIRING', 'DAMAGED', 'LOST', 'RETIRED']) @IsOptional() status?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() search?: string;
}

export class AvailabilityQueryDto {
  @ApiProperty() @IsUUID() variantId!: string;
  @ApiProperty() @IsDateString() from!: string;
  @ApiProperty() @IsDateString() until!: string;
}

export class ProductResDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty() categoryId!: string;
  @ApiProperty() status!: string;
  @ApiProperty() isRentable!: boolean;
  @ApiProperty() isPublic!: boolean;
  @ApiProperty({ type: String, example: '500000.00' }) defaultDepositAmount!: string;
  @ApiPropertyOptional({ nullable: true }) description!: string | null;
  @ApiProperty({ type: [Object] }) variants!: object[];
  @ApiProperty({ type: [Object] }) media!: object[];
}

export class InventoryItemResDto {
  @ApiProperty() id!: string;
  @ApiProperty() variantId!: string;
  @ApiProperty() sku!: string;
  @ApiPropertyOptional({ nullable: true }) barcode!: string | null;
  @ApiProperty() currentStatus!: string;
  @ApiProperty() condition!: string;
  @ApiProperty({ type: Object }) variant!: object;
  @ApiPropertyOptional({ nullable: true, type: Object }) location!: object | null;
  @ApiPropertyOptional({ type: [Object] }) statusHistory?: object[];
  @ApiPropertyOptional({ type: [Object] }) serviceRecords?: object[];
  @ApiPropertyOptional({ type: [Object] }) allocations?: object[];
}

export class ProductPageResDto {
  @ApiProperty({ type: [ProductResDto] }) items!: ProductResDto[];
  @ApiProperty({ type: PaginationMetaResDto }) meta!: PaginationMetaResDto;
}

export class InventoryPageResDto {
  @ApiProperty({ type: [InventoryItemResDto] }) items!: InventoryItemResDto[];
  @ApiProperty({ type: PaginationMetaResDto }) meta!: PaginationMetaResDto;
}
