import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CreateColorReqDto {
  @ApiProperty() @IsString({ message: 'Mã phải là chuỗi ký tự.' }) code!: string;
  @ApiProperty() @IsString({ message: 'Tên phải là chuỗi ký tự.' }) name!: string;
  @ApiPropertyOptional({ example: '#000000' })
  @IsString({ message: 'Mã màu phải là chuỗi ký tự.' })
  @IsOptional()
  hexColor?: string;
}

export class ColorSummaryResDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) hexColor!: string | null;
}
