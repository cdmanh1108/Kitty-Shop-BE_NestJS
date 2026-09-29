import { PaginationMetaResDto } from '@common/dto/response.dto';
import { PaginationQueryDto } from '@common/dto/pagination.query.dto';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { RENTAL_STATUS, type RentalStatus } from '../../../domain/rental-status';

const WEB_ACCOUNT_RENTAL_ORDER_STATUSES = Object.values(RENTAL_STATUS);

export class WebAccountRentalOrdersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: WEB_ACCOUNT_RENTAL_ORDER_STATUSES })
  @IsOptional()
  @IsIn(WEB_ACCOUNT_RENTAL_ORDER_STATUSES)
  status?: RentalStatus;
}

export class WebAccountRentalOrderParamsDto {
  @ApiProperty({ example: 'RT260928-001' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  orderCode!: string;
}

export class WebAccountRentalOrderItemPreviewResDto {
  @ApiProperty({ example: 'Váy dạ hội' })
  productName!: string;

  @ApiProperty({ example: 'M / Trắng' })
  variantName!: string;

  @ApiProperty({ example: 1 })
  quantity!: number;
}

export class WebAccountRentalOrderListItemResDto {
  @ApiProperty({ example: 'RT260928-001' })
  orderCode!: string;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  rentalStartAt!: string;

  @ApiProperty({ format: 'date-time' })
  rentalEndAt!: string;

  @ApiProperty({ example: 'RESERVED', enum: WEB_ACCOUNT_RENTAL_ORDER_STATUSES })
  status!: string;

  @ApiProperty({ example: 'UNPAID' })
  paymentStatus!: string;

  @ApiProperty({ example: 'PENDING' })
  depositStatus!: string;

  @ApiProperty({ example: 480000 })
  grandTotal!: number;

  @ApiProperty({ example: 500000 })
  depositRequired!: number;

  @ApiProperty({ type: String, example: 'bank_transfer', nullable: true })
  preferredPaymentMethod!: string | null;

  @ApiProperty({ example: 2 })
  itemCount!: number;

  @ApiProperty({ type: [WebAccountRentalOrderItemPreviewResDto] })
  itemsPreview!: WebAccountRentalOrderItemPreviewResDto[];
}

export class WebAccountRentalOrdersListResDto {
  @ApiProperty({ type: [WebAccountRentalOrderListItemResDto] })
  items!: WebAccountRentalOrderListItemResDto[];

  @ApiProperty({ type: PaginationMetaResDto })
  meta!: PaginationMetaResDto;
}

export class WebAccountRentalOrderLineResDto {
  @ApiProperty({ format: 'uuid' })
  productId!: string;

  @ApiProperty()
  productName!: string;

  @ApiProperty()
  variantName!: string;

  @ApiProperty()
  quantity!: number;

  @ApiProperty()
  unitRentalPrice!: number;

  @ApiProperty()
  lineTotal!: number;

  @ApiProperty()
  depositAmount!: number;
}

export class WebAccountRentalOrderDeliveryResDto {
  @ApiProperty()
  method!: string;

  @ApiProperty()
  status!: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  scheduledAt!: string | null;

  @ApiProperty({ type: String, nullable: true })
  recipientName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  recipientPhone!: string | null;

  @ApiProperty({ type: String, nullable: true })
  addressLine!: string | null;

  @ApiProperty()
  shippingFee!: number;
}

export class WebAccountRentalOrderTimelineEntryResDto {
  @ApiProperty({ enum: WEB_ACCOUNT_RENTAL_ORDER_STATUSES })
  status!: string;

  @ApiProperty({ format: 'date-time' })
  changedAt!: string;
}

export class WebAccountRentalOrderDetailResDto extends WebAccountRentalOrderListItemResDto {
  @ApiProperty()
  rentalSubtotal!: number;

  @ApiProperty()
  chargesTotal!: number;

  @ApiProperty()
  discountTotal!: number;

  @ApiProperty()
  collateralMethod!: string;

  @ApiProperty({ type: String, nullable: true })
  documentType!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  actualReturnedAt!: string | null;

  @ApiProperty({ type: [WebAccountRentalOrderLineResDto] })
  items!: WebAccountRentalOrderLineResDto[];

  @ApiProperty({ type: [WebAccountRentalOrderDeliveryResDto] })
  deliveries!: WebAccountRentalOrderDeliveryResDto[];

  @ApiProperty({ type: [WebAccountRentalOrderTimelineEntryResDto] })
  timeline!: WebAccountRentalOrderTimelineEntryResDto[];
}

export class WebAccountRentalOrderCancellationResDto {
  @ApiProperty({ example: 'RT260928-001' })
  orderCode!: string;

  @ApiProperty({ enum: ['CANCELLED'], example: 'CANCELLED' })
  status!: 'CANCELLED';

  @ApiProperty({ format: 'date-time' })
  cancelledAt!: string;
}
