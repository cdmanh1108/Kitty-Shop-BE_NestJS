import { Logger } from '@nestjs/common';
import { PERMISSIONS } from '../../src/common/constants/permissions';
import type { CurrentUser } from '../../src/common/types/current-user';
import type { ObjectStoragePort } from '../../src/common/storage/object-storage.port';
import { RentalConfirmationService } from '../../src/modules/rentals/application/rental-confirmation.service';
import { RentalSettlementService } from '../../src/modules/rentals/application/rental-settlement.service';
import { DEFAULT_RENTAL_POLICY } from '../../src/modules/settings/domain/rental-policy';
import {
  rentalOrderDetailsFixture,
  rentalSettlementFixture,
} from '../fixtures/rental-order.fixture';
import {
  rentalLifecycleRepositoryMock,
  rentalOrderReaderMock,
} from '../fixtures/rental-ports.fixture';

const user: CurrentUser = {
  userId: 'user-1',
  memberId: 'member-1',
  shopId: 'shop-1',
  email: null,
  fullName: 'Admin',
  permissions: [PERMISSIONS.RENTALS_CONFIRM, PERMISSIONS.RENTALS_SETTLE],
};

const image = {
  buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
  originalname: 'evidence.jpg',
  mimetype: 'image/jpeg',
};

function storage(): jest.Mocked<ObjectStoragePort> {
  return {
    putObject: jest.fn(),
    getObject: jest.fn(),
    headObject: jest.fn(),
    deleteObject: jest.fn(),
    getPublicUrl: jest.fn(),
  };
}

afterEach(() => jest.restoreAllMocks());

describe('rental evidence storage operation policy', () => {
  it('uses the normal upload budget and cleanup budget when confirmation upload fails before commit', async () => {
    const original = new Error('storage timeout');
    const orderReader = rentalOrderReaderMock();
    orderReader.get
      .mockResolvedValueOnce(rentalOrderDetailsFixture({ status: 'RESERVED' }))
      .mockResolvedValueOnce(rentalOrderDetailsFixture({ confirmation: null }));
    const lifecycle = rentalLifecycleRepositoryMock();
    const objectStorage = storage();
    objectStorage.putObject.mockRejectedValueOnce(original);
    objectStorage.deleteObject.mockResolvedValueOnce();
    const policies = { getPolicy: jest.fn().mockResolvedValue(DEFAULT_RENTAL_POLICY) };
    const service = new RentalConfirmationService(
      orderReader,
      lifecycle,
      policies as never,
      objectStorage,
    );

    await expect(
      service.confirm(
        user,
        'order-1',
        { collateralMethod: 'CASH', collateralAmount: 100000 },
        image,
      ),
    ).rejects.toBe(original);

    expect(lifecycle.confirm.mock.calls).toHaveLength(0);
    expect(objectStorage.putObject.mock.calls).toEqual([
      [expect.any(Object), { purpose: 'default' }],
    ]);
    expect(objectStorage.deleteObject.mock.calls).toEqual([
      [expect.any(String), { purpose: 'cleanup' }],
    ]);
  });

  it('retains confirmation evidence when the post-failure DB probe is unknown', async () => {
    const original = new Error('database write failed');
    const orderReader = rentalOrderReaderMock();
    orderReader.get
      .mockResolvedValueOnce(rentalOrderDetailsFixture({ status: 'RESERVED' }))
      .mockRejectedValueOnce(new Error('database probe failed'));
    const lifecycle = rentalLifecycleRepositoryMock();
    lifecycle.confirm.mockRejectedValueOnce(original);
    const objectStorage = storage();
    objectStorage.putObject.mockResolvedValueOnce({ storageKey: 'key', publicUrl: '' });
    const log = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const policies = { getPolicy: jest.fn().mockResolvedValue(DEFAULT_RENTAL_POLICY) };
    const service = new RentalConfirmationService(
      orderReader,
      lifecycle,
      policies as never,
      objectStorage,
    );

    await expect(
      service.confirm(
        user,
        'order-1',
        { collateralMethod: 'CASH', collateralAmount: 100000 },
        image,
      ),
    ).rejects.toBe(original);

    expect(objectStorage.deleteObject.mock.calls).toHaveLength(0);
    expect(log).toHaveBeenCalledWith({
      event: 'rental.confirmation.evidence.cleanup_failed',
      orderId: 'order-1',
    });
  });

  it('keeps the original confirmation failure when cleanup delete times out or fails', async () => {
    const original = new Error('confirmation write failed');
    const orderReader = rentalOrderReaderMock();
    orderReader.get
      .mockResolvedValueOnce(rentalOrderDetailsFixture({ status: 'RESERVED' }))
      .mockResolvedValueOnce(rentalOrderDetailsFixture({ confirmation: null }));
    const lifecycle = rentalLifecycleRepositoryMock();
    lifecycle.confirm.mockRejectedValueOnce(original);
    const objectStorage = storage();
    objectStorage.putObject.mockResolvedValueOnce({ storageKey: 'key', publicUrl: '' });
    objectStorage.deleteObject.mockRejectedValueOnce(new Error('cleanup timeout'));
    const log = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const policies = { getPolicy: jest.fn().mockResolvedValue(DEFAULT_RENTAL_POLICY) };
    const service = new RentalConfirmationService(
      orderReader,
      lifecycle,
      policies as never,
      objectStorage,
    );

    await expect(
      service.confirm(
        user,
        'order-1',
        { collateralMethod: 'CASH', collateralAmount: 100000 },
        image,
      ),
    ).rejects.toBe(original);

    expect(objectStorage.deleteObject.mock.calls).toEqual([
      [expect.any(String), { purpose: 'cleanup' }],
    ]);
    expect(log).toHaveBeenCalledWith({
      event: 'rental.confirmation.evidence.cleanup_failed',
      orderId: 'order-1',
    });
  });

  it('uses the same bounded cleanup policy for settlement evidence', async () => {
    const original = new Error('settlement write failed');
    const orderReader = rentalOrderReaderMock();
    orderReader.get
      .mockResolvedValueOnce(rentalOrderDetailsFixture({ status: 'RETURNED' }))
      .mockResolvedValueOnce(rentalOrderDetailsFixture());
    const lifecycle = rentalLifecycleRepositoryMock();
    lifecycle.settleOrder.mockRejectedValueOnce(original);
    const objectStorage = storage();
    objectStorage.putObject.mockResolvedValueOnce({ storageKey: 'key', publicUrl: '' });
    objectStorage.deleteObject.mockResolvedValueOnce();
    const service = new RentalSettlementService(orderReader, lifecycle, objectStorage, {
      log: () => Promise.resolve(),
    });

    await expect(service.settle(user, 'order-1', {}, image)).rejects.toBe(original);

    expect(objectStorage.putObject.mock.calls).toEqual([
      [expect.any(Object), { purpose: 'default' }],
    ]);
    expect(objectStorage.deleteObject.mock.calls).toEqual([
      [expect.any(String), { purpose: 'cleanup' }],
    ]);
  });

  it('does not delete settlement evidence when a lost response may follow a committed settlement', async () => {
    const original = new Error('lost settlement response');
    let evidenceKey = '';
    let reads = 0;
    const orderReader = rentalOrderReaderMock();
    orderReader.get.mockImplementation(() => {
      reads += 1;
      return Promise.resolve(
        reads === 1
          ? rentalOrderDetailsFixture({ status: 'RETURNED' })
          : rentalOrderDetailsFixture({
              status: 'RETURNED',
              settlement: { ...rentalSettlementFixture(), evidenceKey },
            }),
      );
    });
    const lifecycle = rentalLifecycleRepositoryMock();
    lifecycle.settleOrder.mockRejectedValueOnce(original);
    const objectStorage = storage();
    objectStorage.putObject.mockImplementation((input) => {
      evidenceKey = input.key;
      return Promise.resolve({ storageKey: input.key, publicUrl: '' });
    });
    const service = new RentalSettlementService(orderReader, lifecycle, objectStorage, {
      log: () => Promise.resolve(),
    });

    await expect(service.settle(user, 'order-1', {}, image)).rejects.toBe(original);

    expect(evidenceKey).toContain('private/rental-settlements/shop-1/order-1/');
    expect(objectStorage.deleteObject.mock.calls).toHaveLength(0);
  });
});
