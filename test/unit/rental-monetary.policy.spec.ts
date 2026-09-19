import {
  assertChargeMutationAllowed,
  assertPaymentCreationAllowed,
  assertPaymentVoidAllowed,
  assertSettlementAllowed,
} from '../../src/modules/rentals/domain/rental-monetary.policy';

function expectPolicyError(action: () => void, code: string): void {
  try {
    action();
    throw new Error('Expected monetary policy rejection');
  } catch (error) {
    expect(error).toMatchObject({ code });
  }
}

describe('rental monetary mutation policy', () => {
  it('allows charges on returned but unsettled orders', () => {
    expect(() =>
      assertChargeMutationAllowed({ status: 'RETURNED', hasSettlement: false }),
    ).not.toThrow();
  });

  it.each(['COMPLETED', 'CANCELLED'])('rejects charges on %s orders', (status) => {
    expectPolicyError(
      () => assertChargeMutationAllowed({ status, hasSettlement: false }),
      'ORDER_LOCKED',
    );
  });

  it('rejects a charge whenever a settlement row already exists', () => {
    expectPolicyError(
      () => assertChargeMutationAllowed({ status: 'RETURNED', hasSettlement: true }),
      'ORDER_ALREADY_SETTLED',
    );
  });

  it('allows settlement only for a returned unsettled order', () => {
    expect(() =>
      assertSettlementAllowed({ status: 'RETURNED', hasSettlement: false }),
    ).not.toThrow();
    expectPolicyError(
      () => assertSettlementAllowed({ status: 'CONFIRMED', hasSettlement: false }),
      'RENTAL_TRANSITION_NOT_ALLOWED',
    );
    expectPolicyError(
      () => assertSettlementAllowed({ status: 'RETURNED', hasSettlement: true }),
      'ORDER_ALREADY_SETTLED',
    );
  });

  it('allows only independent ORDER_REFUND payment creation after settlement', () => {
    expect(() =>
      assertPaymentCreationAllowed(
        { status: 'COMPLETED', hasSettlement: true },
        { direction: 'OUT', purpose: 'ORDER_REFUND' },
      ),
    ).not.toThrow();
    expectPolicyError(
      () =>
        assertPaymentCreationAllowed(
          { status: 'COMPLETED', hasSettlement: true },
          { direction: 'IN', purpose: 'RENTAL_PAYMENT' },
        ),
      'PAYMENT_RECORD_LOCKED',
    );
  });

  it('protects lifecycle receipts, internal transfers, and settled manual payments from void', () => {
    const basePayment = {
      direction: 'IN',
      purpose: 'RENTAL_PAYMENT',
      source: 'ADMIN_MANUAL',
    };
    expectPolicyError(
      () =>
        assertPaymentVoidAllowed({ status: 'CONFIRMED', hasSettlement: false }, 'order-1', {
          ...basePayment,
          receiptKey: 'RC-R-order-1',
        }),
      'PAYMENT_VOID_PROTECTED',
    );
    expectPolicyError(
      () =>
        assertPaymentVoidAllowed({ status: 'RETURNED', hasSettlement: false }, 'order-1', {
          ...basePayment,
          source: 'INTERNAL_TRANSFER',
          receiptKey: 'RS-R-order-1',
        }),
      'PAYMENT_VOID_PROTECTED',
    );
    expectPolicyError(
      () =>
        assertPaymentVoidAllowed({ status: 'RETURNED', hasSettlement: true }, 'order-1', {
          ...basePayment,
          receiptKey: null,
        }),
      'PAYMENT_VOID_PROTECTED',
    );
    expectPolicyError(
      () =>
        assertPaymentVoidAllowed(
          { status: 'CONFIRMED', hasSettlement: false, hasConfirmation: true },
          'order-1',
          { ...basePayment, receiptKey: null },
        ),
      'PAYMENT_VOID_PROTECTED',
    );
  });

  it('keeps an independent open manual payment voidable', () => {
    expect(() =>
      assertPaymentVoidAllowed({ status: 'RETURNED', hasSettlement: false }, 'order-1', {
        direction: 'IN',
        purpose: 'RENTAL_PAYMENT',
        source: 'ADMIN_MANUAL',
        receiptKey: null,
      }),
    ).not.toThrow();
  });
});
