import { Inject, Injectable } from '@nestjs/common';
import type { CurrentUser } from '@common/types/current-user';
import { AUDIT_PORT, type AuditPort } from '@modules/audit/public/audit-contracts';
import { RENTAL_STATUS, type RentalStatus } from '../domain/rental-status';
import {
  canRescheduleRental,
  calculateRentalDurationDays,
  RENTAL_TRANSITION_FROM,
} from '../domain/rental-policy';
import {
  RENTAL_LIFECYCLE_REPOSITORY,
  type RentalLifecycleRepository,
} from '../domain/ports/rental-lifecycle.port';
import {
  RENTAL_ORDER_READER,
  type RentalOrderReader,
} from '../domain/ports/rental-order-reader.port';
import { RentalOverlapError } from '../domain/rental-errors';
import type { RescheduleRentalInput, TransitionRentalInput } from './rental.contracts';
import {
  InvalidRentalPeriodError,
  RentalAvailabilityConflictError,
  RentalNotFoundError,
  RentalOperationNotAllowedError,
  RentalStateChangedConflictError,
} from './rental.errors';

const RENTAL_STATUS_LABELS: Readonly<Record<string, string>> = {
  DRAFT: 'nháp',
  RESERVED: 'đã đặt trước',
  CONFIRMED: 'đã xác nhận',
  ACTIVE: 'đang thuê',
  RETURNED: 'đã nhận trả',
  COMPLETED: 'đã hoàn thành',
  CANCELLED: 'đã hủy',
};
@Injectable()
export class RentalLifecycleService {
  constructor(
    @Inject(RENTAL_ORDER_READER) private readonly orderReader: RentalOrderReader,
    @Inject(RENTAL_LIFECYCLE_REPOSITORY) private readonly lifecycle: RentalLifecycleRepository,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
  ) {}

  start(user: CurrentUser, id: string, input: TransitionRentalInput) {
    return this.transition(
      user,
      id,
      RENTAL_TRANSITION_FROM.ACTIVE,
      RENTAL_STATUS.ACTIVE,
      input.reason,
    );
  }

  cancel(user: CurrentUser, id: string, input: TransitionRentalInput) {
    return this.transition(
      user,
      id,
      RENTAL_TRANSITION_FROM.CANCELLED,
      RENTAL_STATUS.CANCELLED,
      input.reason,
    );
  }

  async reschedule(user: CurrentUser, id: string, input: RescheduleRentalInput) {
    const current = await this.orderReader.getSchedule(user.shopId, id);
    if (!current) throw new RentalNotFoundError('Không tìm thấy đơn thuê.');
    if (!canRescheduleRental(current.status)) {
      throw new RentalOperationNotAllowedError(
        'Chỉ có thể đổi lịch đơn đã đặt trước hoặc đã xác nhận.',
      );
    }
    const start = new Date(input.rentalStartAt);
    const end = new Date(input.rentalEndAt);
    if (start >= end)
      throw new InvalidRentalPeriodError(
        'Thời gian bắt đầu thuê phải trước thời gian kết thúc thuê.',
      );
    if (
      calculateRentalDurationDays(current.rentalStartAt, current.rentalEndAt) !==
      calculateRentalDurationDays(start, end)
    ) {
      throw new InvalidRentalPeriodError(
        'Thay đổi số ngày thuê cần tính lại giá. Vui lòng giữ nguyên số ngày thuê hoặc tạo lại đơn với giá mới.',
      );
    }
    try {
      const order = await this.lifecycle.reschedule({
        shopId: user.shopId,
        orderId: id,
        from: start,
        until: end,
        changedBy: user.memberId,
      });
      if (!order)
        throw new RentalOperationNotAllowedError(
          'Không thể đổi lịch đơn thuê ở trạng thái hiện tại.',
        );
      await this.audit.log({
        shopId: user.shopId,
        actorUserId: user.userId,
        actorMemberId: user.memberId,
        action: 'RESCHEDULE',
        entityType: 'rental_order',
        entityId: id,
        newValues: { ...input },
      });
      return order;
    } catch (error) {
      if (error instanceof RentalOverlapError)
        throw new RentalAvailabilityConflictError(error.message);
      throw error;
    }
  }

  private async transition(
    user: CurrentUser,
    id: string,
    allowedFrom: RentalStatus[],
    toStatus: RentalStatus,
    reason?: string,
  ) {
    const currentStatus = await this.orderReader.getStatus(user.shopId, id);
    if (!currentStatus) throw new RentalNotFoundError('Không tìm thấy đơn thuê.');
    if (!allowedFrom.some((status) => status === currentStatus)) {
      throw new RentalOperationNotAllowedError(
        `Không thể chuyển đơn thuê từ trạng thái ${RENTAL_STATUS_LABELS[currentStatus] ?? 'không hợp lệ'} sang ${RENTAL_STATUS_LABELS[toStatus] ?? 'không hợp lệ'}.`,
        'RENTAL_TRANSITION_NOT_ALLOWED',
      );
    }
    const order = await this.lifecycle.transition({
      shopId: user.shopId,
      orderId: id,
      fromStatuses: allowedFrom,
      toStatus,
      changedBy: user.memberId,
      reason,
    });
    if (!order)
      throw new RentalStateChangedConflictError(
        'Trạng thái đơn thuê vừa được thay đổi. Vui lòng tải lại và thử lại.',
      );
    await this.audit.log({
      shopId: user.shopId,
      actorUserId: user.userId,
      actorMemberId: user.memberId,
      action: 'STATUS_CHANGE',
      entityType: 'rental_order',
      entityId: id,
      newValues: { fromStatus: currentStatus, toStatus, reason },
    });
    return order;
  }
}
