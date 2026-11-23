import type { Prisma } from '@prisma/client';
import { OPEN_PAYMENT_STATES, PaymentUnavailableError } from '@modules/payments/public/hosted-payment';

type RentalPaymentTarget = { id: string; preferredPaymentMethod: string | null };

export async function readPayosAttemptForWrite(
  tx: Prisma.TransactionClient,
  order: RentalPaymentTarget,
) {
  if (order.preferredPaymentMethod !== 'payos') return null;
  return tx.rentalPayosAttempt.findUnique({ where: { orderId: order.id } });
}

/** Apply under the existing rental-order lock before changing financial terms or allocations. */
export async function assertPayosPaymentUnblocked(
  tx: Prisma.TransactionClient,
  order: RentalPaymentTarget,
) {
  const attempt = await readPayosAttemptForWrite(tx, order);
  if (attempt && (OPEN_PAYMENT_STATES as readonly string[]).includes(attempt.state))
    throw new PaymentUnavailableError(
      'PAYOS_PAYMENT_PENDING',
      'Đơn đang chờ thanh toán hoặc đối soát qua payOS.',
    );
  return attempt;
}
