import type { Clock } from '@common/clock/clock';
import type { PrismaService } from '@database/prisma/prisma.service';
import { serializableTransaction } from '@database/prisma/transaction';
import type { RentalPolicy } from '@modules/settings/domain/rental-policy';
import { RENTAL_STATUS } from '../domain/rental-status';
import { calculateLateCharges } from '../domain/rental-settlement';
import { RentalInvariantError } from '../domain/rental-errors';
import type { RentalOrderDetails } from '../domain/rental.models';
import type { ReturnPreviewData } from '../domain/rental.repository';
import { rentalLedger } from './rental-ledger';
import { getWithTx } from './rental-queries';

export async function getReturnPreview(
  prisma: PrismaService,
  shopId: string,
  orderId: string,
  returnedAt: Date | undefined,
  policy: RentalPolicy,
  clock: Clock,
): Promise<ReturnPreviewData> {
  const order = await prisma.rentalOrder.findFirst({
    where: { id: orderId, shopId },
    include: {
      items: true,
      confirmation: true,
      payments: { where: { status: 'COMPLETED', voidedAt: null } },
    },
  });
  if (!order) throw new RentalInvariantError('RENTAL_NOT_FOUND', 'Không tìm thấy đơn thuê.');

  const effectiveReturnedAt = returnedAt ?? clock.now();
  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
  const late = calculateLateCharges({
    dueAt: order.rentalEndAt,
    returnedAt: effectiveReturnedAt,
    itemCount,
    rentalSubtotal: order.rentalSubtotal.toString(),
    policy,
  });
  return {
    dueAt: order.rentalEndAt,
    actualReturnedAt: effectiveReturnedAt,
    lateDays: late.lateDays,
    dailyLateFeePerSet: policy.lateReturn.feePerItemPerDay,
    lateFee: late.lateFee,
    additionalRental: late.additionalRental,
    itemCount,
    rentalSubtotal: order.rentalSubtotal.toString(),
    depositHeld: rentalLedger(order.payments).depositHeld.toString(),
    collateralMethod: order.collateralMethod,
    documentType: order.documentType,
  };
}

export async function returnDocumentCollateral(
  prisma: PrismaService,
  shopId: string,
  orderId: string,
  changedBy: string,
  clock: Clock,
): Promise<RentalOrderDetails> {
  return serializableTransaction(prisma, async (tx) => {
    const order = await tx.rentalOrder.findFirst({ where: { id: orderId, shopId } });
    if (!order) return null;
    if (order.collateralMethod !== 'DOCUMENT') {
      throw new RentalInvariantError(
        'COLLATERAL_METHOD_NOT_ALLOWED',
        'Đơn thuê này không đặt cọc bằng giấy tờ.',
      );
    }
    if (
      (order.status !== RENTAL_STATUS.COMPLETED && order.status !== RENTAL_STATUS.RETURNED) ||
      order.collateralStatus !== 'HELD'
    ) {
      throw new RentalInvariantError(
        'COLLATERAL_TRANSITION_NOT_ALLOWED',
        'Không thể trả giấy tờ đặt cọc ở trạng thái hiện tại.',
      );
    }
    await tx.rentalOrder.update({
      where: { id: order.id },
      data: {
        collateralStatus: 'RETURNED',
        collateralReturnedAt: clock.now(),
        updatedBy: changedBy,
      },
    });
    await tx.outboxEvent.create({
      data: {
        shopId,
        eventType: 'RENTAL_COLLATERAL_RETURNED',
        aggregateType: 'rental_order',
        aggregateId: order.id,
        payload: { orderId: order.id },
      },
    });
    return getWithTx(tx, shopId, order.id);
  });
}
