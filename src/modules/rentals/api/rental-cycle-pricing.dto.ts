import { ApiProperty } from '@nestjs/swagger';
import { RENTAL_PRICING_VERSION } from '../domain/rental-pricing-version';

/** Public calculation breakdown, without exposing the raw persistence snapshot. */
export class RentalCyclePricingResDto {
  @ApiProperty({ enum: [RENTAL_PRICING_VERSION.CYCLE] })
  version!: typeof RENTAL_PRICING_VERSION.CYCLE;
  @ApiProperty({ example: 5 }) durationDays!: number;
  @ApiProperty({
    example: 2,
    description: 'Tổng số món thuê thông thường; không gồm phụ kiện miễn phí.',
  })
  billableQuantity!: number;
  @ApiProperty({ example: 5, description: 'Ngày bắt đầu lượt mới đầu tiên, tính từ đầu kỳ thuê.' })
  renewalDay!: number;
  @ApiProperty({ example: 4 }) cycleLengthDays!: number;
  @ApiProperty({ example: 2 }) cycleCount!: number;
  @ApiProperty({ example: 3 }) additionalDayCount!: number;
  @ApiProperty({ example: 50000, description: 'Giá một lượt thuê của một món (VND).' })
  cyclePrice!: number;
  @ApiProperty({
    example: 10000,
    description: 'Phụ phí một ngày không bắt đầu lượt mới (VND / món).',
  })
  additionalDayFee!: number;
  @ApiProperty({ enum: ['SHOP', 'ORDER', 'ITEM'] }) priceSource!: 'SHOP' | 'ORDER' | 'ITEM';
  @ApiProperty({ example: 130000, description: 'Giá thuê một món cho toàn bộ thời gian (VND).' })
  unitRentalPrice!: number;
}
