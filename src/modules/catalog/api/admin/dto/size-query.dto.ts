import { PaginationQueryDto } from '@common/dto/pagination.query.dto';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

export class SizeListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Tìm kiếm theo mã hoặc tên kích thước.' })
  @IsString({ message: 'Từ khóa tìm kiếm phải là chuỗi ký tự.' })
  @IsOptional()
  q?: string;

  @ApiPropertyOptional({ enum: ['ALL', 'ACTIVE', 'INACTIVE'], default: 'ALL' })
  @IsIn(['ALL', 'ACTIVE', 'INACTIVE'], { message: 'Trạng thái kích thước không hợp lệ.' })
  @IsOptional()
  status: 'ALL' | 'ACTIVE' | 'INACTIVE' = 'ALL';
}
