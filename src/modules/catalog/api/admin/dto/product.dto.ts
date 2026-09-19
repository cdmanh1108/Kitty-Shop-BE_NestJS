import { ProductListItemResDto } from '../../catalog-read.dto';
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
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { ColorSummaryResDto, SizeSummaryResDto } from './category.dto';

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
export class AddVariantReqDto extends ProductVariantReqDto {}

export class UpsertRentalRateReqDto extends RentalRateReqDto {}
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
