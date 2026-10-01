import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsString, Min, ValidateIf } from 'class-validator';

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
