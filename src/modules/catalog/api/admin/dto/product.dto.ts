import { PaginationMetaResDto } from '@common/dto/response.dto';
import { PRODUCT_STATUS } from '@modules/catalog/domain/catalog-status';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { ColorSummaryResDto } from './color.dto';
import { SizeSummaryResDto } from './size.dto';

export class ProductVariantReqDto {
  @ApiProperty({ example: 'AURORA-S-RED' })
  @IsString({ message: 'Mã biến thể nhập chưa hợp lệ. Vui lòng kiểm tra lại.' })
  variantCode!: string;
  @ApiPropertyOptional()
  @IsUUID(undefined, { message: 'Kích thước không hợp lệ. Vui lòng chọn lại.' })
  @IsOptional()
  sizeId?: string;
  @ApiPropertyOptional()
  @IsUUID(undefined, { message: 'Màu sắc không hợp lệ. Vui lòng chọn lại.' })
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
  @IsString({ message: 'Tiền tố SKU nhập chưa hợp lệ. Vui lòng kiểm tra lại.' })
  @IsOptional()
  skuPrefix?: string;
}

export class ProductMediaReqDto {
  @ApiProperty()
  @IsUrl(undefined, { message: 'Liên kết hình ảnh phải là URL hợp lệ.' })
  url!: string;
  @ApiPropertyOptional()
  @IsString({ message: 'Mô tả hình ảnh nhập chưa hợp lệ. Vui lòng kiểm tra lại.' })
  @IsOptional()
  altText?: string;
  @ApiPropertyOptional({ type: Boolean, default: false })
  @IsBoolean({ message: 'Tùy chọn ảnh đại diện chưa hợp lệ. Vui lòng chọn lại.' })
  @IsOptional()
  isPrimary = false;
  @ApiPropertyOptional({ type: Number, default: 0 })
  @Type(() => Number)
  @IsInt({ message: 'Thứ tự hiển thị phải là số nguyên.' })
  @IsOptional()
  sortOrder = 0;
}

export class ProductMediaUploadReqDto {
  @ApiPropertyOptional()
  @IsString({ message: 'Mô tả hình ảnh nhập chưa hợp lệ. Vui lòng kiểm tra lại.' })
  @IsOptional()
  altText?: string;

  @ApiPropertyOptional({ type: Boolean, default: false })
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean({ message: 'Tùy chọn ảnh đại diện chưa hợp lệ. Vui lòng chọn lại.' })
  @IsOptional()
  isPrimary = false;

  @ApiPropertyOptional({ type: Number, default: 0 })
  @Type(() => Number)
  @IsInt({ message: 'Thứ tự hiển thị phải là số nguyên.' })
  @IsOptional()
  sortOrder = 0;
}

export class CreateProductReqDto {
  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    minimum: 0,
    maximum: 100000000,
    description: 'Giá một lượt thuê riêng của sản phẩm (VND). null dùng giá chung; 0 hợp lệ.',
  })
  @Type(() => Number)
  @IsOptional()
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'Giá thuê riêng phải là số có tối đa hai chữ số thập phân.' },
  )
  @Min(0)
  @Max(100000000)
  rentalPriceOverride?: number | null;
  @ApiPropertyOptional({
    type: Boolean,
    description: 'Cho phép chọn thuê kèm miễn phí trong hạn mức của đơn.',
  })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsBoolean({ message: 'Tùy chọn thuê kèm miễn phí chưa hợp lệ. Vui lòng chọn lại.' })
  allowFreeAccessory?: boolean;

  @ApiProperty({ example: 'DRESS-AURORA' })
  @IsString({ message: 'Mã nhập chưa hợp lệ. Vui lòng kiểm tra lại.' })
  code!: string;
  @ApiProperty({ example: 'Váy Aurora Satin' })
  @IsString({ message: 'Tên nhập chưa hợp lệ. Vui lòng kiểm tra lại.' })
  name!: string;
  @ApiProperty()
  @IsUUID(undefined, { message: 'Danh mục không hợp lệ. Vui lòng chọn lại.' })
  categoryId!: string;
  @ApiPropertyOptional()
  @IsString({ message: 'Mô tả nhập chưa hợp lệ. Vui lòng kiểm tra lại.' })
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
  @IsBoolean({ message: 'Tùy chọn hiển thị công khai chưa hợp lệ. Vui lòng chọn lại.' })
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
  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    minimum: 0,
    maximum: 100000000,
    description: 'Giá một lượt thuê riêng của sản phẩm (VND). null dùng giá chung; 0 hợp lệ.',
  })
  @Type(() => Number)
  @IsOptional()
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'Giá thuê riêng phải là số có tối đa hai chữ số thập phân.' },
  )
  @Min(0)
  @Max(100000000)
  rentalPriceOverride?: number | null;
  @ApiPropertyOptional({
    type: Boolean,
    description: 'Cho phép chọn thuê kèm miễn phí trong hạn mức của đơn.',
  })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsBoolean({ message: 'Tùy chọn thuê kèm miễn phí chưa hợp lệ. Vui lòng chọn lại.' })
  allowFreeAccessory?: boolean;

  @ApiPropertyOptional()
  @IsString({ message: 'Tên nhập chưa hợp lệ. Vui lòng kiểm tra lại.' })
  @IsOptional()
  name?: string;
  @ApiPropertyOptional()
  @IsUUID(undefined, { message: 'Danh mục không hợp lệ. Vui lòng chọn lại.' })
  @IsOptional()
  categoryId?: string;
  @ApiPropertyOptional()
  @IsString({ message: 'Mô tả nhập chưa hợp lệ. Vui lòng kiểm tra lại.' })
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
  @IsBoolean({ message: 'Tùy chọn hiển thị công khai chưa hợp lệ. Vui lòng chọn lại.' })
  @IsOptional()
  isPublic?: boolean;
  @ApiPropertyOptional()
  @IsBoolean({ message: 'Tùy chọn cho phép thuê chưa hợp lệ. Vui lòng chọn lại.' })
  @IsOptional()
  isRentable?: boolean;
  @ApiPropertyOptional({ enum: Object.values(PRODUCT_STATUS) })
  @IsIn(Object.values(PRODUCT_STATUS), { message: 'Trạng thái không hợp lệ.' })
  @IsOptional()
  status?: string;
}
export class AddVariantReqDto extends ProductVariantReqDto {}

export class UpdateProductVariantReqDto {
  @ApiPropertyOptional({ example: 'AURORA-S-RED', maxLength: 100 })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'Mã biến thể nhập chưa hợp lệ. Vui lòng kiểm tra lại.' })
  @IsNotEmpty({ message: 'Mã biến thể không được để trống.' })
  @MaxLength(100, { message: 'Mã biến thể không được vượt quá 100 ký tự.' })
  @ValidateIf((_object: UpdateProductVariantReqDto, value: unknown) => value !== undefined)
  variantCode?: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  @IsUUID(undefined, { message: 'Kích thước không hợp lệ. Vui lòng chọn lại.' })
  @IsOptional()
  sizeId?: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  @IsUUID(undefined, { message: 'Màu sắc không hợp lệ. Vui lòng chọn lại.' })
  @IsOptional()
  colorId?: string | null;

  @ApiPropertyOptional({ nullable: true, type: Number, minimum: 0 })
  @Type(() => Number)
  @IsNumber(undefined, { message: 'Tiền cọc riêng của biến thể phải là số hợp lệ.' })
  @Min(0, { message: 'Tiền cọc riêng của biến thể phải lớn hơn hoặc bằng $constraint1.' })
  @IsOptional()
  depositAmountOverride?: number | null;
}

export class SetProductVariantArchivedReqDto {
  @ApiProperty({ description: 'true để lưu trữ, false để kích hoạt lại.' })
  @IsBoolean({ message: 'Trạng thái lưu trữ chưa hợp lệ. Vui lòng chọn lại.' })
  archived!: boolean;
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
  @ApiPropertyOptional({ type: String, nullable: true }) archivedAt!: string | null;
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
  @ApiProperty({ type: String, nullable: true }) rentalPriceOverride!: string | null;
  @ApiProperty({ type: Boolean }) allowFreeAccessory!: boolean;
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
  @ApiPropertyOptional() createdAt?: string;
  @ApiPropertyOptional() updatedAt?: string;
}

export class ProductListItemResDto {
  @ApiProperty({ type: String, nullable: true }) rentalPriceOverride!: string | null;
  @ApiProperty({ type: Boolean }) allowFreeAccessory!: boolean;
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
}

export class ProductPageResDto {
  @ApiProperty({ type: [ProductListItemResDto] }) items!: ProductListItemResDto[];
  @ApiProperty({ type: PaginationMetaResDto }) meta!: PaginationMetaResDto;
}
