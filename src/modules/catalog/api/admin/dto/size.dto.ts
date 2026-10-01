import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { PaginationMetaResDto } from '@common/dto/response.dto';
import { IsBoolean, IsInt, IsNotEmpty, IsString, Min, ValidateIf } from 'class-validator';

export class CreateSizeReqDto {
  @ApiProperty({
    example: ' xl ',
    description:
      'Được trim rồi chuyển thành chữ in hoa; mã sau chuẩn hóa chỉ gồm A-Z, 0-9, dấu gạch dưới và tối đa 50 ký tự.',
  })
  @IsString({ message: 'Mã phải là chuỗi ký tự.' })
  code!: string;
  @ApiProperty({
    example: ' Cỡ lớn ',
    description:
      'Khoảng trắng đầu/cuối sẽ được loại bỏ; tên sau chuẩn hóa không rỗng và tối đa 100 ký tự.',
  })
  @IsString({ message: 'Tên phải là chuỗi ký tự.' })
  name!: string;
  @ApiPropertyOptional({ type: Number, default: 0, minimum: 0 })
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value === 'string' && value.trim() !== '') return Number(value);
    return value;
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsInt({ message: 'Thứ tự hiển thị phải là số nguyên.' })
  @Min(0, { message: 'Thứ tự hiển thị phải là số nguyên không âm.' })
  sortOrder = 0;
}

export class SizeSummaryResDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty() sortOrder!: number;
}

export class UpdateSizeReqDto {
  @ApiPropertyOptional({ example: ' xl ' })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString({ message: 'Mã phải là chuỗi ký tự.' })
  @IsNotEmpty({ message: 'Mã không được để trống.' })
  code?: string;

  @ApiPropertyOptional({ example: ' Cỡ lớn ' })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString({ message: 'Tên phải là chuỗi ký tự.' })
  @IsNotEmpty({ message: 'Tên không được để trống.' })
  name?: string;

  @ApiPropertyOptional({ type: Number, minimum: 0 })
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value === 'string' && value.trim() !== '') return Number(value);
    return value;
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsInt({ message: 'Thứ tự hiển thị phải là số nguyên.' })
  @Min(0, { message: 'Thứ tự hiển thị phải là số nguyên không âm.' })
  sortOrder?: number;
}

export class UpdateSizeStatusReqDto {
  @ApiProperty({ description: 'Bật hoặc ngừng sử dụng kích thước.' })
  @IsBoolean({ message: 'isActive phải là giá trị đúng hoặc sai.' })
  isActive!: boolean;
}

export class SizeManagementResDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty() sortOrder!: number;
  @ApiProperty() isActive!: boolean;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: Date;
}

export class SizeManagementPageResDto {
  @ApiProperty({ type: [SizeManagementResDto] }) items!: SizeManagementResDto[];
  @ApiProperty({ type: PaginationMetaResDto }) meta!: PaginationMetaResDto;
}
