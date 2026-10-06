import { RentalCreationService } from '../../src/modules/rentals/application/rental-creation.service';
import { RentalLifecycleService } from '../../src/modules/rentals/application/rental-lifecycle.service';
import type { BookableVariant } from '../../src/modules/rentals/domain/ports/rental-availability.port';
import type { RentalCreationRepository } from '../../src/modules/rentals/domain/ports/rental-creation.port';
import type { RentalLifecycleRepository } from '../../src/modules/rentals/domain/ports/rental-lifecycle.port';
import type { AuditPort } from '../../src/modules/audit/domain/audit.port';
import type { Clock } from '../../src/common/clock/clock';
import type { CurrentUser } from '../../src/common/types/current-user';
import type { RentalOrderDetails } from '../../src/modules/rentals/domain/rental.models';
import { RENTAL_STATUS } from '../../src/modules/rentals/domain/rental-status';
import { Prisma } from '@prisma/client';
import { rentalServicePorts } from '../fixtures/rental-ports.fixture';
import { rentalPolicies } from '../fixtures/rental-policy.fixture';
import {
  InvalidRentalInputError,
  RentalNotFoundError,
  RentalOperationConflictError,
  RentalOperationNotAllowedError,
} from '../../src/modules/rentals/application/rental.errors';

type CompleteRentalOrder = NonNullable<RentalOrderDetails>;

describe('Rental creation and lifecycle services', () => {
  let service: RentalCreationService;
  let lifecycleService: RentalLifecycleService;
  let ports: ReturnType<typeof rentalServicePorts>;
  let audit: jest.Mocked<AuditPort>;
  let clock: jest.Mocked<Clock>;

  let createOrderMock: jest.MockedFunction<RentalCreationRepository['createOrder']>;
  let rescheduleMock: jest.MockedFunction<RentalLifecycleRepository['reschedule']>;
  let auditLogMock: jest.MockedFunction<AuditPort['log']>;

  const fixedTime = new Date('2026-10-01T12:00:00.000Z');

  const currentUser: CurrentUser = {
    userId: 'user-123',
    memberId: 'member-123',
    shopId: 'shop-123',
    email: 'user@example.com',
    fullName: 'Test User',
    permissions: ['rentals.create', 'rentals.manage'],
  };

  const createSampleOrder = (override?: Partial<CompleteRentalOrder>): CompleteRentalOrder => ({
    id: 'order-1',
    shopId: 'shop-123',
    orderNumber: 'RT-20261001-0001',
    customerId: 'cust-1',
    source: 'OFFLINE',
    webAccountId: null,
    locationId: 'loc-1',
    rentalStartAt: new Date('2026-10-05T00:00:00.000Z'),
    rentalEndAt: new Date('2026-10-07T00:00:00.000Z'),
    actualStartedAt: null,
    actualReturnedAt: null,
    completedAt: null,
    cancelledAt: null,
    status: RENTAL_STATUS.RESERVED,
    paymentStatus: 'UNPAID',
    depositStatus: 'PENDING',
    currency: 'VND',
    rentalSubtotal: new Prisma.Decimal(200000),
    chargesTotal: new Prisma.Decimal(0),
    discountTotal: new Prisma.Decimal(0),
    depositRequired: new Prisma.Decimal(300000),
    collateralMethod: 'CASH',
    documentType: null,
    collateralStatus: 'REQUIRED',
    collateralReceivedAt: null,
    collateralReturnedAt: null,
    grandTotal: new Prisma.Decimal(200000),
    note: null,
    internalNote: null,
    metadata: null,
    createdBy: 'member-123',
    updatedBy: 'member-123',
    createdAt: fixedTime,
    updatedAt: fixedTime,
    customer: {
      id: 'cust-1',
      shopId: 'shop-123',
      customerCode: 'CUST-1',
      fullName: 'Customer One',
      phone: '0901234567',
      normalizedPhone: '0901234567',
      email: null,
      facebook: null,
      zalo: null,
      birthday: null,
      gender: null,
      customerType: 'NORMAL',
      status: 'ACTIVE',
      source: null,
      metadata: null,
      createdAt: fixedTime,
      updatedAt: fixedTime,
      archivedAt: null,
    },
    location: null,
    items: [],
    charges: [],
    deliveries: [],
    payments: [],
    confirmation: null,
    returnRecord: null,
    settlement: null,
    statusHistory: [],
    ...override,
  });

  beforeEach(() => {
    createOrderMock = jest.fn().mockResolvedValue(createSampleOrder());
    rescheduleMock = jest.fn().mockResolvedValue(createSampleOrder());
    auditLogMock = jest.fn().mockResolvedValue(undefined);

    ports = rentalServicePorts();
    ports.creation.createOrder = createOrderMock;
    ports.lifecycle.reschedule = rescheduleMock;
    ports.orderReader.get.mockResolvedValue(createSampleOrder());
    ports.orderReader.getStatus.mockResolvedValue(RENTAL_STATUS.RESERVED);
    ports.orderReader.getSchedule.mockResolvedValue({
      status: RENTAL_STATUS.RESERVED,
      rentalStartAt: new Date('2026-10-05T00:00:00.000Z'),
      rentalEndAt: new Date('2026-10-07T00:00:00.000Z'),
    });
    ports.orderReader.getReturnPreview.mockResolvedValue({
      dueAt: new Date('2026-10-07T00:00:00.000Z'),
      actualReturnedAt: new Date('2026-10-07T00:00:00.000Z'),
      lateDays: 0,
      dailyLateFeePerSet: 10000,
      lateFee: '0.00',
      additionalRental: '0.00',
      itemCount: 0,
      rentalSubtotal: '0.00',
      depositHeld: '0.00',
      collateralMethod: 'CASH',
      documentType: null,
    });
    ports.lifecycle.transition.mockResolvedValue(createSampleOrder());
    ports.lifecycle.addCharge.mockResolvedValue(createSampleOrder());
    ports.lifecycle.returnCollateral.mockResolvedValue(createSampleOrder());
    ports.lifecycle.receiveReturn.mockResolvedValue(createSampleOrder());

    audit = {
      log: auditLogMock,
    };

    clock = {
      now: jest.fn().mockReturnValue(fixedTime),
    };

    service = new RentalCreationService(
      ports.creation,
      ports.creationValidator,
      ports.availability,
      audit,
      clock,
      rentalPolicies,
    );
    lifecycleService = new RentalLifecycleService(ports.orderReader, ports.lifecycle, audit);
  });

  describe('create', () => {
    it('throws Error if rentalStartAt is >= rentalEndAt', async () => {
      await expect(
        service.create(currentUser, {
          customerId: 'cust-1',
          rentalStartAt: '2026-10-05T10:00:00.000Z',
          rentalEndAt: '2026-10-05T10:00:00.000Z',
          discountTotal: 0,
          items: [{ variantId: 'var-1', quantity: 1 }],
          charges: [],
        }),
      ).rejects.toThrow(InvalidRentalInputError);
    });

    it('throws Error if customer does not exist in shop', async () => {
      ports.creationValidator.customerExists.mockResolvedValueOnce(false);

      await expect(
        service.create(currentUser, {
          customerId: 'non-existent',
          rentalStartAt: '2026-10-05T10:00:00.000Z',
          rentalEndAt: '2026-10-07T10:00:00.000Z',
          discountTotal: 0,
          items: [{ variantId: 'var-1', quantity: 1 }],
          charges: [],
        }),
      ).rejects.toThrow(
        new RentalNotFoundError('Khách hàng không tồn tại hoặc đã ngừng hoạt động.'),
      );
    });

    it('throws Error if location is specified but does not exist in shop', async () => {
      ports.creationValidator.locationExists.mockResolvedValueOnce(false);

      await expect(
        service.create(currentUser, {
          customerId: 'cust-1',
          locationId: 'non-existent-loc',
          rentalStartAt: '2026-10-05T10:00:00.000Z',
          rentalEndAt: '2026-10-07T10:00:00.000Z',
          discountTotal: 0,
          items: [{ variantId: 'var-1', quantity: 1 }],
          charges: [],
        }),
      ).rejects.toThrow(
        new RentalNotFoundError('Địa điểm cửa hàng không tồn tại hoặc đã ngừng hoạt động.'),
      );
    });

    it('throws Error if duplicate variants are submitted in single order', async () => {
      await expect(
        service.create(currentUser, {
          customerId: 'cust-1',
          rentalStartAt: '2026-10-05T10:00:00.000Z',
          rentalEndAt: '2026-10-07T10:00:00.000Z',
          discountTotal: 0,
          items: [
            { variantId: 'var-1', quantity: 1 },
            { variantId: 'var-1', quantity: 2 },
          ],
          charges: [],
        }),
      ).rejects.toThrow(
        new InvalidRentalInputError(
          'Mỗi biến thể sản phẩm chỉ được xuất hiện một lần trong đơn thuê.',
        ),
      );
    });

    it('throws Error if charge type is unsupported', async () => {
      await expect(
        service.create(currentUser, {
          customerId: 'cust-1',
          rentalStartAt: '2026-10-05T10:00:00.000Z',
          rentalEndAt: '2026-10-07T10:00:00.000Z',
          discountTotal: 0,
          items: [{ variantId: 'var-1', quantity: 1 }],
          charges: [{ chargeType: 'UNSUPPORTED_TYPE', amount: 50000, quantity: 1 }],
        }),
      ).rejects.toThrow(InvalidRentalInputError);
    });

    it('throws Error if variant is not rentable or not found', async () => {
      ports.availability.getBookableVariant.mockResolvedValueOnce(null);

      await expect(
        service.create(currentUser, {
          customerId: 'cust-1',
          rentalStartAt: '2026-10-05T10:00:00.000Z',
          rentalEndAt: '2026-10-07T10:00:00.000Z',
          discountTotal: 0,
          items: [{ variantId: 'var-1', quantity: 1 }],
          charges: [],
        }),
      ).rejects.toThrow(new RentalNotFoundError('Biến thể var-1 không được phép cho thuê.'));
    });

    it('uses shop cycle pricing when no product rate is configured for the duration', async () => {
      const bookableVariant: BookableVariant = {
        id: 'var-1',
        variantCode: 'VAR-1',
        productId: 'prod-1',
        productName: 'Product One',
        sizeName: 'M',
        colorName: 'Red',
        depositPerItem: 200000,
        ratePrice: null,
        availableInventory: [{ id: 'inv-1', sku: 'SKU-1' }],
      };
      ports.availability.getBookableVariant.mockResolvedValueOnce(bookableVariant);

      await expect(
        service.create(currentUser, {
          customerId: 'cust-1',
          rentalStartAt: '2026-10-05T10:00:00.000Z',
          rentalEndAt: '2026-10-07T10:00:00.000Z',
          discountTotal: 0,
          items: [{ variantId: 'var-1', quantity: 1 }],
          charges: [],
        }),
      ).resolves.toBeDefined();
    });

    it('throws Error if available inventory is insufficient for requested quantity', async () => {
      const bookableVariant: BookableVariant = {
        id: 'var-1',
        variantCode: 'VAR-1',
        productId: 'prod-1',
        productName: 'Product One',
        sizeName: 'M',
        colorName: 'Red',
        depositPerItem: 200000,
        ratePrice: 100000,
        availableInventory: [{ id: 'inv-1', sku: 'SKU-1' }], // only 1 available
      };
      ports.availability.getBookableVariant.mockResolvedValueOnce(bookableVariant);

      await expect(
        service.create(currentUser, {
          customerId: 'cust-1',
          rentalStartAt: '2026-10-05T10:00:00.000Z',
          rentalEndAt: '2026-10-07T10:00:00.000Z',
          discountTotal: 0,
          items: [{ variantId: 'var-1', quantity: 2 }], // requested 2
          charges: [],
        }),
      ).rejects.toThrow(RentalOperationConflictError);
    });

    it('orchestrates valid rental creation and logs audit event', async () => {
      const bookableVariant: BookableVariant = {
        id: 'var-1',
        variantCode: 'VAR-1',
        productId: 'prod-1',
        productName: 'Product One',
        sizeName: 'M',
        colorName: 'Red',
        depositPerItem: 200000,
        ratePrice: 100000,
        availableInventory: [
          { id: 'inv-1', sku: 'SKU-1' },
          { id: 'inv-2', sku: 'SKU-2' },
        ],
      };
      ports.availability.getBookableVariant.mockResolvedValueOnce(bookableVariant);

      const result = await service.create(currentUser, {
        customerId: 'cust-1',
        rentalStartAt: '2026-10-05T10:00:00.000Z',
        rentalEndAt: '2026-10-07T10:00:00.000Z',
        discountTotal: 0,
        items: [{ variantId: 'var-1', quantity: 1 }],
        charges: [],
      });

      expect(result).toBeDefined();
      expect(createOrderMock).toHaveBeenCalledTimes(1);
      expect(createOrderMock).toHaveBeenCalledWith(expect.objectContaining({ source: 'OFFLINE' }));
      expect(auditLogMock).toHaveBeenCalledWith(
        expect.objectContaining({
          shopId: currentUser.shopId,
          actorUserId: currentUser.userId,
          action: 'CREATE',
          entityType: 'rental_order',
        }),
      );
    });

    it('allows admin to override unitRentalPrice even if ratePrice is null', async () => {
      const bookableVariant: BookableVariant = {
        id: 'var-1',
        variantCode: 'VAR-1',
        productId: 'prod-1',
        productName: 'Product One',
        sizeName: 'M',
        colorName: 'Red',
        depositPerItem: 200000,
        ratePrice: null,
        availableInventory: [{ id: 'inv-1', sku: 'SKU-1' }],
      };
      ports.availability.getBookableVariant.mockResolvedValueOnce(bookableVariant);

      await service.create(currentUser, {
        customerId: 'cust-1',
        rentalStartAt: '2026-10-05T10:00:00.000Z',
        rentalEndAt: '2026-10-07T10:00:00.000Z',
        discountTotal: 0,
        items: [{ variantId: 'var-1', quantity: 1, unitRentalPrice: 150000 }],
        charges: [],
      });

      expect(createOrderMock).toHaveBeenCalledWith(
        expect.objectContaining({
          lines: [
            expect.objectContaining({
              unitRentalPrice: 150000,
              lineTotal: 150000,
            }),
          ],
        }),
      );
    });
  });

  describe('transitions', () => {
    it('throws Error if transition is rejected by policy or concurrent status change', async () => {
      ports.orderReader.getStatus.mockResolvedValueOnce(RENTAL_STATUS.COMPLETED); // Terminal state
      ports.lifecycle.transition.mockResolvedValueOnce(null);

      await expect(
        lifecycleService.start(currentUser, 'order-1', { reason: 'Ready to start' }),
      ).rejects.toThrow(RentalOperationNotAllowedError);
    });

    it('cancels order when in RESERVED status', async () => {
      ports.orderReader.getStatus.mockResolvedValueOnce(RENTAL_STATUS.RESERVED);
      ports.lifecycle.transition.mockResolvedValueOnce(
        createSampleOrder({ status: RENTAL_STATUS.CANCELLED }),
      );

      const cancelled = await lifecycleService.cancel(currentUser, 'order-1', {
        reason: 'Customer changed mind',
      });
      expect(cancelled.status).toBe(RENTAL_STATUS.CANCELLED);
    });
  });

  describe('reschedule', () => {
    it('throws Error if order does not exist', async () => {
      ports.orderReader.getSchedule.mockResolvedValueOnce(null);

      await expect(
        lifecycleService.reschedule(currentUser, 'non-existent', {
          rentalStartAt: '2026-10-10T10:00:00.000Z',
          rentalEndAt: '2026-10-12T10:00:00.000Z',
        }),
      ).rejects.toThrow(RentalNotFoundError);
    });

    it('throws Error if order status cannot be rescheduled (e.g. ACTIVE or COMPLETED)', async () => {
      ports.orderReader.getSchedule.mockResolvedValueOnce({
        status: RENTAL_STATUS.COMPLETED,
        rentalStartAt: new Date('2026-10-01T12:00:00.000Z'),
        rentalEndAt: new Date('2026-10-01T12:00:00.000Z'),
      });

      await expect(
        lifecycleService.reschedule(currentUser, 'order-1', {
          rentalStartAt: '2026-10-10T10:00:00.000Z',
          rentalEndAt: '2026-10-12T10:00:00.000Z',
        }),
      ).rejects.toThrow(
        new RentalOperationNotAllowedError(
          'Chỉ có thể đổi lịch đơn đã đặt trước hoặc đã xác nhận.',
        ),
      );
    });

    it('throws Error if new dates are invalid (start >= end)', async () => {
      ports.orderReader.getSchedule.mockResolvedValueOnce({
        status: RENTAL_STATUS.RESERVED,
        rentalStartAt: new Date('2026-10-05T00:00:00.000Z'),
        rentalEndAt: new Date('2026-10-07T00:00:00.000Z'),
      });

      await expect(
        lifecycleService.reschedule(currentUser, 'order-1', {
          rentalStartAt: '2026-10-12T10:00:00.000Z',
          rentalEndAt: '2026-10-10T10:00:00.000Z',
        }),
      ).rejects.toThrow(
        new InvalidRentalInputError('Thời gian bắt đầu thuê phải trước thời gian kết thúc thuê.'),
      );
    });

    it('orchestrates valid reschedule and logs audit event', async () => {
      ports.orderReader.getSchedule.mockResolvedValueOnce({
        status: RENTAL_STATUS.RESERVED,
        rentalStartAt: new Date('2026-10-05T00:00:00.000Z'),
        rentalEndAt: new Date('2026-10-07T00:00:00.000Z'),
      });
      ports.lifecycle.reschedule.mockResolvedValueOnce(
        createSampleOrder({
          rentalStartAt: new Date('2026-10-10T00:00:00.000Z'),
          rentalEndAt: new Date('2026-10-12T00:00:00.000Z'),
        }),
      );

      const rescheduled = await lifecycleService.reschedule(currentUser, 'order-1', {
        rentalStartAt: '2026-10-10T00:00:00.000Z',
        rentalEndAt: '2026-10-12T00:00:00.000Z',
      });

      expect(rescheduled).toBeDefined();
      expect(rescheduleMock).toHaveBeenCalledTimes(1);
      expect(auditLogMock).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'RESCHEDULE',
          entityId: 'order-1',
        }),
      );
    });
  });
});
