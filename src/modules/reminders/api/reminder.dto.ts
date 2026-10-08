import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationMetaResDto } from '@common/dto/response.dto';

export class ReminderCustomerResDto {
  @ApiProperty()
  fullName!: string;

  @ApiProperty()
  phone!: string;
}

export class ReminderOrderResDto {
  @ApiProperty()
  orderNumber!: string;

  @ApiProperty()
  status!: string;
}

export class ReminderResDto {
  @ApiProperty()
  id!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  orderId!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  customerId!: string | null;

  @ApiProperty()
  type!: string;

  @ApiProperty({ format: 'date-time' })
  scheduledFor!: string;

  @ApiProperty()
  status!: string;

  @ApiProperty()
  priority!: number;

  @ApiProperty()
  title!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  content!: string | null;

  @ApiPropertyOptional({ type: ReminderCustomerResDto, nullable: true })
  customer!: ReminderCustomerResDto | null;

  @ApiPropertyOptional({ type: ReminderOrderResDto, nullable: true })
  order!: ReminderOrderResDto | null;
}

export class ReminderSummaryResDto {
  @ApiProperty({ description: 'Số lời nhắc nhận đồ trong ngày.' })
  pickupToday!: number;

  @ApiProperty({ description: 'Số lời nhắc trả đồ trong ngày.' })
  returnToday!: number;

  @ApiProperty({ description: 'Số lời nhắc quá hạn.' })
  overdue!: number;

  @ApiProperty({ description: 'Số lời nhắc còn thiếu tiền.' })
  paymentDue!: number;

  @ApiProperty({ description: 'Số lời nhắc chưa đủ tiền cọc.' })
  depositDue!: number;
}

export class ReminderPageResDto {
  @ApiProperty({ type: [ReminderResDto] })
  items!: ReminderResDto[];

  @ApiProperty({ type: PaginationMetaResDto })
  meta!: PaginationMetaResDto;

  @ApiProperty({ type: ReminderSummaryResDto })
  summary!: ReminderSummaryResDto;
}
