import { Prisma } from '@prisma/client';
import { recomputeOrderPaymentState } from '@modules/finance/public/order-payment-state-transaction';
import { recordRentalReceipt } from '@modules/finance/public/rental-receipt-transaction';
import { listCompletedPaymentLines } from '@modules/finance/public/completed-payment-reader';
import { writeTransactionalAuditLog } from '@modules/audit/public/transactional-audit';
import { rentalLedger } from './rental-ledger';
import type { PrismaService } from '@database/prisma/prisma.service';
import { serializableTransaction } from '@database/prisma/transaction';
import type { Clock } from '@common/clock/clock';
import type { RentalPolicy } from '@modules/settings/public/rental-policy';
import { assertManualConfirmation, type ConfirmRentalData } from '../domain/rental-confirmation';
import { RentalInvariantError } from '../domain/rental-errors';
import { getWithTx } from './rental-admin.queries';
import { assertInventoryRentable } from './rental-inventory';
import { lockRentalOrder } from './rental-order-lock';
import { enqueueRentalEmail } from './rental-email.transaction';

export function confirmOrder(
  prisma: PrismaService,
  input: ConfirmRentalData,
  policy: RentalPolicy,
  clock: Clock,
) {
  return serializableTransaction(prisma, async (tx) => {
    if (!(await lockRentalOrder(tx, input))) return null;
    const order = await tx.rentalOrder.findFirst({
      where: { id: input.orderId, shopId: input.shopId },
    });
    if (!order) return null;
    if (order.status !== 'RESERVED')
      throw new RentalInvariantError(
        'RENTAL_TRANSITION_NOT_ALLOWED',
        'Chỉ có thể xác nhận đơn đang ở trạng thái đã đặt trước.',
      );
    assertManualConfirmation(input, policy);
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
    const existing = await listCompletedPaymentLines(tx, order.id);
    const ledger = rentalLedger(existing);
    const actualDeposit = new Prisma.Decimal(
      input.collateralMethod === 'CASH' ? (input.collateralAmount ?? 0) : 0,
    );
    if (ledger.depositHeld.greaterThan(actualDeposit))
      throw new RentalInvariantError(
        'DEPOSIT_ALREADY_RECEIVED',
        'Cọc đã ghi nhận lớn hơn cọc nhập vào. Vui lòng kiểm tra giao dịch trước khi xác nhận.',
      );
    const receipt = {
      orderId: order.id,
      shopId: input.shopId,
      customerId: order.customerId,
      actorMemberId: input.actorMemberId,
      paidAt: now,
      paymentMethod: input.paymentMethod ?? 'CASH',
      note: input.note,
    };
    await recordRentalReceipt(tx, {
      ...receipt,
      key: 'RC-R-' + order.id,
      purpose: 'RENTAL_PAYMENT',
      direction: 'IN',
      amount: Prisma.Decimal.max(0, order.grandTotal.minus(ledger.paidRental)),
    });
    await recordRentalReceipt(tx, {
      ...receipt,
      key: 'RC-D-' + order.id,
      purpose: 'DEPOSIT',
      direction: 'IN',
      amount: actualDeposit.minus(ledger.depositHeld),
    });
    await recomputeOrderPaymentState(tx, order.id);
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
    await writeTransactionalAuditLog(tx, {
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
    });
    const event = await tx.outboxEvent.create({
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
    if (order.source === 'ONLINE' && order.notificationEmail)
      await enqueueRentalEmail(tx, {
        shopId: input.shopId,
        orderId: order.id,
        eventId: event.id,
        event: 'CONFIRMED',
      });
    return getWithTx(tx, input.shopId, order.id);
  });
}
