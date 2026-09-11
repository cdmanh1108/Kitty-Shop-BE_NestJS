import type { OrderPaymentStatus, DepositStatus } from './payment-status';
import { ORDER_PAYMENT_STATUS, DEPOSIT_STATUS } from '@modules/finance/domain/payment-status';

import { PAYMENT_DIRECTION, PAYMENT_PURPOSE } from '@modules/finance/domain/payment-types';

export interface PaymentStateInput {
  grandTotal: number;
  depositRequired: number;
  transactions: Array<{ amount: number; direction: string; purpose: string }>;
}

export interface PaymentStateResult {
  paymentStatus: OrderPaymentStatus;
  depositStatus: DepositStatus;
}

export function calculateOrderPaymentState(input: PaymentStateInput): PaymentStateResult {
  let orderIn = 0;
  let orderOut = 0;
  let depositIn = 0;
  let depositOut = 0;

  for (const transaction of input.transactions) {
    const isDeposit =
      transaction.purpose === PAYMENT_PURPOSE.DEPOSIT ||
      transaction.purpose === PAYMENT_PURPOSE.DEPOSIT_REFUND;
    if (isDeposit) {
      if (transaction.direction === PAYMENT_DIRECTION.IN) depositIn += transaction.amount;
      else depositOut += transaction.amount;
    } else if (transaction.direction === PAYMENT_DIRECTION.IN) {
      orderIn += transaction.amount;
    } else {
      orderOut += transaction.amount;
    }
  }

  const netPaid = orderIn - orderOut;
  let paymentStatus: OrderPaymentStatus = ORDER_PAYMENT_STATUS.UNPAID;
  if (orderIn > 0 && orderOut > 0 && netPaid <= 0) paymentStatus = ORDER_PAYMENT_STATUS.REFUNDED;
  else if (input.grandTotal <= 0 || netPaid >= input.grandTotal)
    paymentStatus = ORDER_PAYMENT_STATUS.PAID;
  else if (netPaid > 0) paymentStatus = ORDER_PAYMENT_STATUS.PARTIALLY_PAID;

  const held = depositIn - depositOut;
  let depositStatus: DepositStatus =
    input.depositRequired <= 0 ? DEPOSIT_STATUS.NOT_REQUIRED : DEPOSIT_STATUS.PENDING;
  if (input.depositRequired > 0 && depositIn > 0 && depositOut > 0 && held <= 0)
    depositStatus = DEPOSIT_STATUS.REFUNDED;
  else if (input.depositRequired > 0 && depositOut > 0)
    depositStatus = DEPOSIT_STATUS.PARTIALLY_REFUNDED;
  else if (input.depositRequired > 0 && held >= input.depositRequired)
    depositStatus = DEPOSIT_STATUS.HELD;
  else if (input.depositRequired > 0 && held > 0) depositStatus = DEPOSIT_STATUS.PARTIALLY_HELD;

  return { paymentStatus, depositStatus };
}
