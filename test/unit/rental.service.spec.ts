import { RentalService } from '../../src/modules/rentals/application/rental.service';
import type {
  RentalRepository,
  BookableVariant,
} from '../../src/modules/rentals/domain/rental.repository';
import type { AuditPort } from '../../src/modules/audit/domain/audit.port';
import type { Clock } from '../../src/common/clock/clock';
import type { CurrentUser } from '../../src/common/types/current-user';
import type { RentalOrderDetails } from '../../src/modules/rentals/domain/rental.models';
import { RENTAL_STATUS } from '../../src/modules/rentals/domain/rental-status';
import { Prisma } from '@prisma/client';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

type CompleteRentalOrder = NonNullable<RentalOrderDetails>;

describe('RentalService Unit Tests', () => {
  let service: RentalService;
  let repo: jest.Mocked<RentalRepository>;
  let audit: jest.Mocked<AuditPort>;
  let clock: jest.Mocked<Clock>;

  let createOrderMock: jest.MockedFunction<RentalRepository['createOrder']>;
  let rescheduleMock: jest.MockedFunction<RentalRepository['reschedule']>;
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
    locationId: 'loc-1',
    rentalStartAt: new Date('2026-10-05T00:00:00.000Z'),
    rentalEndAt: new Date('2026-10-07T00:00:00.000Z'),
    actualStartedAt: null,
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
    statusHistory: [],
    ...override,
  });

  beforeEach(() => {
    createOrderMock = jest.fn().mockResolvedValue(createSampleOrder());
    rescheduleMock = jest.fn().mockResolvedValue(createSampleOrder());
    auditLogMock = jest.fn().mockResolvedValue(undefined);

    repo = {
      customerExists: jest.fn().mockResolvedValue(true),
      locationExists: jest.fn().mockResolvedValue(true),
      getBookableVariant: jest.fn(),
      createOrder: createOrderMock,
      list: jest.fn(),
      get: jest.fn().mockResolvedValue(createSampleOrder()),
      getStatus: jest.fn().mockResolvedValue(RENTAL_STATUS.RESERVED),
      getSchedule: jest.fn().mockResolvedValue({
        status: RENTAL_STATUS.RESERVED,
        rentalStartAt: new Date('2026-10-05T00:00:00.000Z'),
        rentalEndAt: new Date('2026-10-07T00:00:00.000Z'),
      }),
      transition: jest.fn().mockResolvedValue(createSampleOrder()),
      reschedule: rescheduleMock,
      addCharge: jest.fn().mockResolvedValue(createSampleOrder()),
      claimIdempotency: jest.fn(),
      releaseIdempotency: jest.fn().mockResolvedValue(undefined),
    };

    audit = {
      log: auditLogMock,
    };

    clock = {
      now: jest.fn().mockReturnValue(fixedTime),
    };

    service = new RentalService(repo, audit, clock);
  });

  describe('create', () => {
    it('throws BadRequestException if rentalStartAt is >= rentalEndAt', async () => {
      await expect(
        service.create(currentUser, {
          customerId: 'cust-1',
          rentalStartAt: '2026-10-05T10:00:00.000Z',
          rentalEndAt: '2026-10-05T10:00:00.000Z',
          discountTotal: 0,
          items: [{ variantId: 'var-1', quantity: 1 }],
          charges: [],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException if customer does not exist in shop', async () => {
      repo.customerExists.mockResolvedValueOnce(false);

      await expect(
        service.create(currentUser, {
          customerId: 'non-existent',
          rentalStartAt: '2026-10-05T10:00:00.000Z',
          rentalEndAt: '2026-10-07T10:00:00.000Z',
          discountTotal: 0,
          items: [{ variantId: 'var-1', quantity: 1 }],
          charges: [],
        }),
      ).rejects.toThrow(new NotFoundException('Customer not found or inactive'));
    });

    it('throws NotFoundException if location is specified but does not exist in shop', async () => {
      repo.locationExists.mockResolvedValueOnce(false);

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
      ).rejects.toThrow(new NotFoundException('Shop location not found or inactive'));
    });

    it('throws BadRequestException if duplicate variants are submitted in single order', async () => {
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
        new BadRequestException('Each variant should appear only once in a rental order request'),
      );
    });

    it('throws BadRequestException if charge type is unsupported', async () => {
      await expect(
        service.create(currentUser, {
          customerId: 'cust-1',
          rentalStartAt: '2026-10-05T10:00:00.000Z',
          rentalEndAt: '2026-10-07T10:00:00.000Z',
          discountTotal: 0,
          items: [{ variantId: 'var-1', quantity: 1 }],
          charges: [{ chargeType: 'UNSUPPORTED_TYPE', amount: 50000, quantity: 1 }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException if variant is not rentable or not found', async () => {
      repo.getBookableVariant.mockResolvedValueOnce(null);

      await expect(
        service.create(currentUser, {
          customerId: 'cust-1',
          rentalStartAt: '2026-10-05T10:00:00.000Z',
          rentalEndAt: '2026-10-07T10:00:00.000Z',
          discountTotal: 0,
          items: [{ variantId: 'var-1', quantity: 1 }],
          charges: [],
        }),
      ).rejects.toThrow(new NotFoundException('Variant var-1 is not rentable'));
    });

    it('throws BadRequestException if no rental rate is configured for the duration', async () => {
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
      repo.getBookableVariant.mockResolvedValueOnce(bookableVariant);

      await expect(
        service.create(currentUser, {
          customerId: 'cust-1',
          rentalStartAt: '2026-10-05T10:00:00.000Z',
          rentalEndAt: '2026-10-07T10:00:00.000Z',
          discountTotal: 0,
          items: [{ variantId: 'var-1', quantity: 1 }],
          charges: [],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ConflictException if available inventory is insufficient for requested quantity', async () => {
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
      repo.getBookableVariant.mockResolvedValueOnce(bookableVariant);

      await expect(
        service.create(currentUser, {
          customerId: 'cust-1',
          rentalStartAt: '2026-10-05T10:00:00.000Z',
          rentalEndAt: '2026-10-07T10:00:00.000Z',
          discountTotal: 0,
          items: [{ variantId: 'var-1', quantity: 2 }], // requested 2
          charges: [],
        }),
      ).rejects.toThrow(ConflictException);
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
      repo.getBookableVariant.mockResolvedValueOnce(bookableVariant);

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
      expect(auditLogMock).toHaveBeenCalledWith(
        expect.objectContaining({
          shopId: currentUser.shopId,
          actorUserId: currentUser.userId,
          action: 'CREATE',
          entityType: 'rental_order',
        }),
      );
    });
  });

  describe('transitions', () => {
    it('throws BadRequestException if transition is rejected by policy or concurrent status change', async () => {
      repo.getStatus.mockResolvedValueOnce(RENTAL_STATUS.COMPLETED); // Terminal state
      repo.transition.mockResolvedValueOnce(null);

      await expect(
        service.confirm(currentUser, 'order-1', { reason: 'Ready to confirm' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('confirms order when in RESERVED status', async () => {
      repo.getStatus.mockResolvedValueOnce(RENTAL_STATUS.RESERVED);
      repo.transition.mockResolvedValueOnce(createSampleOrder({ status: RENTAL_STATUS.CONFIRMED }));

      const confirmed = await service.confirm(currentUser, 'order-1', {
        reason: 'Customer called',
      });
      expect(confirmed.status).toBe(RENTAL_STATUS.CONFIRMED);
      expect(auditLogMock).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'STATUS_CHANGE',
          entityId: 'order-1',
        }),
      );
    });

    it('cancels order when in RESERVED status', async () => {
      repo.getStatus.mockResolvedValueOnce(RENTAL_STATUS.RESERVED);
      repo.transition.mockResolvedValueOnce(createSampleOrder({ status: RENTAL_STATUS.CANCELLED }));

      const cancelled = await service.cancel(currentUser, 'order-1', {
        reason: 'Customer changed mind',
      });
      expect(cancelled.status).toBe(RENTAL_STATUS.CANCELLED);
    });
  });

  describe('reschedule', () => {
    it('throws NotFoundException if order does not exist', async () => {
      repo.getSchedule.mockResolvedValueOnce(null);

      await expect(
        service.reschedule(currentUser, 'non-existent', {
          rentalStartAt: '2026-10-10T10:00:00.000Z',
          rentalEndAt: '2026-10-12T10:00:00.000Z',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException if order status cannot be rescheduled (e.g. ACTIVE or COMPLETED)', async () => {
      repo.getSchedule.mockResolvedValueOnce({
        status: RENTAL_STATUS.COMPLETED,
        rentalStartAt: new Date('2026-10-01T12:00:00.000Z'),
        rentalEndAt: new Date('2026-10-01T12:00:00.000Z'),
      });

      await expect(
        service.reschedule(currentUser, 'order-1', {
          rentalStartAt: '2026-10-10T10:00:00.000Z',
          rentalEndAt: '2026-10-12T10:00:00.000Z',
        }),
      ).rejects.toThrow(
        new BadRequestException('Only reserved or confirmed orders can be rescheduled'),
      );
    });

    it('throws BadRequestException if new dates are invalid (start >= end)', async () => {
      repo.getSchedule.mockResolvedValueOnce({
        status: RENTAL_STATUS.RESERVED,
        rentalStartAt: new Date('2026-10-05T00:00:00.000Z'),
        rentalEndAt: new Date('2026-10-07T00:00:00.000Z'),
      });

      await expect(
        service.reschedule(currentUser, 'order-1', {
          rentalStartAt: '2026-10-12T10:00:00.000Z',
          rentalEndAt: '2026-10-10T10:00:00.000Z',
        }),
      ).rejects.toThrow(new BadRequestException('rentalStartAt must be earlier than rentalEndAt'));
    });

    it('orchestrates valid reschedule and logs audit event', async () => {
      repo.getSchedule.mockResolvedValueOnce({
        status: RENTAL_STATUS.RESERVED,
        rentalStartAt: new Date('2026-10-05T00:00:00.000Z'),
        rentalEndAt: new Date('2026-10-07T00:00:00.000Z'),
      });
      repo.reschedule.mockResolvedValueOnce(
        createSampleOrder({
          rentalStartAt: new Date('2026-10-10T00:00:00.000Z'),
          rentalEndAt: new Date('2026-10-12T00:00:00.000Z'),
        }),
      );

      const rescheduled = await service.reschedule(currentUser, 'order-1', {
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
