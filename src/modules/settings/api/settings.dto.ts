import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDefined, IsEmail, IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class UpsertSettingReqDto {
  @ApiProperty({ description: 'Any JSON-compatible value' }) @IsDefined() value!: unknown;
  @ApiPropertyOptional() @IsString() @IsOptional() description?: string;
}

export class UpdateShopReqDto {
  @ApiPropertyOptional() @IsString() @MaxLength(255) @IsOptional() name?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() phone?: string;
  @ApiPropertyOptional() @IsEmail() @IsOptional() email?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() logoUrl?: string;
  @ApiPropertyOptional({ example: '#111827' }) @IsString() @IsOptional() primaryColor?: string;
  @ApiPropertyOptional({ example: 'Asia/Ho_Chi_Minh' }) @IsString() @IsOptional() timezone?: string;
  @ApiPropertyOptional({ example: 'VND' }) @IsString() @Length(3, 3) @IsOptional() currency?: string;
}
