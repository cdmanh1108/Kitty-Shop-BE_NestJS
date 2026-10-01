import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString } from 'class-validator';

export class CreateSizeReqDto {
  @ApiProperty() @IsString({ message: 'Mã phải là chuỗi ký tự.' }) code!: string;
  @ApiProperty() @IsString({ message: 'Tên phải là chuỗi ký tự.' }) name!: string;
  @ApiPropertyOptional({ type: Number, default: 0 })
  @Type(() => Number)
  @IsInt({ message: 'Thứ tự hiển thị phải là số nguyên.' })
  @IsOptional()
  sortOrder = 0;
}

export class SizeSummaryResDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty() sortOrder!: number;
}
