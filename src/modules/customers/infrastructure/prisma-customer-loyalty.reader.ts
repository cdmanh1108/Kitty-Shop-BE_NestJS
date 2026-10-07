import { Prisma } from '@prisma/client';
import { PrismaService } from '@database/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import type { CustomerLoyaltyOwner } from '../domain/customer-loyalty';
import type { CustomerLoyaltyReader } from '../domain/customer-loyalty.reader';

@Injectable()
export class PrismaCustomerLoyaltyReader implements CustomerLoyaltyReader {
  constructor(private readonly prisma: PrismaService) {}

  async findAvailableWebReward(input: { shopId: string; webAccountId: string; rewardId: string }) {
    const reward = await this.prisma.customerLoyaltyReward.findFirst({
      where: {
        id: input.rewardId,
        shopId: input.shopId,
        ownerType: 'WEB_ACCOUNT',
        webAccountId: input.webAccountId,
        status: 'AVAILABLE',
      },
      select: { id: true, rewardValue: true },
    });
    return reward ? { id: reward.id, rewardValue: reward.rewardValue.toNumber() } : null;
  }

  async getProgress(input: { shopId: string; owner: CustomerLoyaltyOwner }) {
    return this.prisma.$transaction(
      async (tx) => {
        if (input.owner.type === 'CRM_CUSTOMER') {
          const customer = await tx.customer.findFirst({
            where: { id: input.owner.customerId, shopId: input.shopId, archivedAt: null },
            select: { id: true },
          });
          if (!customer) return null;
        }

        const ownerWhere =
          input.owner.type === 'WEB_ACCOUNT'
            ? { ownerType: 'WEB_ACCOUNT' as const, webAccountId: input.owner.webAccountId }
            : { ownerType: 'CRM_CUSTOMER' as const, customerId: input.owner.customerId };
        const where = { shopId: input.shopId, ...ownerWhere, entryType: 'QUALIFIED' };
        const [completedRentalCount, availableRewards] = await Promise.all([
          tx.customerLoyaltyEntry.count({ where }),
          tx.customerLoyaltyReward.findMany({
            where: { shopId: input.shopId, ...ownerWhere, status: 'AVAILABLE' },
            select: {
              id: true,
              rewardValue: true,
              status: true,
              createdAt: true,
              earnedOrder: { select: { orderNumber: true } },
            },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          }),
        ]);

        return {
          completedRentalCount,
          availableRewards: availableRewards.map((reward) => ({
            id: reward.id,
            rewardValue: reward.rewardValue.toNumber(),
            status: reward.status,
            earnedAt: reward.createdAt,
            earnedOrderNumber: reward.earnedOrder.orderNumber,
          })),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
