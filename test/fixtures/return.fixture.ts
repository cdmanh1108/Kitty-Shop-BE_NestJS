import type { PrismaRentalRepository } from '../../src/modules/rentals/infrastructure/prisma-rental.repository';

export async function returnAndSettle(
  repository: PrismaRentalRepository,
  fixture: {
    shop: { id: string };
    member: { id: string };
    user: { id: string; fullName: string };
    data: { rentalEndAt: Date };
  },
  orderId: string,
  actualReturnedAt = fixture.data.rentalEndAt,
) {
  const actor = {
    shopId: fixture.shop.id,
    orderId,
    actorMemberId: fixture.member.id,
    actorUserId: fixture.user.id,
    actorName: fixture.user.fullName,
  };
  const order = await repository.get(fixture.shop.id, orderId);
  if (!order) throw new Error('Missing fixture order');
  await repository.receiveReturn({
    ...actor,
    actualReturnedAt,
    items: order.items.flatMap((item) =>
      item.allocations.map((allocation) => ({
        inventoryItemId: allocation.inventoryItemId,
        condition: 'CLEANING_REQUIRED',
      })),
    ),
  });
  return repository.settleOrder({ ...actor, returnDocument: true });
}
