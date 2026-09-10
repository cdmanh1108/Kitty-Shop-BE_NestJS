import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, Max, Min } from 'class-validator';

export class ReportRangeQueryDto {
  @ApiPropertyOptional() @IsDateString() @IsOptional() from?: string;
  @ApiPropertyOptional() @IsDateString() @IsOptional() until?: string;
}

export class PerformanceQueryDto extends ReportRangeQueryDto {
  @ApiPropertyOptional({ default: 20 }) @Type(() => Number) @IsInt() @Min(1) @Max(100) @IsOptional() limit = 20;
}

export class RevenueReportRowResDto {
  @ApiProperty({ format: 'date' }) day!: string;
  @ApiProperty({ type: String, example: '1000000.00' }) revenue!: string;
  @ApiProperty({ type: String, example: '200000.00' }) expense!: string;
  @ApiProperty({ type: String, example: '800000.00' }) profit!: string;
}

export class ProductPerformanceResDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty() rentalCount!: number;
  @ApiProperty({ type: String, example: '5000000.00' }) bookedRevenue!: string;
}

export class CustomerPerformanceResDto {
  @ApiProperty() id!: string;
  @ApiProperty() customerCode!: string;
  @ApiProperty() fullName!: string;
  @ApiProperty() phone!: string;
  @ApiProperty() rentalCount!: number;
  @ApiProperty({ type: String, example: '5000000.00' }) bookedValue!: string;
}
