import { RENTAL_STATUS } from '../../src/modules/rentals/domain/rental-status';
import { canTransitionRental } from '../../src/modules/rentals/domain/rental-policy';
import {
  calculateLateCharges,
  calculateRentalSettlement,
} from '../../src/modules/rentals/domain/rental-settlement';
import {
  ITEM_INSPECTION_CONDITION,
  INSPECTION_TO_INVENTORY_STATUS,
  assertReturnInspection,
} from '../../src/modules/rentals/domain/rental-return';
import { INVENTORY_STATUS } from '../../src/modules/catalog/domain/catalog-status';
import { DEFAULT_RENTAL_POLICY } from '../../src/modules/settings/domain/rental-policy';
import { RentalSettlementService } from '../../src/modules/rentals/application/rental-settlement.service';
import { RentalService } from '../../src/modules/rentals/application/rental.service';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { CurrentUser } from '@common/types/current-user';
import type { RentalRepository } from '../../src/modules/rentals/domain/rental.repository';
import type { AuditPort } from '../../src/modules/audit/domain/audit.port';
import type { Clock } from '../../src/common/clock/clock';
import type { ObjectStoragePort } from '../../src/common/storage/object-storage.port';

describe('P1 — Complete Return / Charges / Settlement Unit Tests', () => {
  const policy = DEFAULT_RENTAL_POLICY;

  describe('1. State Machine: Generic Transition Invariant', () => {
    it('never allows direct ACTIVE -> COMPLETED transition via generic transition', () => {
      expect(canTransitionRental('ACTIVE', 'COMPLETED')).toBe(false);
    });

    it('never allows direct RETURNED -> COMPLETED transition via generic transition', () => {
      expect(canTransitionRental('RETURNED', 'COMPLETED')).toBe(false);
    });

    it('allows CONFIRMED -> ACTIVE but not RESERVED -> ACTIVE', () => {
      expect(canTransitionRental('CONFIRMED', 'ACTIVE')).toBe(true);
      expect(canTransitionRental('RESERVED', 'ACTIVE')).toBe(false);
    });
  });

  describe('2. Late Fee & Extra Rental Calculations', () => {
    const dueAt = new Date('2026-10-10T18:00:00.000Z');
    const rentalSubtotal = '300000.00';

    it('calculates 0 late fee and 0 additional rental when returned on time', () => {
      const returnedAt = new Date('2026-10-10T17:30:00.000Z');
      const result = calculateLateCharges({
        dueAt,
        returnedAt,
        itemCount: 2,
        rentalSubtotal,
        policy,
      });
      expect(result).toEqual({
        lateDays: 0,
        lateFee: '0.00',
        additionalRental: '0.00',
      });
    });

    it('calculates 10.000/set/day: 1 day late for 2 items = 20.000đ', () => {
      const returnedAt = new Date('2026-10-11T18:00:00.000Z');
      const result = calculateLateCharges({
        dueAt,
        returnedAt,
        itemCount: 2,
        rentalSubtotal,
        policy,
      });
      expect(result).toEqual({
        lateDays: 1,
        lateFee: '20000.00',
        additionalRental: '0.00',
      });
    });

    it('calculates 2 days late for 2 items = 40.000đ, no extra rental yet', () => {
      const returnedAt = new Date('2026-10-12T18:00:00.000Z');
      const result = calculateLateCharges({
        dueAt,
        returnedAt,
        itemCount: 2,
        rentalSubtotal,
        policy,
      });
      expect(result).toEqual({
        lateDays: 2,
        lateFee: '40000.00',
        additionalRental: '0.00',
      });
    });

    it('adds 1 extra rental cycle starting from late day 3 (rule: 3 days late)', () => {
      const returnedAt = new Date('2026-10-13T18:00:00.000Z');
      const result = calculateLateCharges({
        dueAt,
        returnedAt,
        itemCount: 2,
        rentalSubtotal,
        policy,
      });
      // 3 days * 2 items * 10.000 = 60.000 late fee + 300.000 additional rental
      expect(result).toEqual({
        lateDays: 3,
        lateFee: '60000.00',
        additionalRental: '300000.00',
      });
    });

    it('maintains extra rental cycle on day 4 and beyond', () => {
      const returnedAt = new Date('2026-10-14T18:00:00.000Z');
      const result = calculateLateCharges({
        dueAt,
        returnedAt,
        itemCount: 2,
        rentalSubtotal,
        policy,
      });
      expect(result).toEqual({
        lateDays: 4,
        lateFee: '80000.00',
        additionalRental: '300000.00',
      });
    });
  });

  describe('3. Per-Item Inspection & Operational Status Mapping', () => {
    it('maps NORMAL condition to AVAILABLE operational status', () => {
      expect(INSPECTION_TO_INVENTORY_STATUS[ITEM_INSPECTION_CONDITION.NORMAL]).toBe(
        INVENTORY_STATUS.AVAILABLE,
      );
    });

    it('maps CLEANING_REQUIRED condition to CLEANING operational status', () => {
      expect(INSPECTION_TO_INVENTORY_STATUS[ITEM_INSPECTION_CONDITION.CLEANING_REQUIRED]).toBe(
        INVENTORY_STATUS.CLEANING,
      );
    });

    it('maps REPAIR_REQUIRED condition to REPAIRING operational status', () => {
      expect(INSPECTION_TO_INVENTORY_STATUS[ITEM_INSPECTION_CONDITION.REPAIR_REQUIRED]).toBe(
        INVENTORY_STATUS.REPAIRING,
      );
    });

    it('maps DAMAGED condition to DAMAGED operational status', () => {
      expect(INSPECTION_TO_INVENTORY_STATUS[ITEM_INSPECTION_CONDITION.DAMAGED]).toBe(
        INVENTORY_STATUS.DAMAGED,
      );
    });

    it('maps LOST condition to LOST operational status', () => {
      expect(INSPECTION_TO_INVENTORY_STATUS[ITEM_INSPECTION_CONDITION.LOST]).toBe(
        INVENTORY_STATUS.LOST,
      );
    });

    it('validates that all allocated inventory items must be inspected without duplicates', () => {
      const allocatedInventoryIds = ['item-1', 'item-2'];

      // Success case
      expect(() =>
        assertReturnInspection({
          allocatedInventoryIds,
          inspectionItems: [
            { inventoryItemId: 'item-1', condition: 'NORMAL' },
            { inventoryItemId: 'item-2', condition: 'CLEANING_REQUIRED', note: 'Dirty collar' },
          ],
        }),
      ).not.toThrow();

      // Missing item
      expect(() =>
        assertReturnInspection({
          allocatedInventoryIds,
          inspectionItems: [{ inventoryItemId: 'item-1', condition: 'NORMAL' }],
        }),
      ).toThrow('Phải kiểm tra đầy đủ');

      // Duplicate inspection
      expect(() =>
        assertReturnInspection({
          allocatedInventoryIds,
          inspectionItems: [
            { inventoryItemId: 'item-1', condition: 'NORMAL' },
            { inventoryItemId: 'item-1', condition: 'CLEANING_REQUIRED' },
          ],
        }),
      ).toThrow('trùng lặp');

      // Unallocated item
      expect(() =>
        assertReturnInspection({
          allocatedInventoryIds,
          inspectionItems: [
            { inventoryItemId: 'item-1', condition: 'NORMAL' },
            { inventoryItemId: 'item-999', condition: 'NORMAL' },
          ],
        }),
      ).toThrow('không thuộc đơn thuê');
    });
  });

  describe('4. Settlement Breakdown & Scenarios', () => {
    it('Scenario A: Deposit > Charges => REFUND_DUE (cọc 300k, phát sinh 70k -> hoàn 230k)', () => {
      const settlement = calculateRentalSettlement({
        status: 'RETURNED',
        grandTotal: '270000.00', // rental 200k + charges 70k
        paidRental: '200000.00', // rent already paid
        depositIn: '300000.00', // 300k deposit received
        depositOut: '0.00',
      });
      expect(settlement).toEqual({
        depositReceived: '300000.00',
        depositAvailable: '300000.00',
        refundAmount: '230000.00',
        amountStillDue: '0.00',
        settlementStatus: 'REFUND_DUE',
      });
    });

    it('Scenario B: Deposit == Charges => BALANCED', () => {
      const settlement = calculateRentalSettlement({
        status: 'RETURNED',
        grandTotal: '270000.00',
        paidRental: '200000.00', // 70k unpaid charges
        depositIn: '70000.00', // exactly 70k deposit
        depositOut: '0.00',
      });
      expect(settlement).toEqual({
        depositReceived: '70000.00',
        depositAvailable: '70000.00',
        refundAmount: '0.00',
        amountStillDue: '0.00',
        settlementStatus: 'BALANCED',
      });
    });

    it('Scenario C: Deposit < Charges => AMOUNT_DUE (cọc 50k, phát sinh 200k -> thu thêm 150k)', () => {
      const settlement = calculateRentalSettlement({
        status: 'RETURNED',
        grandTotal: '400000.00',
        paidRental: '200000.00', // 200k unpaid charges
        depositIn: '50000.00', // 50k deposit
        depositOut: '0.00',
      });
      expect(settlement).toEqual({
        depositReceived: '50000.00',
        depositAvailable: '50000.00',
        refundAmount: '0.00',
        amountStillDue: '150000.00',
        settlementStatus: 'AMOUNT_DUE',
      });
    });

    it('Scenario D: No Cash Deposit (Document Collateral CCCD/GPLX) => Full charges are AMOUNT_DUE', () => {
      const settlement = calculateRentalSettlement({
        status: 'RETURNED',
        grandTotal: '280000.00',
        paidRental: '200000.00', // 80k unpaid charges
        depositIn: '0.00', // 0 cash deposit
        depositOut: '0.00',
      });
      expect(settlement).toEqual({
        depositReceived: '0.00',
        depositAvailable: '0.00',
        refundAmount: '0.00',
        amountStillDue: '80000.00',
        settlementStatus: 'AMOUNT_DUE',
      });
    });

    it('marks settlementStatus as SETTLED once settled or COMPLETED', () => {
      expect(
        calculateRentalSettlement({
          status: 'COMPLETED',
          grandTotal: '270000.00',
          paidRental: '200000.00',
          depositIn: '300000.00',
          depositOut: '230000.00',
          hasSettlement: true,
        }).settlementStatus,
      ).toBe('SETTLED');
    });
  });

  describe('5. Application Service Authorization & Business Guards', () => {
    const userWithReturn: CurrentUser = {
      userId: 'user-1',
      memberId: 'member-1',
      shopId: 'shop-1',
      email: 'staff@kitty.vn',
      fullName: 'Staff',
      permissions: ['rentals.return'],
    };

    const userWithSettle: CurrentUser = {
      userId: 'user-2',
      memberId: 'member-2',
      shopId: 'shop-1',
      email: 'manager@kitty.vn',
      fullName: 'Manager',
      permissions: ['rentals.settle'],
    };

    const userWithoutPerms: CurrentUser = {
      userId: 'user-3',
      memberId: 'member-3',
      shopId: 'shop-1',
      email: 'viewer@kitty.vn',
      fullName: 'Viewer',
      permissions: ['rentals.view'],
    };

    it('rejects receiveReturn if user lacks rentals.return permission', async () => {
      const mockRepo = { get: jest.fn() } as unknown as RentalRepository;
      const mockAudit = { log: jest.fn() } as unknown as AuditPort;
      const mockClock = { now: () => new Date() } as unknown as Clock;
      const service = new RentalService(mockRepo, mockAudit, mockClock);

      await expect(
        service.receiveReturn(userWithoutPerms, 'order-1', {
          inspections: [],
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects receiveReturn if order is not ACTIVE', async () => {
      const mockRepo = {
        get: jest.fn().mockResolvedValue({
          id: 'order-1',
          status: RENTAL_STATUS.RESERVED,
        }),
      } as unknown as RentalRepository;
      const mockAudit = { log: jest.fn() } as unknown as AuditPort;
      const mockClock = { now: () => new Date() } as unknown as Clock;
      const service = new RentalService(mockRepo, mockAudit, mockClock);

      await expect(
        service.receiveReturn(userWithReturn, 'order-1', {
          inspections: [{ inventoryItemId: 'inv-1', condition: 'NORMAL' }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects addCharge if order is already settled', async () => {
      const mockRepo = {
        get: jest.fn().mockResolvedValue({
          id: 'order-1',
          status: RENTAL_STATUS.RETURNED,
          settlement: { id: 'settle-1' },
        }),
      } as unknown as RentalRepository;
      const mockAudit = { log: jest.fn() } as unknown as AuditPort;
      const mockClock = { now: () => new Date() } as unknown as Clock;
      const service = new RentalService(mockRepo, mockAudit, mockClock);

      await expect(
        service.addCharge(userWithReturn, 'order-1', {
          chargeType: 'CLEANING',
          amount: 50000,
          quantity: 1,
        }),
      ).rejects.toThrow('Không thể thêm phụ phí sau khi đã kết toán đơn thuê.');
    });

    it('rejects settle if user lacks rentals.settle permission', async () => {
      const mockRepo = { get: jest.fn() } as unknown as RentalRepository;
      const mockStorage = { putObject: jest.fn() } as unknown as ObjectStoragePort;
      const settlementService = new RentalSettlementService(mockRepo, mockStorage);

      await expect(
        settlementService.settle(userWithoutPerms, 'order-1', {}),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects settle if order is not in RETURNED status', async () => {
      const mockRepo = {
        get: jest.fn().mockResolvedValue({
          id: 'order-1',
          status: RENTAL_STATUS.ACTIVE,
        }),
      } as unknown as RentalRepository;
      const mockStorage = { putObject: jest.fn() } as unknown as ObjectStoragePort;
      const settlementService = new RentalSettlementService(mockRepo, mockStorage);

      await expect(settlementService.settle(userWithSettle, 'order-1', {})).rejects.toThrow(
        'Chỉ có thể kết toán đơn ở trạng thái đã nhận trả.',
      );
    });

    it('rejects settle if order is already settled', async () => {
      const mockRepo = {
        get: jest.fn().mockResolvedValue({
          id: 'order-1',
          status: RENTAL_STATUS.RETURNED,
          settlement: { id: 'settlement-1' },
        }),
      } as unknown as RentalRepository;
      const mockStorage = { putObject: jest.fn() } as unknown as ObjectStoragePort;
      const settlementService = new RentalSettlementService(mockRepo, mockStorage);

      await expect(settlementService.settle(userWithSettle, 'order-1', {})).rejects.toThrow(
        'Đơn thuê này đã được kết toán.',
      );
    });
  });
});
