import { ApiProperty } from '@nestjs/swagger';

export class DashboardRevenueResDto {
  @ApiProperty({ example: 1500000 }) today!: number;
  @ApiProperty({ example: 25000000 }) month!: number;
}

export class DashboardSummaryResDto {
  @ApiProperty({ type: DashboardRevenueResDto }) revenue!: DashboardRevenueResDto;
  @ApiProperty() ordersToday!: number;
  @ApiProperty() currentlyRented!: number;
  @ApiProperty() dueToday!: number;
  @ApiProperty() overdue!: number;
  @ApiProperty() pendingReminders!: number;
  @ApiProperty({ type: Object, additionalProperties: { type: 'number' } }) inventory!: Record<
    string,
    number
  >;
  @ApiProperty({ type: [Object] }) upcoming!: object[];
}
