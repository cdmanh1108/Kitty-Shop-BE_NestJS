import { Inject, Injectable } from '@nestjs/common';
import { PERMISSIONS } from '@common/constants/permissions';
import type { CurrentUser } from '@common/types/current-user';
import { AUDIT_PORT, type AuditPort } from '@modules/audit/domain/audit.port';
import { RENTAL_STATUS } from '../domain/rental-status';
import {
  RENTAL_LIFECYCLE_REPOSITORY,
  RENTAL_ORDER_READER,
  type RentalLifecycleRepository,
  type RentalOrderReader,
} from '../domain/rental.repository';
import type { ReturnRentalOrderInput } from './rental.contracts';
import {
  RentalAccessDeniedError,
  RentalNotFoundError,
  RentalOperationNotAllowedError,
} from './rental.errors';

@Injectable()
export class RentalReturnService {
  constructor(
    @Inject(RENTAL_ORDER_READER) private readonly orderReader: RentalOrderReader,
    @Inject(RENTAL_LIFECYCLE_REPOSITORY) private readonly lifecycle: RentalLifecycleRepository,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
  ) {}

  async getReturnPreview(user: CurrentUser, id: string, returnedAt?: Date) {
    this.authorizeReturn(user);
    const order = await this.orderReader.get(user.shopId, id);
    if (!order) throw new RentalNotFoundError('Không tìm thấy đơn thuê.');
    const preview = await this.orderReader.getReturnPreview(user.shopId, id, returnedAt);
    const items = order.items.flatMap((item) =>
      item.allocations.map((alloc) => ({
        inventoryItemId: alloc.inventoryItemId,
        sku: alloc.inventoryItem.sku,
        productName: item.productNameSnapshot,
        variantTitle: item.variantNameSnapshot,
      })),
    );
    return {
      rentalEndAt: preview.dueAt.toISOString(),
      actualReturnedAt: preview.actualReturnedAt.toISOString(),
      lateDays: preview.lateDays,
      dailyLateFeePerSet: preview.dailyLateFeePerSet,
      lateFee: preview.lateFee,
      additionalRentalFee: preview.additionalRental,
      items,
    };
  }

  async receiveReturn(user: CurrentUser, id: string, input: ReturnRentalOrderInput) {
    this.authorizeReturn(user);
    const order = await this.orderReader.get(user.shopId, id);
    if (!order) throw new RentalNotFoundError('Không tìm thấy đơn thuê.');
    if (order.status !== RENTAL_STATUS.ACTIVE) {
      throw new RentalOperationNotAllowedError(
        'Chỉ có thể nhận trả cho đơn thuê đang hoạt động (ACTIVE).',
      );
    }
    const result = await this.lifecycle.receiveReturn({
      shopId: user.shopId,
      orderId: id,
      actualReturnedAt: input.actualReturnedAt,
      actorMemberId: user.memberId,
      actorUserId: user.userId,
      actorName: user.fullName,
      items: input.inspections.map((item) => ({
        inventoryItemId: item.inventoryItemId,
        condition: item.condition,
        note: item.note,
      })),
      manualCharges: input.manualCharges,
      note: input.note,
    });
    await this.audit.log({
      shopId: user.shopId,
      actorUserId: user.userId,
      actorMemberId: user.memberId,
      action: 'RECEIVE_RETURN',
      entityType: 'rental_order',
      entityId: id,
      newValues: {
        actualReturnedAt: input.actualReturnedAt ? input.actualReturnedAt.toISOString() : null,
        itemCount: input.inspections.length,
        note: input.note ?? null,
      },
    });
    return result;
  }

  private authorizeReturn(user: CurrentUser) {
    if (!user.permissions?.includes(PERMISSIONS.RENTALS_RETURN)) {
      throw new RentalAccessDeniedError('Bạn không có quyền nhận trả đồ.');
    }
  }
}
