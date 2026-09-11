import { calculateOrderPaymentState } from '@modules/finance/domain/payment-state';

describe('calculateOrderPaymentState', () => {
  it('does not count deposit as rental payment', () => {
    expect(
      calculateOrderPaymentState({
        grandTotal: 500_000,
        depositRequired: 1_000_000,
        transactions: [{ amount: 1_000_000, direction: 'IN', purpose: 'DEPOSIT' }],
      }),
    ).toEqual({ paymentStatus: 'UNPAID', depositStatus: 'HELD' });
  });

  it('tracks partial payment independently from held deposit', () => {
    expect(
      calculateOrderPaymentState({
        grandTotal: 500_000,
        depositRequired: 1_000_000,
        transactions: [
          { amount: 250_000, direction: 'IN', purpose: 'RENTAL_PAYMENT' },
          { amount: 1_000_000, direction: 'IN', purpose: 'DEPOSIT' },
        ],
      }),
    ).toEqual({ paymentStatus: 'PARTIALLY_PAID', depositStatus: 'HELD' });
  });

  it('marks a fully returned deposit as refunded', () => {
    expect(
      calculateOrderPaymentState({
        grandTotal: 500_000,
        depositRequired: 1_000_000,
        transactions: [
          { amount: 500_000, direction: 'IN', purpose: 'RENTAL_PAYMENT' },
          { amount: 1_000_000, direction: 'IN', purpose: 'DEPOSIT' },
          { amount: 1_000_000, direction: 'OUT', purpose: 'DEPOSIT_REFUND' },
        ],
      }),
    ).toEqual({ paymentStatus: 'PAID', depositStatus: 'REFUNDED' });
  });
});
