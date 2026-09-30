import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { CHARGE_TYPE } from '../domain/charge-type';
import { RENTAL_STATUS } from '../domain/rental-status';
import { AUDIT_PORT, type AuditPort } from '@modules/audit/domain/audit.port';
import { OBJECT_STORAGE_PORT, type ObjectStoragePort } from '@common/storage/object-storage.port';
import { validateAndHashImage } from '@common/storage/storage-key.builder';
import { PERMISSIONS } from '@common/constants/permissions';
import type { CurrentUser } from '@common/types/current-user';
import {
  RENTAL_LIFECYCLE_REPOSITORY,
  RENTAL_ORDER_READER,
  type RentalLifecycleRepository,
  type RentalOrderReader,
} from '../domain/rental.repository';
import type { AddRentalChargeInput, SettleRentalOrderInput } from './rental.contracts';

const CHARGE_TYPES: ReadonlySet<string> = new Set(Object.values(CHARGE_TYPE));

export interface SettlementImage {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
}

@Injectable()
export class RentalSettlementService {
  private readonly logger = new Logger(RentalSettlementService.name);

  constructor(
    @Inject(RENTAL_ORDER_READER) private readonly orderReader: RentalOrderReader,
    @Inject(RENTAL_LIFECYCLE_REPOSITORY)
    private readonly lifecycle: RentalLifecycleRepository,
    @Inject(OBJECT_STORAGE_PORT) private readonly storage: ObjectStoragePort,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
  ) {}

  async settle(
    user: CurrentUser,
    orderId: string,
    input: SettleRentalOrderInput,
    file?: SettlementImage,
  ) {
    this.authorize(user);
    const order = await this.orderReader.get(user.shopId, orderId);
    if (!order) throw new NotFoundException('Không tìm thấy đơn thuê.');
    if (order.status !== 'RETURNED') {
      throw new BadRequestException('Chỉ có thể kết toán đơn ở trạng thái đã nhận trả.');
    }
    if (order.settlement) {
      throw new BadRequestException('Đơn thuê này đã được kết toán.');
    }

    let evidence: { key: string; filename: string; mimeType: string; size: number } | undefined;
    if (file) {
      let image;
      try {
        image = validateAndHashImage(file.buffer, file.mimetype);
      } catch (error) {
        throw new BadRequestException(
          error instanceof Error ? error.message : 'Ảnh bằng chứng không hợp lệ.',
        );
      }
      if (file.mimetype !== image.mimeType) {
        throw new BadRequestException('Loại tệp không khớp nội dung hình ảnh.');
      }
      const filename =
        Array.from(file.originalname, (character) =>
          character.charCodeAt(0) < 32 ||
          character.charCodeAt(0) === 127 ||
          character === '/' ||
          character === '\\'
            ? '_'
            : character,
        )
          .join('')
          .slice(0, 255) || 'evidence';
      evidence = {
        key: `private/rental-settlements/${user.shopId}/${orderId}/${randomUUID()}.${image.extension}`,
        filename,
        mimeType: image.mimeType,
        size: image.sizeBytes,
      };
    }

    try {
      if (evidence && file) {
        await this.storage.putObject(
          {
            key: evidence.key,
            body: file.buffer,
            contentType: evidence.mimeType,
            cacheControl: 'private, no-store',
          },
          { purpose: 'default' },
        );
      }

      const result = await this.lifecycle.settleOrder({
        shopId: user.shopId,
        orderId,
        actorMemberId: user.memberId,
        actorUserId: user.userId,
        actorName: user.fullName,
        settlementType: input.settlementType,
        paymentMethod: input.paymentMethod,
        note: input.note?.trim(),
        returnDocument: input.returnDocumentCollateral,
        evidence,
      });

      if (!result) throw new NotFoundException('Không tìm thấy đơn thuê.');
      return result;
    } catch (error) {
      if (evidence) {
        try {
          const saved = await this.orderReader.get(user.shopId, orderId);
          if (saved?.settlement?.evidenceKey !== evidence.key) {
            await this.storage.deleteObject(evidence.key, { purpose: 'cleanup' });
          }
        } catch {
          this.logger.error({ event: 'rental.settlement.evidence.cleanup_failed', orderId });
        }
      }
      throw error;
    }
  }

  async evidence(user: CurrentUser, orderId: string) {
    this.authorize(user);
    const order = await this.orderReader.get(user.shopId, orderId);
    const settlement = order?.settlement;
    if (!settlement?.evidenceKey || !settlement.evidenceMimeType) {
      throw new NotFoundException('Không tìm thấy ảnh bằng chứng kết toán.');
    }
    return {
      body: await this.storage.getObject(settlement.evidenceKey),
      mimeType: settlement.evidenceMimeType,
    };
  }

  async returnCollateral(user: CurrentUser, id: string) {
    const order = await this.lifecycle.returnCollateral(user.shopId, id, user.memberId);
    if (!order) throw new NotFoundException('Không tìm thấy đơn thuê.');
    await this.audit.log({
      shopId: user.shopId,
      actorUserId: user.userId,
      actorMemberId: user.memberId,
      action: 'COLLATERAL_RETURNED',
      entityType: 'rental_order',
      entityId: id,
    });
    return order;
  }

  async addCharge(user: CurrentUser, id: string, input: AddRentalChargeInput) {
    if (!CHARGE_TYPES.has(input.chargeType))
      throw new BadRequestException('Loại phụ phí không hợp lệ.');
    const current = await this.orderReader.get(user.shopId, id);
    if (!current) throw new NotFoundException('Không tìm thấy đơn thuê.');
    if (current.status === RENTAL_STATUS.COMPLETED || current.status === RENTAL_STATUS.CANCELLED) {
      throw new BadRequestException('Không thể thêm phụ phí cho đơn thuê đã đóng hoặc đã hủy.');
    }
    if (current.settlement) {
      throw new BadRequestException('Không thể thêm phụ phí sau khi đã kết toán đơn thuê.');
    }
    const order = await this.lifecycle.addCharge({
      shopId: user.shopId,
      orderId: id,
      chargeType: input.chargeType,
      description: input.description,
      amount: input.amount,
      quantity: input.quantity,
      createdBy: user.memberId,
    });
    if (!order) throw new NotFoundException('Không tìm thấy đơn thuê.');
    await this.audit.log({
      shopId: user.shopId,
      actorUserId: user.userId,
      actorMemberId: user.memberId,
      action: 'ADD_CHARGE',
      entityType: 'rental_order',
      entityId: id,
      newValues: { ...input },
    });
    return order;
  }

  private authorize(user: CurrentUser) {
    if (!user.permissions.includes(PERMISSIONS.RENTALS_SETTLE)) {
      throw new ForbiddenException('Bạn không có quyền kết toán đơn thuê.');
    }
  }
}
