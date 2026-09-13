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
import {
  validateAndHashImage,
  MAX_MEDIA_FILE_SIZE_BYTES,
} from '@common/storage/storage-key.builder';
import { PERMISSIONS } from '@common/constants/permissions';
import type { CurrentUser } from '@common/types/current-user';
import { currentRequestMetadata } from '@common/request-context/request-context';
import {
  RENTAL_POLICY_PROVIDER,
  type RentalPolicyProvider,
} from '@modules/settings/domain/rental-policy';
import { RENTAL_REPOSITORY, type RentalRepository } from '../domain/rental.repository';
import { assertManualConfirmation, type ConfirmRentalInput } from '../domain/rental-confirmation';

export interface ConfirmationImage {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
}

@Injectable()
export class RentalConfirmationService {
  private readonly logger = new Logger(RentalConfirmationService.name);
  constructor(
    @Inject(RENTAL_REPOSITORY) private readonly repository: RentalRepository,
    @Inject(RENTAL_POLICY_PROVIDER) private readonly policies: RentalPolicyProvider,
    @Inject(OBJECT_STORAGE_PORT) private readonly storage: ObjectStoragePort,
  ) {}

  async options(user: CurrentUser, orderId: string) {
    this.authorize(user);
    const order = await this.repository.get(user.shopId, orderId);
    if (!order) throw new NotFoundException('Không tìm thấy đơn thuê.');
    const policy = await this.policies.getPolicy(user.shopId);
    return {
      allowedMethods: policy.deposit.allowedMethods,
      allowedDocumentTypes: policy.deposit.allowedDocumentTypes,
      expectedDeposit: order.depositRequired.toString(),
      maxEvidenceBytes: MAX_MEDIA_FILE_SIZE_BYTES,
      evidenceMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    };
  }

  async confirm(
    user: CurrentUser,
    orderId: string,
    input: ConfirmRentalInput,
    file?: ConfirmationImage,
  ) {
    this.authorize(user);
    const order = await this.repository.get(user.shopId, orderId);
    if (!order) throw new NotFoundException('Không tìm thấy đơn thuê.');
    if (order.status !== 'RESERVED')
      throw new BadRequestException('Chỉ có thể xác nhận đơn đang ở trạng thái đã đặt trước.');
    assertManualConfirmation(
      input,
      order.depositRequired.toString(),
      await this.policies.getPolicy(user.shopId),
    );
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
      if (file.mimetype !== image.mimeType)
        throw new BadRequestException('Loại tệp không khớp nội dung hình ảnh.');
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
        key: `private/rental-confirmations/${user.shopId}/${orderId}/${randomUUID()}.${image.extension}`,
        filename,
        mimeType: image.mimeType,
        size: image.sizeBytes,
      };
    }
    try {
      if (evidence && file)
        await this.storage.putObject({
          key: evidence.key,
          body: file.buffer,
          contentType: evidence.mimeType,
          cacheControl: 'private, no-store',
        });
      const result = await this.repository.confirm({
        ...input,
        orderId,
        shopId: user.shopId,
        actorMemberId: user.memberId,
        actorUserId: user.userId,
        actorName: user.fullName,
        requestId: currentRequestMetadata()?.requestId,
        evidence,
      });
      if (!result) throw new NotFoundException('Không tìm thấy đơn thuê.');
      return result;
    } catch (error) {
      if (evidence) {
        // A lost commit response must not delete evidence of a committed confirmation.
        try {
          const saved = await this.repository.get(user.shopId, orderId);
          if (saved?.confirmation?.evidenceKey !== evidence.key)
            await this.storage.deleteObject(evidence.key);
        } catch {
          this.logger.error({ event: 'rental.confirmation.evidence.cleanup_failed', orderId });
        }
      }
      throw error;
    }
  }

  async evidence(user: CurrentUser, orderId: string) {
    this.authorize(user);
    const order = await this.repository.get(user.shopId, orderId);
    const confirmation = order?.confirmation;
    if (!confirmation?.evidenceKey || !confirmation.evidenceMimeType)
      throw new NotFoundException('Không tìm thấy ảnh bằng chứng.');
    return {
      body: await this.storage.getObject(confirmation.evidenceKey),
      mimeType: confirmation.evidenceMimeType,
    };
  }

  private authorize(user: CurrentUser) {
    if (!user.permissions.includes(PERMISSIONS.RENTALS_CONFIRM))
      throw new ForbiddenException('Bạn không có quyền xác nhận đơn thuê.');
  }
}
