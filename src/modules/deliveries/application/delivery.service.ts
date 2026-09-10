import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { CurrentUser } from '@common/types/current-user';
import { AuditService } from '@modules/audit/application/audit.service';
import { DELIVERY_REPOSITORY, type DeliveryRepository } from '../domain/delivery.repository';
import type { CreateDeliveryReqDto, UpdateDeliveryStatusReqDto } from '../api/delivery.dto';

@Injectable()
export class DeliveryService {
  constructor(
    @Inject(DELIVERY_REPOSITORY) private readonly repository: DeliveryRepository,
    private readonly audit: AuditService,
  ) {}

  list(user: CurrentUser, orderId?: string) { return this.repository.list(user.shopId, orderId); }

  async create(user: CurrentUser, orderId: string, input: CreateDeliveryReqDto) {
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
    if (!delivery) throw new NotFoundException('Rental order not found');
    return delivery;
  }

  async updateStatus(user: CurrentUser, id: string, input: UpdateDeliveryStatusReqDto) {
    const allowed = ['PENDING', 'READY', 'PICKED_UP', 'DELIVERING', 'DELIVERED', 'FAILED', 'CANCELLED'];
    if (!allowed.includes(input.status)) throw new BadRequestException('Unsupported delivery status');
    const delivery = await this.repository.updateStatus({ shopId: user.shopId, id, ...input });
    if (!delivery) throw new NotFoundException('Delivery job not found');
    await this.audit.log({ shopId: user.shopId, actorUserId: user.userId, actorMemberId: user.memberId, action: 'STATUS_CHANGE', entityType: 'delivery_job', entityId: id, newValues: { status: input.status } });
    return delivery;
  }
}
