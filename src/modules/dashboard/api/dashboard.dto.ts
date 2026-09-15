import { ApiProperty } from '@nestjs/swagger';
import { RENTAL_STATUS, type RentalStatus } from '@modules/rentals/domain/rental-status';
export class DashboardRentalResDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() customerName!: string;
  @ApiProperty({ format: 'date-time' }) pickupDate!: string;
  @ApiProperty({ enum: RENTAL_STATUS, enumName: 'RentalStatus' }) status!: RentalStatus;
  @ApiProperty() itemCount!: number;
}
export class DashboardAttentionResDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() customerName!: string;
  @ApiProperty({ format: 'date-time' }) returnDate!: string;
  @ApiProperty({ enum: RENTAL_STATUS, enumName: 'RentalStatus' }) status!: RentalStatus;
  @ApiProperty({ description: 'Outstanding non-deposit order balance in VND' })
  outstandingAmount!: number;
  @ApiProperty({ enum: ['OVERDUE', 'RETURN_SETTLEMENT', 'OUTSTANDING'] }) type!:
    | 'OVERDUE'
    | 'RETURN_SETTLEMENT'
    | 'OUTSTANDING';
}
export class DashboardRevenuePointResDto {
  @ApiProperty({ format: 'date' }) date!: string;
  @ApiProperty({ description: 'Net realized revenue in VND, excluding deposits' }) revenue!: number;
}
export class DashboardSummaryResDto {
  @ApiProperty() revenueToday!: number;
  @ApiProperty() revenueMonth!: number;
  @ApiProperty({ description: 'Non-draft, non-cancelled orders scheduled for pickup today' })
  ordersToday!: number;
  @ApiProperty({ description: 'Unreleased ACTIVE physical allocations' }) rentingProducts!: number;
  @ApiProperty({
    description: 'ACTIVE rentals due from now through the end of tomorrow in shop timezone',
  })
  dueSoon!: number;
  @ApiProperty() overdueOrders!: number;
  @ApiProperty() outstandingAmount!: number;
  @ApiProperty({ description: 'Total attention orders, independent of list limit' })
  actionRequiredOrders!: number;
  @ApiProperty({ type: [DashboardRentalResDto], maxItems: 6 })
  upcomingOrders!: DashboardRentalResDto[];
  @ApiProperty({ type: [DashboardAttentionResDto], maxItems: 6 })
  attentionOrders!: DashboardAttentionResDto[];
  @ApiProperty({ type: [DashboardRevenuePointResDto], minItems: 7, maxItems: 7 })
  revenueSeries!: DashboardRevenuePointResDto[];
}
