import { DeliveryService } from '../../src/modules/deliveries/application/delivery.service';
import {
  DeliveryChangedConcurrentlyError,
  DeliveryNotFoundError,
  DeliveryTransitionNotAllowedError,
  InvalidDeliveryStatusError,
} from '../../src/modules/deliveries/application/delivery.errors';
import type { AuditPort } from '../../src/modules/audit/domain/audit.port';
import type { DeliveryRepository } from '../../src/modules/deliveries/domain/delivery.repository';
import type { DeliveryJobRecord } from '../../src/modules/deliveries/domain/deliveries.records';

describe('DeliveryService status transitions', () => {
  const user = {
    userId: 'user-1',
    memberId: 'member-1',
    shopId: 'shop-1',
    email: 'admin@example.test',
    fullName: 'Admin',
    permissions: ['deliveries.manage'],
  };
  const delivery: DeliveryJobRecord = {
    id: 'delivery-1',
    shopId: user.shopId,
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
    shipperName: 'Courier',
    shipperPhone: '0900000000',
    shippingFee: { toString: () => '0', toJSON: () => '0' },
    trackingCode: 'TRACK-1',
    notes: null,
    metadata: null,
    createdBy: user.memberId,
    createdAt: new Date('2026-09-22T00:00:00.000Z'),
    updatedAt: new Date('2026-09-22T00:00:00.000Z'),
  };

  const repository = () => {
    const updateStatus = jest.fn<
      ReturnType<DeliveryRepository['updateStatus']>,
      Parameters<DeliveryRepository['updateStatus']>
    >();
    return {
      port: {
        list: jest.fn(),
        create: jest.fn(),
        updateStatus,
      } satisfies DeliveryRepository,
      updateStatus,
    };
  };
  const audit = () => {
    const log = jest
      .fn<ReturnType<AuditPort['log']>, Parameters<AuditPort['log']>>()
      .mockResolvedValue(undefined);
    return { port: { log } satisfies AuditPort, log };
  };

  it('returns the committed delivery and emits one audit record with both statuses', async () => {
    const deliveries = repository();
    deliveries.updateStatus.mockResolvedValue({
      kind: 'UPDATED',
      delivery: { ...delivery, status: 'PICKED_UP' },
      fromStatus: 'READY',
    });
    const audits = audit();

    await expect(
      new DeliveryService(deliveries.port, audits.port).updateStatus(user, delivery.id, {
        status: 'PICKED_UP',
        trackingCode: 'TRACK-2',
      }),
    ).resolves.toMatchObject({ id: delivery.id, status: 'PICKED_UP' });

    expect(audits.log).toHaveBeenCalledWith({
      shopId: user.shopId,
      actorUserId: user.userId,
      actorMemberId: user.memberId,
      action: 'STATUS_CHANGE',
      entityType: 'delivery_job',
      entityId: delivery.id,
      oldValues: { status: 'READY' },
      newValues: { status: 'PICKED_UP' },
    });
  });

  it.each([
    ['NOT_FOUND', DeliveryNotFoundError, undefined],
    ['INVALID_TRANSITION', DeliveryTransitionNotAllowedError, 'DELIVERY_INVALID_TRANSITION'],
    [
      'CONCURRENT_MODIFICATION',
      DeliveryChangedConcurrentlyError,
      'DELIVERY_CONCURRENT_MODIFICATION',
    ],
  ] as const)('maps %s without emitting a success audit', async (kind, exception, code) => {
    const deliveries = repository();
    deliveries.updateStatus.mockResolvedValue({ kind });
    const audits = audit();

    try {
      await new DeliveryService(deliveries.port, audits.port).updateStatus(user, delivery.id, {
        status: 'PICKED_UP',
      });
      fail('Expected delivery status update to fail.');
    } catch (error) {
      expect(error).toBeInstanceOf(exception);
      if (code && error instanceof Error) {
        expect((error as Error & { code?: string }).code).toBe(code);
      }
    }
    expect(audits.log).not.toHaveBeenCalled();
  });

  it('rejects an invalid target enum before calling persistence', async () => {
    const deliveries = repository();
    await expect(
      new DeliveryService(deliveries.port, audit().port).updateStatus(user, delivery.id, {
        status: 'UNKNOWN' as never,
      }),
    ).rejects.toBeInstanceOf(InvalidDeliveryStatusError);
    expect(deliveries.updateStatus).not.toHaveBeenCalled();
  });
});
