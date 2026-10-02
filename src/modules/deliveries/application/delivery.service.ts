import { DELIVERY_STATUS } from '@modules/deliveries/domain/delivery-status';
import type { CurrentUser } from '@common/types/current-user';
import { AUDIT_PORT, type AuditPort } from '@modules/audit/public/audit-contracts';
import { Inject, Injectable } from '@nestjs/common';
import { DELIVERY_REPOSITORY, type DeliveryRepository } from '../domain/delivery.repository';
import type { CreateDeliveryInput, UpdateDeliveryStatusInput } from './delivery.contracts';
import {
  DeliveryChangedConcurrentlyError,
  DeliveryNotFoundError,
  DeliveryOrderNotFoundError,
  DeliveryTransitionNotAllowedError,
  InvalidDeliveryStatusError,
} from './delivery.errors';

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
    if (!delivery) throw new DeliveryOrderNotFoundError();
    return delivery;
  }

  async updateStatus(user: CurrentUser, id: string, input: UpdateDeliveryStatusInput) {
    const allowed: readonly string[] = Object.values(DELIVERY_STATUS);
    if (!allowed.includes(input.status)) throw new InvalidDeliveryStatusError();
    const result = await this.repository.updateStatus({ shopId: user.shopId, id, ...input });
    if (result.kind === 'NOT_FOUND') throw new DeliveryNotFoundError();
    if (result.kind === 'INVALID_TRANSITION') {
      throw new DeliveryTransitionNotAllowedError();
    }
    if (result.kind === 'CONCURRENT_MODIFICATION') {
      throw new DeliveryChangedConcurrentlyError();
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
