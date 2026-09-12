import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateMemberReqDto {
  @ApiProperty() @IsEmail(undefined, { message: 'Email không hợp lệ.' }) email!: string;
  @ApiProperty() @IsString({ message: 'Họ tên phải là chuỗi ký tự.' }) fullName!: string;
  @ApiProperty({ minLength: 10 })
  @IsString({ message: 'Mật khẩu phải là chuỗi ký tự.' })
  @MinLength(10, { message: 'Mật khẩu phải có ít nhất $constraint1 ký tự.' })
  password!: string;
  @ApiPropertyOptional()
  @IsString({ message: 'Mã nhân viên phải là chuỗi ký tự.' })
  @IsOptional()
  employeeCode?: string;
  @ApiProperty({ type: [String], example: ['STAFF'] })
  @IsArray({ message: 'Danh sách mã vai trò phải là danh sách.' })
  @ArrayMinSize(1, { message: 'Danh sách mã vai trò phải có ít nhất $constraint1 phần tử.' })
  @IsString({ each: true, message: 'Danh sách mã vai trò phải là chuỗi ký tự.' })
  roleCodes!: string[];
}

export class UpdateMemberReqDto {
  @ApiPropertyOptional({ enum: ['ACTIVE', 'INACTIVE'] })
  @IsIn(['ACTIVE', 'INACTIVE'], { message: 'Trạng thái không hợp lệ.' })
  @IsOptional()
  status?: string;
  @ApiPropertyOptional({ type: [String] })
  @IsArray({ message: 'Danh sách mã vai trò phải là danh sách.' })
  @ArrayMinSize(1, { message: 'Danh sách mã vai trò phải có ít nhất $constraint1 phần tử.' })
  @IsString({ each: true, message: 'Danh sách mã vai trò phải là chuỗi ký tự.' })
  @IsOptional()
  roleCodes?: string[];
}
