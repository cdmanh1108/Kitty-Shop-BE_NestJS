import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '@database/prisma/prisma.service';
import { serializableTransaction } from '@database/prisma/transaction';
import { listCompletedPaymentLines } from '@modules/finance/public/completed-payment-reader';
import { writeTransactionalAuditLog } from '@modules/audit/public/transactional-audit';
import { assertSettlementAllowed } from '../domain/rental-monetary.policy';
import { RentalInvariantError } from '../domain/rental-errors';
import { rentalBillingRole, RENTAL_BILLING_ROLE } from '../domain/rental-accessories';
import { validateRentalReturnFeeOverride } from '../domain/rental-return-fees';
import type {
  RentalSettlementFeeOverride,
  RentalSettlementPreviewReader,
} from '../domain/ports/rental-settlement-preview.port';
import { CHARGE_TYPE } from '../domain/charge-type';
import { rentalLedger } from './rental-ledger';

export const settlementFeeContextInclude = {
  confirmation: true,
  settlement: true,
  charges: { where: { voidedAt: null } },
  returnRecord: { include: { inspections: true } },
  items: { include: { allocations: { include: { inventoryItem: { select: { sku: true } } } } } },
} satisfies Prisma.RentalOrderInclude;
type SettlementOrder = Prisma.RentalOrderGetPayload<{
  include: typeof settlementFeeContextInclude;
}>;

export async function evaluateSettlementFees(
  tx: Prisma.TransactionClient,
  order: SettlementOrder,
  feeOverrides: readonly RentalSettlementFeeOverride[] = [],
) {
  assertSettlementAllowed({ status: order.status, hasSettlement: Boolean(order.settlement) });
  const overrides = new Map<string, RentalSettlementFeeOverride>();
  for (const override of feeOverrides) {
    validateRentalReturnFeeOverride(override);
    if (overrides.has(override.inventoryItemId))
      throw new RentalInvariantError(
        'DUPLICATE_RETURN_FEE_OVERRIDE',
        'Mỗi món chỉ được ghi đè phí một lần.',
      );
    overrides.set(override.inventoryItemId, override);
  }
  const adjustments: Array<{
    inspectionId: string;
    orderItemId: string;
    inventoryItemId: string;
    previousAmount: Prisma.Decimal;
    amount: Prisma.Decimal;
    reason: string;
  }> = [];
  const items = (order.returnRecord?.inspections ?? []).map((inspection) => {
    const item = order.items.find((line) =>
      line.allocations.some(
        (allocation) => allocation.inventoryItemId === inspection.inventoryItemId,
      ),
    );
    if (!item)
      throw new RentalInvariantError(
        'UNKNOWN_RETURN_FEE_ITEM',
        'Món kiểm tra không thuộc đơn thuê.',
      );
    const allocation = item.allocations.find(
      (line) => line.inventoryItemId === inspection.inventoryItemId,
    )!;
    const free = rentalBillingRole(item.billingRole) === RENTAL_BILLING_ROLE.FREE_ACCESSORY;
    const hasSnapshot = inspection.lateFee !== null && inspection.additionalRental !== null;
    const current = hasSnapshot ? inspection.lateFee!.plus(inspection.additionalRental!) : null;
    const calculated =
      inspection.calculatedLateFee !== null && inspection.calculatedAdditionalRental !== null
        ? inspection.calculatedLateFee.plus(inspection.calculatedAdditionalRental)
        : null;
    const override = overrides.get(inspection.inventoryItemId);
    if (override && (free || !hasSnapshot))
      throw new RentalInvariantError(
        free ? 'FREE_ACCESSORY_LATE_FEE_NOT_ALLOWED' : 'RETURN_FEE_SNAPSHOT_UNAVAILABLE',
        free
          ? 'Phụ kiện miễn phí không có phí trả trễ.'
          : 'Biên bản cũ chưa lưu phí theo từng món; không thể ghi đè riêng tại bước tất toán.',
      );
    const agreed = override ? new Prisma.Decimal(override.amount) : current;
    if (override && current && agreed)
      adjustments.push({
        inspectionId: inspection.id,
        orderItemId: item.id,
        inventoryItemId: inspection.inventoryItemId,
        previousAmount: current,
        amount: agreed,
        reason: override.reason.trim(),
      });
    return {
      inventoryItemId: inspection.inventoryItemId,
      sku: allocation.inventoryItem.sku,
      productName: item.productNameSnapshot,
      billingRole: item.billingRole,
      canOverride: !free && hasSnapshot,
      calculatedFee: calculated?.toString() ?? null,
      currentFee: current?.toString() ?? null,
      agreedFee: agreed?.toString() ?? null,
      feeOverrideReason: override?.reason.trim() ?? inspection.feeOverrideReason,
    };
  });
  if ([...overrides.keys()].some((id) => !items.some((item) => item.inventoryItemId === id))) {
    throw new RentalInvariantError(
      'UNKNOWN_RETURN_FEE_ITEM',
      'Món ghi đè phí không thuộc biên bản nhận trả.',
    );
  }
  const delta = adjustments.reduce(
    (total, change) => total.plus(change.amount.minus(change.previousAmount)),
    new Prisma.Decimal(0),
  );
  const grandTotal = order.grandTotal.plus(delta);
  const totalCharges = order.chargesTotal.plus(delta);
  if (grandTotal.lessThan(0) || totalCharges.lessThan(0))
    throw new RentalInvariantError(
      'INVALID_RETURN_FEE_ADJUSTMENT',
      'Điều chỉnh phí khiến tổng đơn không hợp lệ.',
    );
  const ledger = rentalLedger(await listCompletedPaymentLines(tx, order.id));
  const remaining = Prisma.Decimal.max(0, grandTotal.minus(ledger.paidRental));
  const depositRefund = Prisma.Decimal.max(0, ledger.depositHeld.minus(remaining));
  const rentalRefund = Prisma.Decimal.max(0, ledger.paidRental.minus(grandTotal));
  const refundAmount = depositRefund.plus(rentalRefund);
  const amountDue = Prisma.Decimal.max(0, remaining.minus(ledger.depositHeld));
  const feePreviewToken = createHash('sha256')
    .update(
      JSON.stringify({
        orderId: order.id,
        updatedAt: order.updatedAt.toISOString(),
        grandTotal: grandTotal.toString(),
        totalCharges: totalCharges.toString(),
        paidRental: ledger.paidRental.toString(),
        depositIn: ledger.depositIn.toString(),
        depositOut: ledger.depositOut.toString(),
        items: [...items].sort((a, b) => a.inventoryItemId.localeCompare(b.inventoryItemId)),
      }),
    )
    .digest('hex');
  return {
    adjustments,
    delta,
    ledger,
    grandTotal,
    totalCharges,
    remaining,
    refundAmount,
    depositRefund,
    rentalRefund,
    amountDue,
    preview: {
      feePreviewToken,
      grandTotal: grandTotal.toString(),
      totalCharges: totalCharges.toString(),
      depositReceived: ledger.depositIn.toString(),
      depositAvailable: ledger.depositHeld.toString(),
      refundAmount: refundAmount.toString(),
      amountDue: amountDue.toString(),
      items,
    },
  };
}

export async function getSettlementPreview(
  prisma: PrismaService,
  input: Parameters<RentalSettlementPreviewReader['getSettlementPreview']>[0],
): ReturnType<RentalSettlementPreviewReader['getSettlementPreview']> {
  return serializableTransaction(prisma, async (tx) => {
    const order = await tx.rentalOrder.findFirst({
      where: { id: input.orderId, shopId: input.shopId },
      include: settlementFeeContextInclude,
    });
    return order ? (await evaluateSettlementFees(tx, order, input.feeOverrides)).preview : null;
  });
}

export async function persistSettlementFeeAdjustments(
  tx: Prisma.TransactionClient,
  order: SettlementOrder,
  plan: Awaited<ReturnType<typeof evaluateSettlementFees>>,
  actor: { shopId: string; actorMemberId: string; actorUserId: string },
  now: Date,
) {
  for (const change of plan.adjustments) {
    const matching = order.charges.filter((charge) => {
      const meta = charge.metadata;
      return (
        meta &&
        typeof meta === 'object' &&
        !Array.isArray(meta) &&
        typeof meta.source === 'string' &&
        ['RETURN_TIME_FEE', 'SETTLEMENT_TIME_FEE'].includes(meta.source) &&
        meta.inventoryItemId === change.inventoryItemId
      );
    });
    const recorded = matching.reduce(
      (sum, charge) => sum.plus(charge.amount.times(charge.quantity)),
      new Prisma.Decimal(0),
    );
    if (!recorded.equals(change.previousAmount))
      throw new RentalInvariantError(
        'RETURN_FEE_LEDGER_MISMATCH',
        'Phí từng món không khớp các khoản đã ghi nhận. Vui lòng kiểm tra lại đơn.',
      );
    await tx.rentalOrderCharge.updateMany({
      where: {
        shopId: actor.shopId,
        orderId: order.id,
        id: { in: matching.map((charge) => charge.id) },
        voidedAt: null,
      },
      data: { voidedAt: now, voidedBy: actor.actorMemberId },
    });
    await tx.rentalOrderCharge.create({
      data: {
        shopId: actor.shopId,
        orderId: order.id,
        orderItemId: change.orderItemId,
        chargeType: CHARGE_TYPE.LATE,
        amount: change.amount,
        quantity: 1,
        description: change.reason,
        createdBy: actor.actorMemberId,
        metadata: {
          source: 'SETTLEMENT_TIME_FEE',
          inventoryItemId: change.inventoryItemId,
          previousAmount: change.previousAmount.toString(),
          overrideReason: change.reason,
        },
      },
    });
    await tx.rentalReturnInspection.update({
      where: { id: change.inspectionId },
      data: {
        lateFee: change.amount,
        additionalRental: 0,
        feeOverrideReason: change.reason,
      },
    });
    await writeTransactionalAuditLog(tx, {
      shopId: actor.shopId,
      actorUserId: actor.actorUserId,
      actorMemberId: actor.actorMemberId,
      action: 'RETURN_ITEM_FEE_OVERRIDE',
      entityType: 'rental_order',
      entityId: order.id,
      oldValues: {
        inventoryItemId: change.inventoryItemId,
        amount: change.previousAmount.toString(),
      },
      newValues: {
        inventoryItemId: change.inventoryItemId,
        amount: change.amount.toString(),
        reason: change.reason,
      },
    });
  }
  if (plan.adjustments.length) {
    const totals = await tx.rentalReturnInspection.aggregate({
      where: { orderId: order.id },
      _sum: { lateFee: true, additionalRental: true },
    });
    await tx.rentalReturn.update({
      where: { orderId: order.id },
      data: {
        lateFee: totals._sum.lateFee ?? 0,
        additionalRental: totals._sum.additionalRental ?? 0,
      },
    });
    await tx.rentalOrder.update({
      where: { id: order.id },
      data: {
        chargesTotal: plan.totalCharges,
        grandTotal: plan.grandTotal,
        updatedBy: actor.actorMemberId,
      },
    });
  }
}
