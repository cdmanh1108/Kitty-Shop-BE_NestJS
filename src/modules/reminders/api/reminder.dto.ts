import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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
