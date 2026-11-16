import type { JsonValue } from '@common/types/json';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDefined, IsEmail, IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class UpsertSettingReqDto {
  @ApiProperty({ description: 'Any JSON-compatible value' })
  @IsDefined({ message: 'Giá trị cài đặt không được để trống.' })
  value!: JsonValue;
  @ApiPropertyOptional()
  @IsString({ message: 'Mô tả nhập chưa hợp lệ. Vui lòng kiểm tra lại.' })
  @IsOptional()
  description?: string;
}

export class UpdateShopReqDto {
  @ApiPropertyOptional()
  @IsString({ message: 'Tên nhập chưa hợp lệ. Vui lòng kiểm tra lại.' })
  @MaxLength(255, { message: 'Tên không được vượt quá $constraint1 ký tự.' })
  @IsOptional()
  name?: string;
  @ApiPropertyOptional()
  @IsString({ message: 'Số điện thoại nhập chưa hợp lệ. Vui lòng kiểm tra lại.' })
  @IsOptional()
  phone?: string;
  @ApiPropertyOptional()
  @IsEmail(undefined, { message: 'Email không hợp lệ.' })
  @IsOptional()
  email?: string;
  @ApiPropertyOptional()
  @IsString({ message: 'Liên kết logo nhập chưa hợp lệ. Vui lòng kiểm tra lại.' })
  @IsOptional()
  logoUrl?: string;
  @ApiPropertyOptional({ example: '#111827' })
  @IsString({ message: 'Màu chủ đạo nhập chưa hợp lệ. Vui lòng kiểm tra lại.' })
  @IsOptional()
  primaryColor?: string;
  @ApiPropertyOptional({ example: 'Asia/Ho_Chi_Minh' })
  @IsString({ message: 'Múi giờ nhập chưa hợp lệ. Vui lòng kiểm tra lại.' })
  @IsOptional()
  timezone?: string;
  @ApiPropertyOptional({ example: 'VND' })
  @IsString({ message: 'Đơn vị tiền tệ nhập chưa hợp lệ. Vui lòng kiểm tra lại.' })
  @Length(3, 3)
  @IsOptional()
  currency?: string;
}
