import { INVENTORY_STATUS, type InventoryStatus } from './catalog-status';
import { CATALOG_ERROR_CODE, CatalogInvariantError } from './catalog.repository';

const INVENTORY_STATUS_LABELS: Readonly<Record<string, string>> = {
  AVAILABLE: 'có sẵn',
  RESERVED: 'đã đặt',
  RENTED: 'đang thuê',
  CLEANING: 'đang vệ sinh',
  REPAIRING: 'đang sửa chữa',
  DAMAGED: 'hư hỏng',
  LOST: 'thất lạc',
  RETIRED: 'ngừng sử dụng',
};

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

export type OperationalInventoryStatus = (typeof OPERATIONAL_INVENTORY_STATUSES)[number];

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
  const fromLabel = INVENTORY_STATUS_LABELS[fromStatus] ?? 'không hợp lệ';
  const toLabel = INVENTORY_STATUS_LABELS[toStatus] ?? 'không hợp lệ';
  // 1. Prohibit manual transitions to or from occupancy states (RESERVED / RENTED)
  if (toStatus === 'RESERVED' || toStatus === 'RENTED') {
    throw new CatalogInvariantError(
      CATALOG_ERROR_CODE.INVENTORY_MANUAL_OCCUPANCY_TRANSITION,
      `Trạng thái ${toLabel} chỉ được quản lý tự động qua quy trình đơn thuê.`,
    );
  }

  if (fromStatus === 'RESERVED' || fromStatus === 'RENTED') {
    throw new CatalogInvariantError(
      CATALOG_ERROR_CODE.INVENTORY_OCCUPIED_TRANSITION,
      'Món đồ hiện đang trong quy trình đơn thuê. Không thể đổi trạng thái thủ công từ kho.',
    );
  }

  // 2. Prohibit manual operational mutation if item has active allocations / active rentals
  const completesService =
    toStatus === INVENTORY_STATUS.AVAILABLE &&
    (fromStatus === INVENTORY_STATUS.CLEANING || fromStatus === INVENTORY_STATUS.REPAIRING);
  if (context.hasActiveRental || (context.hasActiveAllocation && !completesService)) {
    throw new CatalogInvariantError(
      CATALOG_ERROR_CODE.INVENTORY_ACTIVE_ALLOCATION,
      'Món đồ đang có lịch thuê hoạt động hoặc đang được thuê. Không thể đổi trạng thái thủ công từ kho.',
    );
  }

  // 3. No-op transition
  if (fromStatus === toStatus) {
    throw new CatalogInvariantError(
      CATALOG_ERROR_CODE.INVENTORY_STATUS_NO_OP,
      `Món đồ hiện đã ở trạng thái ${fromLabel}.`,
    );
  }

  // 4. Validate allowed operational state machine paths
  const allowed = getAllowedOperationalTransitions(fromStatus, {
    hasActiveAllocation: false,
  });

  if (!allowed.includes(toStatus as InventoryStatus)) {
    throw new CatalogInvariantError(
      CATALOG_ERROR_CODE.INVENTORY_STATUS_TRANSITION_INVALID,
      `Không cho phép chuyển trạng thái từ ${fromLabel} sang ${toLabel}.`,
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
        CATALOG_ERROR_CODE.INVENTORY_STATUS_REASON_REQUIRED,
        `Cần nhập lý do khi chuyển món đồ sang trạng thái ${toLabel}.`,
      );
    }
  }

  // Explicit recovery from LOST to AVAILABLE requires mandatory reason
  if (fromStatus === INVENTORY_STATUS.LOST && toStatus === INVENTORY_STATUS.AVAILABLE) {
    if (!cleanReason) {
      throw new CatalogInvariantError(
        CATALOG_ERROR_CODE.INVENTORY_STATUS_REASON_REQUIRED,
        'Cần nhập lý do/nguồn tìm thấy khi phục hồi món đồ từ trạng thái thất lạc sang có sẵn.',
      );
    }
  }

  // Reactivation from RETIRED to AVAILABLE requires mandatory reason
  if (fromStatus === INVENTORY_STATUS.RETIRED && toStatus === INVENTORY_STATUS.AVAILABLE) {
    if (!cleanReason) {
      throw new CatalogInvariantError(
        CATALOG_ERROR_CODE.INVENTORY_STATUS_REASON_REQUIRED,
        'Cần nhập lý do khi đưa món đồ đã ngừng sử dụng trở lại kho.',
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
  if (context.hasActiveRental || currentStatus === 'RESERVED' || currentStatus === 'RENTED') {
    return [];
  }

  // A scheduled reservation must not prevent finishing cleaning after a return.
  if (context.hasActiveAllocation) {
    return currentStatus === INVENTORY_STATUS.CLEANING ||
      currentStatus === INVENTORY_STATUS.REPAIRING
      ? [INVENTORY_STATUS.AVAILABLE]
      : [];
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
      return [INVENTORY_STATUS.REPAIRING, INVENTORY_STATUS.RETIRED];

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
