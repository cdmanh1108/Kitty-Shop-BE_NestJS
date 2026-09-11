import { INVENTORY_STATUS } from '@modules/catalog/domain/catalog-status';
import {
  validateInventoryStatusTransition,
  getAllowedOperationalTransitions,
} from '@modules/catalog/domain/inventory-status.policy';
import { CatalogInvariantError } from '@modules/catalog/domain/catalog.repository';

describe('Inventory Status Transition Policy', () => {
  describe('validateInventoryStatusTransition', () => {
    it('blocks manual transitions to RESERVED or RENTED states', () => {
      expect(() =>
        validateInventoryStatusTransition(INVENTORY_STATUS.AVAILABLE, INVENTORY_STATUS.RESERVED),
      ).toThrow(CatalogInvariantError);

      expect(() =>
        validateInventoryStatusTransition(INVENTORY_STATUS.AVAILABLE, INVENTORY_STATUS.RENTED),
      ).toThrow(CatalogInvariantError);
    });

    it('blocks manual transitions from RESERVED or RENTED states', () => {
      expect(() =>
        validateInventoryStatusTransition(INVENTORY_STATUS.RENTED, INVENTORY_STATUS.AVAILABLE),
      ).toThrow(CatalogInvariantError);

      expect(() =>
        validateInventoryStatusTransition(INVENTORY_STATUS.RESERVED, INVENTORY_STATUS.CLEANING),
      ).toThrow(CatalogInvariantError);
    });

    it('blocks manual operational mutations when item has active allocation or rental', () => {
      expect(() =>
        validateInventoryStatusTransition(
          INVENTORY_STATUS.AVAILABLE,
          INVENTORY_STATUS.CLEANING,
          { hasActiveAllocation: true },
        ),
      ).toThrow('Món đồ đang có lịch thuê hoạt động');

      expect(() =>
        validateInventoryStatusTransition(
          INVENTORY_STATUS.AVAILABLE,
          INVENTORY_STATUS.DAMAGED,
          { hasActiveRental: true, reason: 'Rách váy' },
        ),
      ).toThrow('Món đồ đang có lịch thuê hoạt động');
    });

    it('allows valid transitions from AVAILABLE with proper reasons', () => {
      // CLEANING can be done without mandatory reason
      expect(() =>
        validateInventoryStatusTransition(INVENTORY_STATUS.AVAILABLE, INVENTORY_STATUS.CLEANING),
      ).not.toThrow();

      // REPAIRING requires reason
      expect(() =>
        validateInventoryStatusTransition(INVENTORY_STATUS.AVAILABLE, INVENTORY_STATUS.REPAIRING),
      ).toThrow('Cần nhập lý do');

      expect(() =>
        validateInventoryStatusTransition(
          INVENTORY_STATUS.AVAILABLE,
          INVENTORY_STATUS.REPAIRING,
          { reason: 'Bung chỉ viền eo' },
        ),
      ).not.toThrow();

      // DAMAGED requires reason
      expect(() =>
        validateInventoryStatusTransition(
          INVENTORY_STATUS.AVAILABLE,
          INVENTORY_STATUS.DAMAGED,
          { reason: 'Ố màu không tẩy được' },
        ),
      ).not.toThrow();

      // LOST requires reason
      expect(() =>
        validateInventoryStatusTransition(
          INVENTORY_STATUS.AVAILABLE,
          INVENTORY_STATUS.LOST,
          { reason: 'Thất lạc sau sự kiện' },
        ),
      ).not.toThrow();
    });

    it('allows transitions from CLEANING and REPAIRING back to AVAILABLE', () => {
      expect(() =>
        validateInventoryStatusTransition(INVENTORY_STATUS.CLEANING, INVENTORY_STATUS.AVAILABLE),
      ).not.toThrow();

      expect(() =>
        validateInventoryStatusTransition(INVENTORY_STATUS.REPAIRING, INVENTORY_STATUS.AVAILABLE),
      ).not.toThrow();
    });

    it('prohibits direct DAMAGED to AVAILABLE transition without repair', () => {
      expect(() =>
        validateInventoryStatusTransition(INVENTORY_STATUS.DAMAGED, INVENTORY_STATUS.AVAILABLE),
      ).toThrow('Không cho phép chuyển trạng thái');

      // DAMAGED can transition to REPAIRING or RETIRED
      expect(() =>
        validateInventoryStatusTransition(
          INVENTORY_STATUS.DAMAGED,
          INVENTORY_STATUS.REPAIRING,
          { reason: 'Mang đi sửa' },
        ),
      ).not.toThrow();
    });

    it('allows LOST to AVAILABLE only with an explicit recovery reason', () => {
      expect(() =>
        validateInventoryStatusTransition(INVENTORY_STATUS.LOST, INVENTORY_STATUS.AVAILABLE),
      ).toThrow('Cần nhập lý do/nguồn tìm thấy');

      expect(() =>
        validateInventoryStatusTransition(
          INVENTORY_STATUS.LOST,
          INVENTORY_STATUS.AVAILABLE,
          { reason: 'Khách tìm thấy và hoàn trả' },
        ),
      ).not.toThrow();

      // LOST cannot jump to CLEANING or REPAIRING
      expect(() =>
        validateInventoryStatusTransition(INVENTORY_STATUS.LOST, INVENTORY_STATUS.CLEANING),
      ).toThrow('Không cho phép chuyển trạng thái');
    });

    it('allows RETIRED to AVAILABLE only with an explicit reactivation reason', () => {
      expect(() =>
        validateInventoryStatusTransition(INVENTORY_STATUS.RETIRED, INVENTORY_STATUS.AVAILABLE),
      ).toThrow('Cần nhập lý do');

      expect(() =>
        validateInventoryStatusTransition(
          INVENTORY_STATUS.RETIRED,
          INVENTORY_STATUS.AVAILABLE,
          { reason: 'Tái kích hoạt sau kiểm kê' },
        ),
      ).not.toThrow();
    });
  });

  describe('getAllowedOperationalTransitions', () => {
    it('returns allowed transitions for AVAILABLE', () => {
      const allowed = getAllowedOperationalTransitions(INVENTORY_STATUS.AVAILABLE);
      expect(allowed).toEqual([
        INVENTORY_STATUS.CLEANING,
        INVENTORY_STATUS.REPAIRING,
        INVENTORY_STATUS.DAMAGED,
        INVENTORY_STATUS.LOST,
        INVENTORY_STATUS.RETIRED,
      ]);
    });

    it('returns empty array when item has active allocation', () => {
      const allowed = getAllowedOperationalTransitions(INVENTORY_STATUS.AVAILABLE, {
        hasActiveAllocation: true,
      });
      expect(allowed).toEqual([]);
    });

    it('returns empty array for RENTED or RESERVED items', () => {
      expect(getAllowedOperationalTransitions(INVENTORY_STATUS.RENTED)).toEqual([]);
      expect(getAllowedOperationalTransitions(INVENTORY_STATUS.RESERVED)).toEqual([]);
    });
  });
});
