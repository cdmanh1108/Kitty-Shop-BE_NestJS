export interface PaymentStateInput {
  grandTotal: number;
  depositRequired: number;
  transactions: Array<{ amount: number; direction: string; purpose: string }>;
}

export interface PaymentStateResult {
  paymentStatus: string;
  depositStatus: string;
}

export function calculateOrderPaymentState(input: PaymentStateInput): PaymentStateResult {
  let orderIn = 0;
  let orderOut = 0;
  let depositIn = 0;
  let depositOut = 0;

  for (const transaction of input.transactions) {
    const isDeposit = ['DEPOSIT', 'DEPOSIT_REFUND'].includes(transaction.purpose);
    if (isDeposit) {
      if (transaction.direction === 'IN') depositIn += transaction.amount;
      else depositOut += transaction.amount;
    } else if (transaction.direction === 'IN') {
      orderIn += transaction.amount;
    } else {
      orderOut += transaction.amount;
    }
  }

  const netPaid = orderIn - orderOut;
  let paymentStatus = 'UNPAID';
  if (orderIn > 0 && orderOut > 0 && netPaid <= 0) paymentStatus = 'REFUNDED';
  else if (input.grandTotal <= 0 || netPaid >= input.grandTotal) paymentStatus = 'PAID';
  else if (netPaid > 0) paymentStatus = 'PARTIALLY_PAID';

  const held = depositIn - depositOut;
  let depositStatus = input.depositRequired <= 0 ? 'NOT_REQUIRED' : 'PENDING';
  if (input.depositRequired > 0 && depositIn > 0 && depositOut > 0 && held <= 0) depositStatus = 'REFUNDED';
  else if (input.depositRequired > 0 && depositOut > 0) depositStatus = 'PARTIALLY_REFUNDED';
  else if (input.depositRequired > 0 && held >= input.depositRequired) depositStatus = 'HELD';
  else if (input.depositRequired > 0 && held > 0) depositStatus = 'PARTIALLY_HELD';

  return { paymentStatus, depositStatus };
}
