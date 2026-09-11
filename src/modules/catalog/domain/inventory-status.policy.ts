import { INVENTORY_STATUS, type InventoryStatus } from './catalog-status';
import { CatalogInvariantError } from './catalog.repository';

/**
 * Operational physical conditions that an admin or staff can operate on.
 * Note: RESERVED and RENTED are occupancy states managed exclusively by the Rental Order lifecycle.
 */
export const OPERATIONAL_INVENTORY_STATUSES = [
  INVENTORY_STATUS.AVAILABLE,
  INVENTORY_STATUS.CLEANING,
  INVENTORY_STATUS.REPAIRING,
  INVENTORY_STATUS.DAMAGED,
  INVENTORY_STATUS.LOST,
  INVENTORY_STATUS.RETIRED,
] as const;

export type OperationalInventoryStatus =
  (typeof OPERATIONAL_INVENTORY_STATUSES)[number];

export interface InventoryTransitionContext {
  hasActiveAllocation?: boolean;
  hasActiveRental?: boolean;
  reason?: string | null;
}

/**
 * Validates whether an operational transition is allowed from the current status to target status.
 * Throws CatalogInvariantError with descriptive messages if prohibited.
 */
export function validateInventoryStatusTransition(
  fromStatus: string,
  toStatus: string,
  context: InventoryTransitionContext = {},
): void {
  // 1. Prohibit manual transitions to or from occupancy states (RESERVED / RENTED)
  if (toStatus === INVENTORY_STATUS.RESERVED || toStatus === INVENTORY_STATUS.RENTED) {
    throw new CatalogInvariantError(
      `Trạng thái ${toStatus === INVENTORY_STATUS.RESERVED ? 'ĐÃ ĐẶT (RESERVED)' : 'ĐANG THUÊ (RENTED)'} chỉ được quản lý tự động qua quy trình Đơn thuê (Rental Order).`,
    );
  }

  if (fromStatus === INVENTORY_STATUS.RESERVED || fromStatus === INVENTORY_STATUS.RENTED) {
    throw new CatalogInvariantError(
      'Món đồ hiện đang trong quy trình đơn thuê. Không thể đổi trạng thái thủ công từ kho.',
    );
  }

  // 2. Prohibit manual operational mutation if item has active allocations / active rentals
  if (context.hasActiveAllocation || context.hasActiveRental) {
    throw new CatalogInvariantError(
      'Món đồ đang có lịch thuê hoạt động hoặc đang được thuê. Không thể đổi trạng thái thủ công từ kho.',
    );
  }

  // 3. No-op transition
  if (fromStatus === toStatus) {
    throw new CatalogInvariantError(
      `Món đồ hiện đã ở trạng thái ${fromStatus}.`,
    );
  }

  // 4. Validate allowed operational state machine paths
  const allowed = getAllowedOperationalTransitions(fromStatus, {
    hasActiveAllocation: false,
  });

  if (!allowed.includes(toStatus as InventoryStatus)) {
    throw new CatalogInvariantError(
      `Không cho phép chuyển trạng thái từ ${fromStatus} sang ${toStatus}.`,
    );
  }

  // 5. Reason validation
  const cleanReason = context.reason?.trim() ?? '';

  // Transitions to DAMAGED, LOST, REPAIRING, RETIRED require mandatory reason
  if (
    toStatus === INVENTORY_STATUS.DAMAGED ||
    toStatus === INVENTORY_STATUS.LOST ||
    toStatus === INVENTORY_STATUS.REPAIRING ||
    toStatus === INVENTORY_STATUS.RETIRED
  ) {
    if (!cleanReason) {
      throw new CatalogInvariantError(
        `Cần nhập lý do khi chuyển món đồ sang trạng thái ${toStatus}.`,
      );
    }
  }

  // Explicit recovery from LOST to AVAILABLE requires mandatory reason
  if (fromStatus === INVENTORY_STATUS.LOST && toStatus === INVENTORY_STATUS.AVAILABLE) {
    if (!cleanReason) {
      throw new CatalogInvariantError(
        'Cần nhập lý do/nguồn tìm thấy khi phục hồi món đồ từ trạng thái MẤT (LOST) sang CÓ SẴN (AVAILABLE).',
      );
    }
  }

  // Reactivation from RETIRED to AVAILABLE requires mandatory reason
  if (fromStatus === INVENTORY_STATUS.RETIRED && toStatus === INVENTORY_STATUS.AVAILABLE) {
    if (!cleanReason) {
      throw new CatalogInvariantError(
        'Cần nhập lý do khi đưa món đồ đã ngừng sử dụng (RETIRED) trở lại kho (AVAILABLE).',
      );
    }
  }
}

/**
 * Returns allowed manual target statuses for an item in its current state.
 */
export function getAllowedOperationalTransitions(
  currentStatus: string,
  context: { hasActiveAllocation?: boolean; hasActiveRental?: boolean } = {},
): InventoryStatus[] {
  // If item is actively rented or allocated, no manual transitions are allowed
  if (
    context.hasActiveAllocation ||
    context.hasActiveRental ||
    currentStatus === INVENTORY_STATUS.RESERVED ||
    currentStatus === INVENTORY_STATUS.RENTED
  ) {
    return [];
  }

  switch (currentStatus) {
    case INVENTORY_STATUS.AVAILABLE:
      return [
        INVENTORY_STATUS.CLEANING,
        INVENTORY_STATUS.REPAIRING,
        INVENTORY_STATUS.DAMAGED,
        INVENTORY_STATUS.LOST,
        INVENTORY_STATUS.RETIRED,
      ];

    case INVENTORY_STATUS.CLEANING:
      return [
        INVENTORY_STATUS.AVAILABLE,
        INVENTORY_STATUS.REPAIRING,
        INVENTORY_STATUS.DAMAGED,
        INVENTORY_STATUS.RETIRED,
      ];

    case INVENTORY_STATUS.REPAIRING:
      return [
        INVENTORY_STATUS.AVAILABLE,
        INVENTORY_STATUS.CLEANING,
        INVENTORY_STATUS.DAMAGED,
        INVENTORY_STATUS.RETIRED,
      ];

    case INVENTORY_STATUS.DAMAGED:
      return [
        INVENTORY_STATUS.REPAIRING,
        INVENTORY_STATUS.RETIRED,
      ];

    case INVENTORY_STATUS.LOST:
      // Explicit recovery with mandatory reason
      return [INVENTORY_STATUS.AVAILABLE];

    case INVENTORY_STATUS.RETIRED:
      // Reactivation with mandatory reason
      return [INVENTORY_STATUS.AVAILABLE];

    default:
      return [];
  }
}
