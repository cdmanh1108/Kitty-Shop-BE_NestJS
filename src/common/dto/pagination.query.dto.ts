import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class PaginationQueryDto {
  @ApiPropertyOptional({ type: Number, default: 1, minimum: 1 })
  @Type(() => Number)
  @IsInt({ message: 'Trang phải là số nguyên.' })
  @Min(1, { message: 'Trang phải lớn hơn hoặc bằng $constraint1.' })
  @IsOptional()
  page = 1;

  @ApiPropertyOptional({ type: Number, default: 20, minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsInt({ message: 'Số kết quả mỗi trang phải là số nguyên.' })
  @Min(1, { message: 'Số kết quả mỗi trang phải lớn hơn hoặc bằng $constraint1.' })
  @Max(100, { message: 'Số kết quả mỗi trang phải nhỏ hơn hoặc bằng $constraint1.' })
  @IsOptional()
  limit = 20;
}
