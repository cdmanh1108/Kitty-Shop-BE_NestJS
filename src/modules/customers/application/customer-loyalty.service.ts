import { ShopResolver } from '@common/shop-context/shop-resolver';
import { Inject, Injectable } from '@nestjs/common';
import {
  RENTAL_POLICY_PROVIDER,
  type RentalPolicyProvider,
} from '@modules/settings/public/rental-policy';
import { CustomerNotFoundError } from './customer.errors';
import {
  CUSTOMER_LOYALTY_READER,
  type CustomerLoyaltyReader,
} from '../domain/customer-loyalty.reader';
import type { CustomerLoyaltyOwner } from '../domain/customer-loyalty';

@Injectable()
export class CustomerLoyaltyService {
  constructor(
    @Inject(CUSTOMER_LOYALTY_READER) private readonly loyalty: CustomerLoyaltyReader,
    @Inject(RENTAL_POLICY_PROVIDER) private readonly policies: RentalPolicyProvider,
    private readonly shops: ShopResolver,
  ) {}

  async forWebAccount(webAccountId: string) {
    const shopId = await this.shops.resolveShopId();
    return this.getSummary(shopId, { type: 'WEB_ACCOUNT', webAccountId });
  }

  async forCustomer(shopId: string, customerId: string) {
    const summary = await this.getSummary(shopId, { type: 'CRM_CUSTOMER', customerId });
    if (!summary) throw new CustomerNotFoundError();
    return summary;
  }

  findAvailableWebReward(shopId: string, webAccountId: string, rewardId: string) {
    return this.loyalty.findAvailableWebReward({ shopId, webAccountId, rewardId });
  }

  private async getSummary(shopId: string, owner: CustomerLoyaltyOwner) {
    const [policy, progress] = await Promise.all([
      this.policies.getPolicy(shopId),
      this.loyalty.getProgress({ shopId, owner }),
    ]);
    const completedRentalCount = progress?.completedRentalCount ?? 0;
    const availableRewards = progress?.availableRewards ?? [];
    const rentalsRequired = policy.loyalty.rentalsRequired;
    const currentCycleProgress = completedRentalCount % rentalsRequired;

    return {
      enabled: policy.loyalty.enabled,
      rentalsRequired,
      rewardValue: policy.loyalty.rewardRentalValue,
      completedRentalCount,
      currentCycleProgress,
      rentalsUntilReward: policy.loyalty.enabled ? rentalsRequired - currentCycleProgress : 0,
      availableRewardCount: availableRewards.length,
      availableRewardValue: availableRewards.reduce(
        (total, reward) => total + reward.rewardValue,
        0,
      ),
      availableRewards,
    };
  }
}
