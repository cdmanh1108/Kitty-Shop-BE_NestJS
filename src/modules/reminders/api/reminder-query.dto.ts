import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { REMINDER_STATUSES, REMINDER_TYPES } from '../domain/reminder.models';
import type { ReminderListQuery } from '../application/reminder.contracts';

export class ReminderFiltersDto {
  @ApiPropertyOptional({ enum: [...REMINDER_STATUSES, 'all'] })
  @IsIn([...REMINDER_STATUSES, 'all'], { message: 'Trạng thái nhắc lịch không hợp lệ.' })
  @IsOptional()
  status?: (typeof REMINDER_STATUSES)[number] | 'all';

  @ApiPropertyOptional({ enum: REMINDER_TYPES })
  @IsIn(REMINDER_TYPES, { message: 'Loại nhắc lịch không hợp lệ.' })
  @IsOptional()
  type?: (typeof REMINDER_TYPES)[number];

  @ApiPropertyOptional({ maxLength: 100, description: 'Tìm theo nội dung, khách hoặc mã đơn.' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'Từ khóa tìm kiếm phải là chuỗi ký tự.' })
  @MaxLength(100, { message: 'Từ khóa tìm kiếm không được vượt quá 100 ký tự.' })
  @IsOptional()
  search?: string;
}

export class ReminderQueryDto extends ReminderFiltersDto {
  @ApiPropertyOptional({ type: Number, default: 1, minimum: 1 })
  @Type(() => Number)
  @IsInt({ message: 'Trang phải là số nguyên.' })
  @Min(1, { message: 'Trang phải lớn hơn hoặc bằng 1.' })
  @IsOptional()
  page = 1;

  @ApiPropertyOptional({ type: Number, default: 10, minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsInt({ message: 'Số kết quả mỗi trang phải là số nguyên.' })
  @Min(1, { message: 'Số kết quả mỗi trang phải lớn hơn hoặc bằng 1.' })
  @Max(100, { message: 'Số kết quả mỗi trang không được vượt quá 100.' })
  @IsOptional()
  limit = 10;
}

export function toReminderListQuery(query: ReminderQueryDto): ReminderListQuery {
  return {
    page: query.page,
    limit: query.limit,
    status: query.status && query.status !== 'all' ? query.status : undefined,
    type: query.type,
    search: query.search || undefined,
  };
}
