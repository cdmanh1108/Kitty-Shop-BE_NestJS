import type { Clock } from '../../src/common/clock/clock';
import type { DeliveryJobRecord } from '../../src/modules/deliveries/domain/deliveries.records';
import { PrismaDeliveryRepository } from '../../src/modules/deliveries/infrastructure/prisma-delivery.repository';

describe('PrismaDeliveryRepository status compare-and-swap', () => {
  const clock: Clock = { now: () => new Date('2026-09-22T03:04:05.000Z') };
  const existing: DeliveryJobRecord = {
    id: 'delivery-1',
    shopId: 'shop-1',
    orderId: 'order-1',
    direction: 'OUTBOUND',
    method: 'SHOP_DELIVERY',
    status: 'READY',
    scheduledAt: null,
    pickedUpAt: null,
    deliveredAt: null,
    recipientName: null,
    recipientPhone: null,
    addressLine: null,
    ward: null,
    district: null,
    city: null,
    province: null,
    shipperName: null,
    shipperPhone: null,
    shippingFee: { toString: () => '0', toJSON: () => '0' },
    trackingCode: null,
    notes: null,
    metadata: null,
    createdBy: 'member-1',
    createdAt: new Date('2026-09-22T00:00:00.000Z'),
    updatedAt: new Date('2026-09-22T00:00:00.000Z'),
  };

  function repository(input: {
    first: DeliveryJobRecord | null;
    second?: DeliveryJobRecord | null;
    count?: number;
  }) {
    let updateInput: unknown;
    let findCalls = 0;
    const deliveryJob = {
      findFirst: jest.fn(() => {
        findCalls += 1;
        return Promise.resolve(findCalls === 1 ? input.first : (input.second ?? input.first));
      }),
      updateMany: jest.fn((args: unknown) => {
        updateInput = args;
        return Promise.resolve({ count: input.count ?? 1 });
      }),
    };
    const prisma = {
      $transaction: jest.fn(
        (callback: (tx: { deliveryJob: typeof deliveryJob }) => Promise<unknown>) =>
          callback({ deliveryJob }),
      ),
    };
    return {
      repository: new PrismaDeliveryRepository(prisma as never, clock),
      updateInput: () => updateInput,
      updateMany: deliveryJob.updateMany,
    };
  }

  it('writes the requested transition and its timestamp with the persisted expected status', async () => {
    const updated = { ...existing, status: 'PICKED_UP', pickedUpAt: clock.now() };
    const subject = repository({ first: existing, second: updated });

    await expect(
      subject.repository.updateStatus({
        shopId: existing.shopId,
        id: existing.id,
        status: 'PICKED_UP',
        shipperName: 'Courier',
        trackingCode: 'TRACK-1',
      }),
    ).resolves.toEqual({ kind: 'UPDATED', delivery: updated, fromStatus: 'READY' });

    expect(subject.updateInput()).toEqual({
      where: { id: existing.id, shopId: existing.shopId, status: 'READY' },
      data: {
        status: 'PICKED_UP',
        shipperName: 'Courier',
        shipperPhone: undefined,
        trackingCode: 'TRACK-1',
        pickedUpAt: clock.now(),
      },
    });
  });

  it('reports a lost compare-and-swap without writing a later status or metadata', async () => {
    const subject = repository({ first: existing, count: 0 });

    await expect(
      subject.repository.updateStatus({
        shopId: existing.shopId,
        id: existing.id,
        status: 'CANCELLED',
        trackingCode: 'LOSER',
      }),
    ).resolves.toEqual({ kind: 'CONCURRENT_MODIFICATION' });
    expect(subject.updateMany).toHaveBeenCalledTimes(1);
  });

  it('does not start a write for missing, same-status, terminal, or backward transitions', async () => {
    await expect(
      repository({ first: null }).repository.updateStatus({
        shopId: existing.shopId,
        id: existing.id,
        status: 'READY',
      }),
    ).resolves.toEqual({ kind: 'NOT_FOUND' });

    for (const status of ['READY', 'PENDING'] as const) {
      const subject = repository({ first: existing });
      await expect(
        subject.repository.updateStatus({ shopId: existing.shopId, id: existing.id, status }),
      ).resolves.toEqual({ kind: 'INVALID_TRANSITION' });
      expect(subject.updateMany).not.toHaveBeenCalled();
    }
  });
});
