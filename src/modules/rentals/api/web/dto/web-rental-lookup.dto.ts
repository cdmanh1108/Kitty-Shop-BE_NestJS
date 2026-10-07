import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RENTAL_BILLING_ROLE } from '../../../domain/rental-accessories';
import { LEGACY_PRODUCT_KIND_SNAPSHOT } from '@modules/rentals/domain/legacy-product-kind-snapshot';
import { IsNotEmpty, IsString } from 'class-validator';

export class WebOrderLookupReqDto {
  @ApiProperty({ example: 'KT260920-001', description: 'Mã đơn thuê đã được cấp' })
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng nhập mã đơn.' })
  orderCode!: string;

  @ApiProperty({ example: '0912345678', description: 'Số điện thoại đặt thuê để xác thực' })
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng nhập số điện thoại.' })
  phone!: string;
}

export class WebOrderLookupItemDto {
  @ApiPropertyOptional({ enum: Object.values(RENTAL_BILLING_ROLE) }) billingRole?: string;
  @ApiPropertyOptional({ enum: Object.values(LEGACY_PRODUCT_KIND_SNAPSHOT) })
  productKindSnapshot?: string;
  @ApiProperty({ example: 'Đầm dạ hội trắng lụa cao cấp' })
  name!: string;

  @ApiProperty({ example: 'https://images.unsplash.com/photo-1' })
  imageUrl!: string;

  @ApiProperty({ example: 1 })
  quantity!: number;
}

export class WebOrderLookupResDto {
  @ApiProperty({ example: 'KT260920-001' })
  orderCode!: string;

  @ApiProperty({ example: 'Nguyễn Văn A' })
  customerName!: string;

  @ApiProperty({ example: '091****678' })
  phoneMasked!: string;

  @ApiProperty({ example: '2026-09-20' })
  pickupDate!: string;

  @ApiProperty({ example: '2026-09-23' })
  returnDate!: string;

  @ApiProperty({ example: 'pending' })
  status!: string;

  @ApiProperty({ example: 480000 })
  totalAmount!: number;

  @ApiProperty({ example: 500000 })
  depositAmount!: number;

  @ApiProperty({
    example: 450000,
    description:
      'Net completed, non-voided non-deposit payment amount: inbound payments less outbound refunds. Deposit movements are excluded; a deposit offset contributes only its rental-payment leg.',
  })
  paidAmount!: number;

  @ApiProperty({ type: [WebOrderLookupItemDto] })
  items!: WebOrderLookupItemDto[];
}
