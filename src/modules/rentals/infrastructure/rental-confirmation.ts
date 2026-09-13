import type { PrismaService } from '@database/prisma/prisma.service';
import { serializableTransaction } from '@database/prisma/transaction';
import type { Clock } from '@common/clock/clock';
import type { RentalPolicy } from '@modules/settings/domain/rental-policy';
import { assertManualConfirmation, type ConfirmRentalData } from '../domain/rental-confirmation';
import { RentalInvariantError } from '../domain/rental-errors';
import { getWithTx } from './rental-queries';
import { assertInventoryRentable } from './rental-inventory';

export function confirmOrder(
  prisma: PrismaService,
  input: ConfirmRentalData,
  policy: RentalPolicy,
  clock: Clock,
) {
  return serializableTransaction(prisma, async (tx) => {
    const order = await tx.rentalOrder.findFirst({
      where: { id: input.orderId, shopId: input.shopId },
    });
    if (!order) return null;
    if (order.status !== 'RESERVED')
      throw new RentalInvariantError(
        'RENTAL_TRANSITION_NOT_ALLOWED',
        'Chỉ có thể xác nhận đơn đang ở trạng thái đã đặt trước.',
      );
    assertManualConfirmation(input, order.depositRequired.toString(), policy);
    const allocations = await tx.rentalItemAllocation.findMany({
      where: { orderId: order.id, shopId: input.shopId, releasedAt: null },
      select: { inventoryItemId: true },
    });
    await assertInventoryRentable(tx, {
      shopId: input.shopId,
      inventoryIds: allocations.map((a) => a.inventoryItemId),
      excludeOrderId: order.id,
    });
    const now = clock.now();
    const updated = await tx.rentalOrder.updateMany({
      where: { id: order.id, shopId: input.shopId, status: 'RESERVED' },
      data: {
        status: 'CONFIRMED',
        collateralMethod: input.collateralMethod,
        documentType: input.documentType ?? null,
        collateralStatus: 'HELD',
        collateralReceivedAt: now,
        updatedBy: input.actorMemberId,
      },
    });
    if (updated.count !== 1)
      throw new RentalInvariantError(
        'RENTAL_TRANSITION_NOT_ALLOWED',
        'Đơn thuê vừa được cập nhật. Vui lòng tải lại.',
      );
    await tx.rentalConfirmation.create({
      data: {
        orderId: order.id,
        shopId: input.shopId,
        confirmedAt: now,
        confirmedBy: input.actorMemberId,
        actorUserId: input.actorUserId,
        actorName: input.actorName,
        rentalAmount: order.grandTotal,
        collateralMethod: input.collateralMethod,
        documentType: input.documentType,
        collateralAmount: input.collateralAmount,
        note: input.note,
        evidenceKey: input.evidence?.key,
        evidenceFilename: input.evidence?.filename,
        evidenceMimeType: input.evidence?.mimeType,
        evidenceSize: input.evidence?.size,
      },
    });
    await tx.rentalOrderItem.updateMany({
      where: { orderId: order.id, shopId: input.shopId },
      data: { status: 'CONFIRMED' },
    });
    await tx.rentalItemAllocation.updateMany({
      where: { orderId: order.id, shopId: input.shopId, status: 'HELD' },
      data: { status: 'CONFIRMED' },
    });
    await tx.rentalOrderStatusHistory.create({
      data: {
        orderId: order.id,
        shopId: input.shopId,
        fromStatus: order.status,
        toStatus: 'CONFIRMED',
        changedAt: now,
        changedBy: input.actorMemberId,
        reason: 'ADMIN_MANUAL_CONFIRMATION',
        note: input.note,
      },
    });
    await tx.auditLog.create({
      data: {
        shopId: input.shopId,
        actorUserId: input.actorUserId,
        actorMemberId: input.actorMemberId,
        requestId: input.requestId,
        action: 'RENTAL_ORDER_CONFIRMED',
        entityType: 'rental_order',
        entityId: order.id,
        oldValues: { status: order.status },
        newValues: {
          status: 'CONFIRMED',
          source: 'ADMIN_MANUAL',
          collateralMethod: input.collateralMethod,
          documentType: input.documentType ?? null,
          collateralAmount: input.collateralAmount?.toString() ?? null,
          rentalAmount: order.grandTotal.toString(),
          hasEvidence: Boolean(input.evidence),
          confirmedAt: now.toISOString(),
        },
      },
    });
    await tx.outboxEvent.create({
      data: {
        shopId: input.shopId,
        eventType: 'RENTAL_ORDER_CONFIRMED',
        aggregateType: 'rental_order',
        aggregateId: order.id,
        payload: {
          orderId: order.id,
          fromStatus: order.status,
          toStatus: 'CONFIRMED',
          source: 'ADMIN_MANUAL',
          confirmedBy: input.actorMemberId,
        },
      },
    });
    return getWithTx(tx, input.shopId, order.id);
  });
}
