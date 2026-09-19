import { PaginationMetaResDto } from '@common/dto/response.dto';
import { PaginationQueryDto } from '@common/dto/pagination.query.dto';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type, type TransformFnParams } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

const trimString = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() : value;
const normalizeCode = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

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
