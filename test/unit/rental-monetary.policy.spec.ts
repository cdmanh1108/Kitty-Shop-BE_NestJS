import {
  assertChargeMutationAllowed,
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
});
