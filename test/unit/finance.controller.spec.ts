import type { CurrentUser } from '../../src/common/types/current-user';
import { FinanceController } from '../../src/modules/finance/api/finance.controller';
import type { FinanceService } from '../../src/modules/finance/application/finance.service';

describe('FinanceController manual receipt idempotency', () => {
  const user: CurrentUser = {
    userId: 'user-1',
    memberId: 'member-1',
    shopId: 'shop-1',
    email: 'staff@example.test',
    fullName: 'Staff',
    permissions: ['payments.create'],
  };
  const body = {
    direction: 'IN' as const,
    purpose: 'RENTAL_PAYMENT' as const,
    paymentMethod: 'CASH' as const,
    amount: 100000,
  };

  it('forwards the exact single header value and rejects no transport data itself', async () => {
    const createPayment = jest.fn().mockResolvedValue({ id: 'payment-1' });
    const controller = new FinanceController({ createPayment } as unknown as FinanceService);

    await controller.createPayment(user, 'order-1', body, {
      rawHeaders: ['Content-Type', 'application/json', 'Idempotency-Key', 'receipt-key-1'],
    } as never);

    expect(createPayment).toHaveBeenCalledWith(user, 'order-1', body, 'receipt-key-1');
  });

  it('preserves duplicate values for the service validator instead of silently choosing one', async () => {
    const createPayment = jest.fn().mockResolvedValue({ id: 'payment-1' });
    const controller = new FinanceController({ createPayment } as unknown as FinanceService);

    await controller.createPayment(user, 'order-1', body, {
      rawHeaders: ['Idempotency-Key', 'receipt-key-1', 'Idempotency-Key', 'receipt-key-2'],
    } as never);

    expect(createPayment).toHaveBeenCalledWith(user, 'order-1', body, [
      'receipt-key-1',
      'receipt-key-2',
    ]);
  });
});
