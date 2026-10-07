import type { CustomerLoyaltyOwner, CustomerLoyaltyProgressRecord } from './customer-loyalty';

export const CUSTOMER_LOYALTY_READER = Symbol('CUSTOMER_LOYALTY_READER');

export interface CustomerLoyaltyReader {
  getProgress(input: {
    shopId: string;
    owner: CustomerLoyaltyOwner;
  }): Promise<CustomerLoyaltyProgressRecord | null>;
  findAvailableWebReward(input: {
    shopId: string;
    webAccountId: string;
    rewardId: string;
  }): Promise<{ id: string; rewardValue: number } | null>;
}
