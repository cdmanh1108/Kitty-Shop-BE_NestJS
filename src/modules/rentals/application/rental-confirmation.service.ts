import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  APPLICATION_LOGGER,
  silentApplicationLog,
  type ApplicationLog,
  type ApplicationLoggerFactory,
} from '@common/logging/application-logger.port';
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
} from '@modules/settings/public/rental-policy';
import {
  RENTAL_LIFECYCLE_REPOSITORY,
  type RentalLifecycleRepository,
} from '../domain/ports/rental-lifecycle.port';
import {
  RENTAL_ORDER_READER,
  type RentalOrderReader,
} from '../domain/ports/rental-order-reader.port';
import { assertManualConfirmation, type ConfirmRentalInput } from '../domain/rental-confirmation';
import {
  InvalidRentalEvidenceError,
  RentalAccessDeniedError,
  RentalEvidenceNotFoundError,
  RentalNotFoundError,
  RentalOperationNotAllowedError,
} from './rental.errors';

export interface ConfirmationImage {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
}

@Injectable()
export class RentalConfirmationService {
  private readonly logger: ApplicationLog;

  constructor(
    @Inject(RENTAL_ORDER_READER) private readonly orderReader: RentalOrderReader,
    @Inject(RENTAL_LIFECYCLE_REPOSITORY)
    private readonly lifecycle: RentalLifecycleRepository,
    @Inject(RENTAL_POLICY_PROVIDER) private readonly policies: RentalPolicyProvider,
    @Inject(OBJECT_STORAGE_PORT) private readonly storage: ObjectStoragePort,
    @Optional() @Inject(APPLICATION_LOGGER) loggerFactory?: ApplicationLoggerFactory,
  ) {
    this.logger = loggerFactory?.create(RentalConfirmationService.name) ?? silentApplicationLog;
  }

  async options(user: CurrentUser, orderId: string) {
    this.authorize(user);
    const order = await this.orderReader.get(user.shopId, orderId);
    if (!order) throw new RentalNotFoundError('Không tìm thấy đơn thuê.');
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
    const order = await this.orderReader.get(user.shopId, orderId);
    if (!order) throw new RentalNotFoundError('Không tìm thấy đơn thuê.');
    if (order.status !== 'RESERVED')
      throw new RentalOperationNotAllowedError(
        'Chỉ có thể xác nhận đơn đang ở trạng thái đã đặt trước.',
      );
    assertManualConfirmation(input, await this.policies.getPolicy(user.shopId));
    let evidence: { key: string; filename: string; mimeType: string; size: number } | undefined;
    if (file) {
      let image;
      try {
        image = validateAndHashImage(file.buffer, file.mimetype);
      } catch (error) {
        throw new InvalidRentalEvidenceError(
          error instanceof Error ? error.message : 'Ảnh bằng chứng không hợp lệ.',
        );
      }
      if (file.mimetype !== image.mimeType)
        throw new InvalidRentalEvidenceError('Loại tệp không khớp nội dung hình ảnh.');
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
        await this.storage.putObject(
          {
            key: evidence.key,
            body: file.buffer,
            contentType: evidence.mimeType,
            cacheControl: 'private, no-store',
          },
          { purpose: 'default' },
        );
      const result = await this.lifecycle.confirm({
        ...input,
        orderId,
        shopId: user.shopId,
        actorMemberId: user.memberId,
        actorUserId: user.userId,
        actorName: user.fullName,
        requestId: currentRequestMetadata()?.requestId,
        evidence,
      });
      if (!result) throw new RentalNotFoundError('Không tìm thấy đơn thuê.');
      return result;
    } catch (error) {
      if (evidence) {
        // A lost commit response must not delete evidence of a committed confirmation.
        try {
          const saved = await this.orderReader.get(user.shopId, orderId);
          if (saved?.confirmation?.evidenceKey !== evidence.key)
            await this.storage.deleteObject(evidence.key, { purpose: 'cleanup' });
        } catch {
          this.logger.error({ event: 'rental.confirmation.evidence.cleanup_failed', orderId });
        }
      }
      throw error;
    }
  }

  async evidence(user: CurrentUser, orderId: string) {
    this.authorize(user);
    const order = await this.orderReader.get(user.shopId, orderId);
    const confirmation = order?.confirmation;
    if (!confirmation?.evidenceKey || !confirmation.evidenceMimeType)
      throw new RentalEvidenceNotFoundError('Không tìm thấy ảnh bằng chứng.');
    return {
      body: await this.storage.getObject(confirmation.evidenceKey),
      mimeType: confirmation.evidenceMimeType,
    };
  }

  private authorize(user: CurrentUser) {
    if (!user.permissions.includes(PERMISSIONS.RENTALS_CONFIRM))
      throw new RentalAccessDeniedError('Bạn không có quyền xác nhận đơn thuê.');
  }
}
