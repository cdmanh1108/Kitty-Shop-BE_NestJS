import type { PrismaService } from '../../src/database/prisma/prisma.service';
import { transition } from '../../src/modules/rentals/infrastructure/rental-transition.lifecycle';
import { DEFAULT_RENTAL_POLICY } from '../../src/modules/settings/domain/rental-policy';
import type { Clock } from '../../src/common/clock/clock';

const clock: Clock = { now: () => new Date('2026-10-01T12:00:00Z') };
const command = {
  shopId: 'shop-a',
  orderId: 'order-a',
  fromStatuses: ['RESERVED' as const],
  toStatus: 'CONFIRMED' as const,
  changedBy: 'member-a',
};

function fakeTransaction() {
  const tx = {
    rentalOrder: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'order-a',
        shopId: 'shop-a',
        status: 'RESERVED',
        grandTotal: { toString: () => '200000.00' },
        depositRequired: { toString: () => '100000.00' },
        collateralMethod: 'CASH',
        documentType: null,
        collateralStatus: 'REQUIRED',
      }),
      updateMany: jest.fn(),
    },
    paymentTransaction: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const prisma = {
    $transaction: jest.fn(async (operation: (client: typeof tx) => Promise<unknown>) =>
      operation(tx),
    ),
  } as unknown as PrismaService;
  return { prisma, tx };
}

describe('rental transition transaction gates', () => {
  it('rejects generic confirmation without querying payment transactions', async () => {
    const { prisma, tx } = fakeTransaction();
    await expect(transition(prisma, command, DEFAULT_RENTAL_POLICY, clock)).rejects.toMatchObject({
      code: 'CONFIRMATION_REQUIRED',
    });
    expect(tx.paymentTransaction.findMany).not.toHaveBeenCalled();
    expect(tx.rentalOrder.updateMany).not.toHaveBeenCalled();
  });

  it('refuses a direct RESERVED to ACTIVE transition before any write', async () => {
    const { prisma, tx } = fakeTransaction();
    await expect(
      transition(
        prisma,
        { ...command, toStatus: 'ACTIVE', fromStatuses: ['RESERVED'] },
        DEFAULT_RENTAL_POLICY,
        clock,
      ),
    ).resolves.toBeNull();
    expect(tx.paymentTransaction.findMany).not.toHaveBeenCalled();
    expect(tx.rentalOrder.updateMany).not.toHaveBeenCalled();
  });
});
