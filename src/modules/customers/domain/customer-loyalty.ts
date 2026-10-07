export type CustomerLoyaltyOwner =
  | { type: 'CRM_CUSTOMER'; customerId: string }
  | { type: 'WEB_ACCOUNT'; webAccountId: string };

export interface CustomerLoyaltyRewardRecord {
  id: string;
  rewardValue: number;
  status: 'AVAILABLE' | 'REDEEMED' | 'REVOKED';
  earnedAt: Date;
  earnedOrderNumber: string;
}

export interface CustomerLoyaltyProgressRecord {
  completedRentalCount: number;
  availableRewards: CustomerLoyaltyRewardRecord[];
}

export type CustomerLoyaltyOwnerType = 'CRM_CUSTOMER' | 'WEB_ACCOUNT';
