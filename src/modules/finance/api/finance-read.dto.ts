import { ApiProperty, ApiPropertyOptional, IntersectionType } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Matches } from 'class-validator';
import { PaginationQueryDto } from '@common/dto/pagination.query.dto';
import { PaginationMetaResDto } from '@common/dto/response.dto';
import { FINANCE_CATEGORIES, type FinanceCategory } from '../domain/finance-read.repository';

export class FinanceFilterDto {
  @ApiPropertyOptional({ enum: ['today', 'week', 'month', 'custom'], default: 'month' })
  @IsOptional()
  @IsIn(['today', 'week', 'month', 'custom'], { message: 'Khoảng thời gian không hợp lệ.' })
  preset?: 'today' | 'week' | 'month' | 'custom';
  @ApiPropertyOptional({
    format: 'date',
    description: 'First local date, inclusive; custom preset only',
  })
  @IsOptional()
  @IsString({ message: 'Ngày phải là chuỗi ký tự.' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Ngày bắt đầu phải có định dạng YYYY-MM-DD.' })
  from?: string;
  @ApiPropertyOptional({
    format: 'date',
    description: 'Last local date, inclusive; custom preset only',
  })
  @IsOptional()
  @IsString({ message: 'Ngày phải là chuỗi ký tự.' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Ngày kết thúc phải có định dạng YYYY-MM-DD.' })
  to?: string;
  @ApiPropertyOptional({ enum: ['INCOME', 'EXPENSE'] })
  @IsOptional()
  @IsIn(['INCOME', 'EXPENSE'], { message: 'Loại thu/chi không hợp lệ.' })
  direction?: 'INCOME' | 'EXPENSE';
  @ApiPropertyOptional({ enum: FINANCE_CATEGORIES, enumName: 'FinanceCategory' })
  @IsOptional()
  @IsIn(FINANCE_CATEGORIES, { message: 'Danh mục giao dịch không hợp lệ.' })
  category?: FinanceCategory;
}
export class FinanceTransactionsQueryDto extends IntersectionType(
  FinanceFilterDto,
  PaginationQueryDto,
) {
  @ApiPropertyOptional({ enum: ['newest', 'oldest'], default: 'newest' })
  @IsOptional()
  @IsIn(['newest', 'oldest'], { message: 'Thứ tự sắp xếp không hợp lệ.' })
  sort: 'newest' | 'oldest' = 'newest';
}
export class FinancePeriodResDto {
  @ApiProperty({ format: 'date' }) from!: string;
  @ApiProperty({ format: 'date' }) to!: string;
  @ApiProperty() timezone!: string;
}
export class FinanceBreakdownResDto {
  @ApiProperty({ enum: FINANCE_CATEGORIES, enumName: 'FinanceCategory' })
  category!: FinanceCategory;
  @ApiProperty({ example: '50000.00', description: 'VND decimal amount' }) amount!: string;
}
export class FinanceSummaryResDto {
  @ApiProperty({ type: FinancePeriodResDto }) period!: FinancePeriodResDto;
  @ApiProperty({ example: '1250000.00' }) totalRevenue!: string;
  @ApiProperty({ example: '300000.00' }) totalExpenses!: string;
  @ApiProperty({ example: '950000.00' }) profit!: string;
  @ApiProperty({ type: [FinanceBreakdownResDto], maxItems: 7 })
  breakdown!: FinanceBreakdownResDto[];
}
export class FinanceTransactionResDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty({ format: 'date-time' }) occurredAt!: string;
  @ApiProperty({ enum: ['INCOME', 'EXPENSE'] }) direction!: 'INCOME' | 'EXPENSE';
  @ApiProperty({ enum: FINANCE_CATEGORIES, enumName: 'FinanceCategory' })
  category!: FinanceCategory;
  @ApiProperty() description!: string;
  @ApiProperty({ example: '50000.00' }) amount!: string;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' }) orderId!: string | null;
  @ApiProperty({ type: String, nullable: true }) orderCode!: string | null;
}
export class FinanceTransactionsResDto {
  @ApiProperty({ type: [FinanceTransactionResDto], maxItems: 100 })
  items!: FinanceTransactionResDto[];
  @ApiProperty({ type: PaginationMetaResDto }) meta!: PaginationMetaResDto;
}
export class ExpenseCategoryResDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
}
