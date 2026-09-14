import { calculateRentalSettlement } from '../../src/modules/rentals/domain/rental-settlement';

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
});
