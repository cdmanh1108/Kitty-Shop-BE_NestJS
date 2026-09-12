import type { JsonValue } from '@common/types/json';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDefined, IsEmail, IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class UpsertSettingReqDto {
  @ApiProperty({ description: 'Any JSON-compatible value' })
  @IsDefined({ message: 'Giá trị cài đặt không được để trống.' })
  value!: JsonValue;
  @ApiPropertyOptional()
  @IsString({ message: 'Mô tả phải là chuỗi ký tự.' })
  @IsOptional()
  description?: string;
}

export class UpdateShopReqDto {
  @ApiPropertyOptional()
  @IsString({ message: 'Tên phải là chuỗi ký tự.' })
  @MaxLength(255, { message: 'Tên không được vượt quá $constraint1 ký tự.' })
  @IsOptional()
  name?: string;
  @ApiPropertyOptional()
  @IsString({ message: 'Số điện thoại phải là chuỗi ký tự.' })
  @IsOptional()
  phone?: string;
  @ApiPropertyOptional()
  @IsEmail(undefined, { message: 'Email không hợp lệ.' })
  @IsOptional()
  email?: string;
  @ApiPropertyOptional()
  @IsString({ message: 'Liên kết logo phải là chuỗi ký tự.' })
  @IsOptional()
  logoUrl?: string;
  @ApiPropertyOptional({ example: '#111827' })
  @IsString({ message: 'Màu chủ đạo phải là chuỗi ký tự.' })
  @IsOptional()
  primaryColor?: string;
  @ApiPropertyOptional({ example: 'Asia/Ho_Chi_Minh' })
  @IsString({ message: 'Múi giờ phải là chuỗi ký tự.' })
  @IsOptional()
  timezone?: string;
  @ApiPropertyOptional({ example: 'VND' })
  @IsString({ message: 'Đơn vị tiền tệ phải là chuỗi ký tự.' })
  @Length(3, 3)
  @IsOptional()
  currency?: string;
}
