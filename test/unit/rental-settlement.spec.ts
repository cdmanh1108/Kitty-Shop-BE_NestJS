import {
  calculateRentalPaymentTotals,
  calculateRentalSettlement,
} from '../../src/modules/rentals/domain/rental-settlement';

describe('rental deposit settlement', () => {
  const base = {
    status: 'RETURNED',
    grandTotal: '120000.00',
    paidRental: '100000.00',
    depositOut: '0.00',
  };

  it('marks excess held deposit refundable after unpaid charges', () => {
    expect(calculateRentalSettlement({ ...base, depositIn: '50000.00' })).toEqual({
      depositReceived: '50000.00',
      depositAvailable: '50000.00',
      refundAmount: '30000.00',
      amountStillDue: '0.00',
      settlementStatus: 'REFUND_DUE',
    });
  });

  it('balances an exact deposit and never produces negative amounts', () => {
    expect(calculateRentalSettlement({ ...base, depositIn: '20000.00' })).toMatchObject({
      refundAmount: '0.00',
      amountStillDue: '0.00',
      settlementStatus: 'BALANCED',
    });
  });

  it('reports the shortfall when the deposit is insufficient', () => {
    expect(calculateRentalSettlement({ ...base, depositIn: '5000.00' })).toMatchObject({
      refundAmount: '0.00',
      amountStillDue: '15000.00',
      settlementStatus: 'AMOUNT_DUE',
    });
  });

  it('accounts for a recorded refund without double-refunding', () => {
    expect(
      calculateRentalSettlement({ ...base, depositIn: '50000.00', depositOut: '30000.00' }),
    ).toMatchObject({
      refundAmount: '0.00',
      amountStillDue: '0.00',
      settlementStatus: 'BALANCED',
    });
  });

  it('marks settlementStatus as SETTLED when settled or completed', () => {
    expect(
      calculateRentalSettlement({ ...base, depositIn: '50000.00', hasSettlement: true }),
    ).toMatchObject({
      settlementStatus: 'SETTLED',
    });
    expect(
      calculateRentalSettlement({ ...base, status: 'COMPLETED', depositIn: '50000.00' }),
    ).toMatchObject({
      settlementStatus: 'SETTLED',
    });
  });

  it('marks settlementStatus as PENDING when order is still ACTIVE', () => {
    expect(
      calculateRentalSettlement({ ...base, status: 'ACTIVE', depositIn: '50000.00' }),
    ).toMatchObject({
      settlementStatus: 'PENDING',
    });
  });

  it('derives payment totals before presentation without floating-point arithmetic', () => {
    expect(
      calculateRentalPaymentTotals({
        grandTotal: '120000.00',
        payments: [
          { purpose: 'RENTAL', direction: 'IN', amount: '100000.00' },
          { purpose: 'RENTAL', direction: 'OUT', amount: '10.00' },
          { purpose: 'DEPOSIT', direction: 'IN', amount: '50000.00' },
          { purpose: 'DEPOSIT_REFUND', direction: 'OUT', amount: '20000.00' },
        ],
      }),
    ).toEqual({
      paidAmount: '99990',
      remainingAmount: '20010',
      depositIn: '50000',
      depositOut: '20000',
    });
  });

  it('uses every non-deposit ledger purpose, signs refunds, and preserves overpayment', () => {
    expect(
      calculateRentalPaymentTotals({
        grandTotal: '100.00',
        payments: [
          { purpose: 'RENTAL_PAYMENT', direction: 'IN', amount: '100.10' },
          { purpose: 'SHIPPING', direction: 'IN', amount: '20.20' },
          { purpose: 'LATE_FEE', direction: 'IN', amount: '3.03' },
          { purpose: 'DAMAGE_FEE', direction: 'IN', amount: '4.04' },
          { purpose: 'OTHER', direction: 'IN', amount: '5.05' },
          { purpose: 'ORDER_REFUND', direction: 'OUT', amount: '10.11' },
          { purpose: 'DEPOSIT', direction: 'IN', amount: '50.00' },
          { purpose: 'DEPOSIT_REFUND', direction: 'OUT', amount: '20.00' },
        ],
      }),
    ).toEqual({
      paidAmount: '122.31',
      remainingAmount: '0',
      depositIn: '50',
      depositOut: '20',
    });
  });

  it('does not clamp a synthetic negative net payment total', () => {
    expect(
      calculateRentalPaymentTotals({
        grandTotal: '100.00',
        payments: [{ purpose: 'ORDER_REFUND', direction: 'OUT', amount: '120.50' }],
      }),
    ).toMatchObject({ paidAmount: '-120.5', remainingAmount: '220.5' });
  });
});
