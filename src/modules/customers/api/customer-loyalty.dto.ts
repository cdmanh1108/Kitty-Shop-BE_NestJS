import { ApiProperty } from '@nestjs/swagger';

export class CustomerLoyaltyRewardResDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: ['AVAILABLE', 'REDEEMED', 'REVOKED'] }) status!: string;
  @ApiProperty({ example: 50000, description: 'Giá trị ưu đãi (VND).' }) rewardValue!: number;
  @ApiProperty({ type: String, format: 'date-time' }) earnedAt!: Date;
  @ApiProperty({ example: 'RT-20261007-AB12CD' }) earnedOrderNumber!: string;
}

export class CustomerLoyaltySummaryResDto {
  @ApiProperty() enabled!: boolean;
  @ApiProperty({ example: 5 }) rentalsRequired!: number;
  @ApiProperty({ example: 50000 }) rewardValue!: number;
  @ApiProperty({ example: 7 }) completedRentalCount!: number;
  @ApiProperty({ example: 2 }) currentCycleProgress!: number;
  @ApiProperty({ example: 3 }) rentalsUntilReward!: number;
  @ApiProperty({ example: 1 }) availableRewardCount!: number;
  @ApiProperty({ example: 50000 }) availableRewardValue!: number;
  @ApiProperty({ type: [CustomerLoyaltyRewardResDto] })
  availableRewards!: CustomerLoyaltyRewardResDto[];
}
