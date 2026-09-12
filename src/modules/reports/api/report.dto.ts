import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, Max, Min } from 'class-validator';

export class ReportRangeQueryDto {
  @ApiPropertyOptional()
  @IsDateString(undefined, {
    message: 'Thời gian bắt đầu phải là ngày giờ hợp lệ theo định dạng ISO 8601.',
  })
  @IsOptional()
  from?: string;
  @ApiPropertyOptional()
  @IsDateString(undefined, {
    message: 'Thời gian kết thúc phải là ngày giờ hợp lệ theo định dạng ISO 8601.',
  })
  @IsOptional()
  until?: string;
}

export class PerformanceQueryDto extends ReportRangeQueryDto {
  @ApiPropertyOptional({ default: 20 })
  @Type(() => Number)
  @IsInt({ message: 'Số kết quả mỗi trang phải là số nguyên.' })
  @Min(1, { message: 'Số kết quả mỗi trang phải lớn hơn hoặc bằng $constraint1.' })
  @Max(100, { message: 'Số kết quả mỗi trang phải nhỏ hơn hoặc bằng $constraint1.' })
  @IsOptional()
  limit = 20;
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
