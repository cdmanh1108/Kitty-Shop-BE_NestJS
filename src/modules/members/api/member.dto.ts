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
  @ApiProperty() @IsEmail() email!: string;
  @ApiProperty() @IsString() fullName!: string;
  @ApiProperty({ minLength: 10 }) @IsString() @MinLength(10) password!: string;
  @ApiPropertyOptional() @IsString() @IsOptional() employeeCode?: string;
  @ApiProperty({ type: [String], example: ['STAFF'] })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  roleCodes!: string[];
}

export class UpdateMemberReqDto {
  @ApiPropertyOptional({ enum: ['ACTIVE', 'INACTIVE'] })
  @IsIn(['ACTIVE', 'INACTIVE'])
  @IsOptional()
  status?: string;
  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @IsOptional()
  roleCodes?: string[];
}
