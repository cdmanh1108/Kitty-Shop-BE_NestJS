import { DELIVERY_STATUS } from '@modules/deliveries/domain/delivery-status';
import type { CurrentUser } from '@common/types/current-user';
import { AUDIT_PORT, type AuditPort } from '@modules/audit/domain/audit.port';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DELIVERY_REPOSITORY, type DeliveryRepository } from '../domain/delivery.repository';
import type { CreateDeliveryInput, UpdateDeliveryStatusInput } from './delivery.contracts';

@Injectable()
export class DeliveryService {
  constructor(
    @Inject(DELIVERY_REPOSITORY) private readonly repository: DeliveryRepository,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
  ) {}

  list(user: CurrentUser, orderId?: string) {
    return this.repository.list(user.shopId, orderId);
  }

  async create(user: CurrentUser, orderId: string, input: CreateDeliveryInput) {
    const delivery = await this.repository.create({
      shopId: user.shopId,
      orderId,
      direction: input.direction,
      method: input.method,
      scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : undefined,
      recipientName: input.recipientName,
      recipientPhone: input.recipientPhone,
      addressLine: input.addressLine,
      ward: input.ward,
      district: input.district,
      city: input.city,
      province: input.province,
      shipperName: input.shipperName,
      shipperPhone: input.shipperPhone,
      shippingFee: input.shippingFee,
      trackingCode: input.trackingCode,
      notes: input.notes,
      createdBy: user.memberId,
    });
    if (!delivery) throw new NotFoundException('Không tìm thấy đơn thuê.');
    return delivery;
  }

  async updateStatus(user: CurrentUser, id: string, input: UpdateDeliveryStatusInput) {
    const allowed: readonly string[] = Object.values(DELIVERY_STATUS);
    if (!allowed.includes(input.status))
      throw new BadRequestException('Trạng thái giao hàng không hợp lệ.');
    const result = await this.repository.updateStatus({ shopId: user.shopId, id, ...input });
    if (result.kind === 'NOT_FOUND')
      throw new NotFoundException('Không tìm thấy công việc giao hàng.');
    if (result.kind === 'INVALID_TRANSITION') {
      throw new ConflictException({
        code: 'DELIVERY_INVALID_TRANSITION',
        message: 'Không thể chuyển trạng thái giao hàng theo quy trình hiện tại.',
      });
    }
    if (result.kind === 'CONCURRENT_MODIFICATION') {
      throw new ConflictException({
        code: 'DELIVERY_CONCURRENT_MODIFICATION',
        message: 'Công việc giao hàng vừa được thay đổi. Vui lòng tải lại và thử lại.',
      });
    }
    await this.audit.log({
      shopId: user.shopId,
      actorUserId: user.userId,
      actorMemberId: user.memberId,
      action: 'STATUS_CHANGE',
      entityType: 'delivery_job',
      entityId: id,
      oldValues: { status: result.fromStatus },
      newValues: { status: input.status },
    });
    return result.delivery;
  }
}
