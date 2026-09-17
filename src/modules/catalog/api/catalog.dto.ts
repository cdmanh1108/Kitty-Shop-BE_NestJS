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
  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt({ message: 'Số ngày thuê phải là số nguyên.' })
  @Min(1, { message: 'Số ngày thuê phải lớn hơn hoặc bằng $constraint1.' })
  @Max(365, { message: 'Số ngày thuê phải nhỏ hơn hoặc bằng $constraint1.' })
  durationDays!: number;
  @ApiProperty({ example: 300000 })
  @Type(() => Number)
  @IsNumber(undefined, { message: 'Giá thuê phải là số hợp lệ.' })
  @Min(0, { message: 'Giá thuê phải lớn hơn hoặc bằng $constraint1.' })
  price!: number;
}

export class ProductVariantReqDto {
  @ApiProperty({ example: 'AURORA-S-RED' })
  @IsString({ message: 'Mã biến thể phải là chuỗi ký tự.' })
  variantCode!: string;
  @ApiPropertyOptional()
  @IsUUID(undefined, { message: 'Mã kích thước phải là UUID hợp lệ.' })
  @IsOptional()
  sizeId?: string;
  @ApiPropertyOptional()
  @IsUUID(undefined, { message: 'Mã màu sắc phải là UUID hợp lệ.' })
  @IsOptional()
  colorId?: string;
  @ApiPropertyOptional()
  @Type(() => Number)
  @IsNumber(undefined, { message: 'Tiền cọc riêng của biến thể phải là số hợp lệ.' })
  @Min(0, { message: 'Tiền cọc riêng của biến thể phải lớn hơn hoặc bằng $constraint1.' })
  @IsOptional()
  depositAmountOverride?: number;
  @ApiPropertyOptional({ type: Number, default: 1, minimum: 0 })
  @Type(() => Number)
  @IsInt({ message: 'Số lượng tồn kho phải là số nguyên.' })
  @Min(0, { message: 'Số lượng tồn kho phải lớn hơn hoặc bằng $constraint1.' })
  @IsOptional()
  inventoryCount = 1;
  @ApiPropertyOptional({ example: 'AUR-S-R' })
  @IsString({ message: 'Tiền tố SKU phải là chuỗi ký tự.' })
  @IsOptional()
  skuPrefix?: string;
  @ApiProperty({ type: [RentalRateReqDto] })
  @IsArray({ message: 'Danh sách giá thuê phải là danh sách.' })
  @ArrayMinSize(1, { message: 'Danh sách giá thuê phải có ít nhất $constraint1 phần tử.' })
  @ValidateNested({ each: true, message: 'Danh sách giá thuê có dữ liệu không hợp lệ.' })
  @Type(() => RentalRateReqDto)
  rentalRates!: RentalRateReqDto[];
}

export class ProductMediaReqDto {
  @ApiProperty()
  @IsUrl(undefined, { message: 'Liên kết hình ảnh phải là URL hợp lệ.' })
  url!: string;
  @ApiPropertyOptional()
  @IsString({ message: 'Mô tả hình ảnh phải là chuỗi ký tự.' })
  @IsOptional()
  altText?: string;
  @ApiPropertyOptional({ type: Boolean, default: false })
  @IsBoolean({ message: 'Tùy chọn ảnh đại diện phải là giá trị đúng hoặc sai.' })
  @IsOptional()
  isPrimary = false;
  @ApiPropertyOptional({ type: Number, default: 0 })
  @Type(() => Number)
  @IsInt({ message: 'Thứ tự hiển thị phải là số nguyên.' })
  @IsOptional()
  sortOrder = 0;
}

export class CreateProductReqDto {
  @ApiProperty({ example: 'DRESS-AURORA' })
  @IsString({ message: 'Mã phải là chuỗi ký tự.' })
  code!: string;
  @ApiProperty({ example: 'Váy Aurora Satin' })
  @IsString({ message: 'Tên phải là chuỗi ký tự.' })
  name!: string;
  @ApiProperty()
  @IsUUID(undefined, { message: 'Mã danh mục phải là UUID hợp lệ.' })
  categoryId!: string;
  @ApiPropertyOptional()
  @IsString({ message: 'Mô tả phải là chuỗi ký tự.' })
  @IsOptional()
  description?: string;
  @ApiPropertyOptional({ type: Number, default: 0, minimum: 0 })
  @Type(() => Number)
  @IsNumber(undefined, { message: 'Tiền cọc mặc định phải là số hợp lệ.' })
  @Min(0, { message: 'Tiền cọc mặc định phải lớn hơn hoặc bằng $constraint1.' })
  @IsOptional()
  defaultDepositAmount = 0;
  @ApiPropertyOptional({ nullable: true, type: Number, minimum: 0, example: 1500000 })
  @Type(() => Number)
  @IsNumber(undefined, { message: 'Giá trị bồi thường phải là số hợp lệ.' })
  @Min(0, { message: 'Giá trị bồi thường phải lớn hơn hoặc bằng $constraint1.' })
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
    { message: 'Liên kết bài viết Facebook phải là URL HTTP hoặc HTTPS hợp lệ.' },
  )
  @IsOptional()
  facebookPostUrl?: string | null;
  @ApiPropertyOptional({ type: Boolean, default: false })
  @IsBoolean({ message: 'Tùy chọn hiển thị công khai phải là giá trị đúng hoặc sai.' })
  @IsOptional()
  isPublic = false;
  @ApiProperty({ type: [ProductVariantReqDto] })
  @IsArray({ message: 'Danh sách biến thể phải là danh sách.' })
  @ArrayMinSize(1, { message: 'Danh sách biến thể phải có ít nhất $constraint1 phần tử.' })
  @ValidateNested({ each: true, message: 'Danh sách biến thể có dữ liệu không hợp lệ.' })
  @Type(() => ProductVariantReqDto)
  variants!: ProductVariantReqDto[];
  @ApiPropertyOptional({ type: [ProductMediaReqDto] })
  @IsArray({ message: 'Danh sách hình ảnh phải là danh sách.' })
  @ValidateNested({ each: true, message: 'Danh sách hình ảnh có dữ liệu không hợp lệ.' })
  @Type(() => ProductMediaReqDto)
  @IsOptional()
  media: ProductMediaReqDto[] = [];
}

export class UpdateProductReqDto {
  @ApiPropertyOptional()
  @IsString({ message: 'Tên phải là chuỗi ký tự.' })
  @IsOptional()
  name?: string;
  @ApiPropertyOptional()
  @IsUUID(undefined, { message: 'Mã danh mục phải là UUID hợp lệ.' })
  @IsOptional()
  categoryId?: string;
  @ApiPropertyOptional()
  @IsString({ message: 'Mô tả phải là chuỗi ký tự.' })
  @IsOptional()
  description?: string;
  @ApiPropertyOptional({ type: Number, minimum: 0 })
  @Type(() => Number)
  @IsNumber(undefined, { message: 'Tiền cọc mặc định phải là số hợp lệ.' })
  @Min(0, { message: 'Tiền cọc mặc định phải lớn hơn hoặc bằng $constraint1.' })
  @IsOptional()
  defaultDepositAmount?: number;
  @ApiPropertyOptional({ nullable: true, type: Number, minimum: 0, example: 1500000 })
  @Type(() => Number)
  @IsNumber(undefined, { message: 'Giá trị bồi thường phải là số hợp lệ.' })
  @Min(0, { message: 'Giá trị bồi thường phải lớn hơn hoặc bằng $constraint1.' })
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
    { message: 'Liên kết bài viết Facebook phải là URL HTTP hoặc HTTPS hợp lệ.' },
  )
  @IsOptional()
  facebookPostUrl?: string | null;
  @ApiPropertyOptional()
  @IsBoolean({ message: 'Tùy chọn hiển thị công khai phải là giá trị đúng hoặc sai.' })
  @IsOptional()
  isPublic?: boolean;
  @ApiPropertyOptional()
  @IsBoolean({ message: 'Tùy chọn cho phép thuê phải là giá trị đúng hoặc sai.' })
  @IsOptional()
  isRentable?: boolean;
  @ApiPropertyOptional({ enum: Object.values(PRODUCT_STATUS) })
  @IsIn(Object.values(PRODUCT_STATUS), { message: 'Trạng thái không hợp lệ.' })
  @IsOptional()
  status?: string;
}

export class CreateCategoryReqDto {
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    format: 'uuid',
    example: 'd1964177-3e91-4475-ab1b-2661001a1829',
  })
  @IsUUID(undefined, { message: 'Mã danh mục cha phải là UUID hợp lệ.' })
  @IsOptional()
  parentId?: string | null;

  @ApiPropertyOptional({ example: 'DRESS' })
  @Transform(normalizeCode)
  @IsString({ message: 'Mã phải là chuỗi ký tự.' })
  @Matches(/^[A-Z0-9_]+$/, { message: 'Mã chỉ được chứa chữ in hoa, chữ số và dấu gạch dưới.' })
  @MaxLength(50, { message: 'Mã không được vượt quá $constraint1 ký tự.' })
  @IsOptional()
  code?: string;
  @ApiProperty()
  @Transform(trimString)
  @IsString({ message: 'Tên phải là chuỗi ký tự.' })
  @IsNotEmpty({ message: 'Tên không được để trống.' })
  @MaxLength(255, { message: 'Tên không được vượt quá $constraint1 ký tự.' })
  name!: string;
  @ApiPropertyOptional()
  @Transform(trimString)
  @IsString({ message: 'Mô tả phải là chuỗi ký tự.' })
  @MaxLength(2000, { message: 'Mô tả không được vượt quá $constraint1 ký tự.' })
  @IsOptional()
  description?: string;
  @ApiPropertyOptional({ enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' })
  @IsIn(['ACTIVE', 'INACTIVE'], { message: 'Trạng thái không hợp lệ.' })
  @IsOptional()
  status?: 'ACTIVE' | 'INACTIVE';
  @ApiPropertyOptional({ type: Number, default: 0, minimum: 0 })
  @Type(() => Number)
  @IsInt({ message: 'Thứ tự hiển thị phải là số nguyên.' })
  @Min(0, { message: 'Thứ tự hiển thị phải lớn hơn hoặc bằng $constraint1.' })
  @IsOptional()
  sortOrder?: number;
}

export class UpdateCategoryReqDto {
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    format: 'uuid',
    example: 'd1964177-3e91-4475-ab1b-2661001a1829',
  })
  @IsUUID(undefined, { message: 'Mã danh mục cha phải là UUID hợp lệ.' })
  @IsOptional()
  parentId?: string | null;

  @ApiPropertyOptional({ example: 'DRESS' })
  @Transform(normalizeCode)
  @IsString({ message: 'Mã phải là chuỗi ký tự.' })
  @Matches(/^[A-Z0-9_]+$/, { message: 'Mã chỉ được chứa chữ in hoa, chữ số và dấu gạch dưới.' })
  @MaxLength(50, { message: 'Mã không được vượt quá $constraint1 ký tự.' })
  @IsOptional()
  code?: string;

  @ApiPropertyOptional()
  @Transform(trimString)
  @IsString({ message: 'Tên phải là chuỗi ký tự.' })
  @IsNotEmpty({ message: 'Tên không được để trống.' })
  @MaxLength(255, { message: 'Tên không được vượt quá $constraint1 ký tự.' })
  @IsOptional()
  name?: string;
  @ApiPropertyOptional({ nullable: true, type: String })
  @Transform(trimString)
  @IsString({ message: 'Mô tả phải là chuỗi ký tự.' })
  @MaxLength(2000, { message: 'Mô tả không được vượt quá $constraint1 ký tự.' })
  @IsOptional()
  description?: string | null;
  @ApiPropertyOptional({ enum: ['ACTIVE', 'INACTIVE'] })
  @IsIn(['ACTIVE', 'INACTIVE'], { message: 'Trạng thái không hợp lệ.' })
  @IsOptional()
  status?: 'ACTIVE' | 'INACTIVE';
  @ApiPropertyOptional({ type: Number, minimum: 0 })
  @Type(() => Number)
  @IsInt({ message: 'Thứ tự hiển thị phải là số nguyên.' })
  @Min(0, { message: 'Thứ tự hiển thị phải lớn hơn hoặc bằng $constraint1.' })
  @IsOptional()
  sortOrder?: number;
}

export class CategoryListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsString({ message: 'Từ khóa tìm kiếm phải là chuỗi ký tự.' })
  @IsOptional()
  search?: string;
  @ApiPropertyOptional({ enum: ['ACTIVE', 'INACTIVE'] })
  @IsIn(['ACTIVE', 'INACTIVE'], { message: 'Trạng thái không hợp lệ.' })
  @IsOptional()
  status?: 'ACTIVE' | 'INACTIVE';
}

export class CreateSizeReqDto {
  @ApiProperty() @IsString({ message: 'Mã phải là chuỗi ký tự.' }) code!: string;
  @ApiProperty() @IsString({ message: 'Tên phải là chuỗi ký tự.' }) name!: string;
  @ApiPropertyOptional({ type: Number, default: 0 })
  @Type(() => Number)
  @IsInt({ message: 'Thứ tự hiển thị phải là số nguyên.' })
  @IsOptional()
  sortOrder = 0;
}

export class CreateColorReqDto {
  @ApiProperty() @IsString({ message: 'Mã phải là chuỗi ký tự.' }) code!: string;
  @ApiProperty() @IsString({ message: 'Tên phải là chuỗi ký tự.' }) name!: string;
  @ApiPropertyOptional({ example: '#000000' })
  @IsString({ message: 'Mã màu phải là chuỗi ký tự.' })
  @IsOptional()
  hexColor?: string;
}

export class AddVariantReqDto extends ProductVariantReqDto {}

export class UpsertRentalRateReqDto extends RentalRateReqDto {}

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

export class CategorySummaryResDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) parentId?: string | null;
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

export class ProductVariantInventoryResDto {
  @ApiProperty() id!: string;
  @ApiProperty() sku!: string;
  @ApiProperty() currentStatus!: string;
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
  @ApiPropertyOptional({ type: [ProductVariantInventoryResDto] })
  inventoryItems?: ProductVariantInventoryResDto[];
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
  @ApiPropertyOptional({ type: String, nullable: true }) parentId?: string | null;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: ['ACTIVE', 'INACTIVE'] }) status!: 'ACTIVE' | 'INACTIVE';
}

export class CategoryOptionsQueryDto {
  @ApiPropertyOptional({ type: Boolean, default: false })
  @Transform(({ value }: TransformFnParams) => value === true || value === 'true')
  @IsBoolean({ message: 'Tùy chọn bao gồm dữ liệu ngừng hoạt động phải là giá trị đúng hoặc sai.' })
  @IsOptional()
  includeInactive = false;
}

export class CategoryResDto extends CategorySummaryResDto {
  @ApiPropertyOptional({ type: CategorySummaryResDto, nullable: true })
  parent?: CategorySummaryResDto | null;
  @ApiProperty({ enum: ['ACTIVE', 'INACTIVE'] }) status!: 'ACTIVE' | 'INACTIVE';
  @ApiProperty() sortOrder!: number;
  @ApiProperty() productCount!: number;
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
  @ApiPropertyOptional()
  @IsUUID(undefined, { message: 'Mã sản phẩm phải là UUID hợp lệ.' })
  @IsOptional()
  productId?: string;
  @ApiPropertyOptional({ type: Number, maximum: 50, default: 20 })
  @Max(50, { message: 'Số kết quả mỗi trang phải nhỏ hơn hoặc bằng $constraint1.' })
  override limit = 20;
}
