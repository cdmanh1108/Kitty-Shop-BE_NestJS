import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { OBJECT_STORAGE_PORT, type ObjectStoragePort } from '@common/storage/object-storage.port';
import { validateAndHashImage } from '@common/storage/storage-key.builder';
import { PERMISSIONS } from '@common/constants/permissions';
import type { CurrentUser } from '@common/types/current-user';
import { RENTAL_REPOSITORY, type RentalRepository } from '../domain/rental.repository';
import type { SettleRentalOrderInput } from './rental.contracts';

export interface SettlementImage {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
}

@Injectable()
export class RentalSettlementService {
  private readonly logger = new Logger(RentalSettlementService.name);

  constructor(
    @Inject(RENTAL_REPOSITORY) private readonly repository: RentalRepository,
    @Inject(OBJECT_STORAGE_PORT) private readonly storage: ObjectStoragePort,
  ) {}

  async settle(
    user: CurrentUser,
    orderId: string,
    input: SettleRentalOrderInput,
    file?: SettlementImage,
  ) {
    this.authorize(user);
    const order = await this.repository.get(user.shopId, orderId);
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
        await this.storage.putObject({
          key: evidence.key,
          body: file.buffer,
          contentType: evidence.mimeType,
          cacheControl: 'private, no-store',
        });
      }

      const result = await this.repository.settleOrder({
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
          const saved = await this.repository.get(user.shopId, orderId);
          if (saved?.settlement?.evidenceKey !== evidence.key) {
            await this.storage.deleteObject(evidence.key);
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
    const order = await this.repository.get(user.shopId, orderId);
    const settlement = order?.settlement;
    if (!settlement?.evidenceKey || !settlement.evidenceMimeType) {
      throw new NotFoundException('Không tìm thấy ảnh bằng chứng kết toán.');
    }
    return {
      body: await this.storage.getObject(settlement.evidenceKey),
      mimeType: settlement.evidenceMimeType,
    };
  }

  private authorize(user: CurrentUser) {
    if (!user.permissions.includes(PERMISSIONS.RENTALS_SETTLE)) {
      throw new ForbiddenException('Bạn không có quyền kết toán đơn thuê.');
    }
  }
}
