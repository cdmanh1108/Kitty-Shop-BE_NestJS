import { reconcilePaymentAttempt } from '../../src/modules/payments/domain/payment-reconciliation';
import type { PaymentLink } from '../../src/modules/payments/domain/payment';

const link: PaymentLink = {
  orderCode: 1,
  linkId: 'test',
  amount: 100,
  amountPaid: 0,
  status: 'PENDING',
  transfers: [],
};
const credits = { allRefunded: true, hasRefund: false, unresolved: false };

describe('payment reconciliation decisions', () => {
  it('waits on unknown provider results and verifies natural expiry', () => {
    const attempt = {
      state: 'PENDING',
      closeReason: null,
      reviewReason: null,
      linkId: 'test',
    } as const;
    expect(reconcilePaymentAttempt(attempt, undefined, credits).closeReason).toBeUndefined();
    expect(reconcilePaymentAttempt(attempt, null, credits).closeReason).toBeUndefined();
    expect(
      reconcilePaymentAttempt(attempt, { ...link, status: 'EXPIRED' }, credits).closeReason,
    ).toBe('EXPIRED');
  });

  it('reopens a verified pending link after a spurious mismatch', () => {
    const attempt = {
      state: 'REVIEW',
      closeReason: null,
      reviewReason: 'LINK_MISMATCH',
      linkId: 'test',
    } as const;
    expect(reconcilePaymentAttempt(attempt, link, credits)).toMatchObject({
      state: 'PENDING',
      reviewReason: null,
    });
    expect(reconcilePaymentAttempt(attempt, link, { ...credits, unresolved: true })).toMatchObject({
      state: 'REVIEW',
    });
  });
});
