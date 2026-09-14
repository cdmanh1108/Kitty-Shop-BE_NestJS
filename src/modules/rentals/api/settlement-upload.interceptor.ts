import {
  BadRequestException,
  Injectable,
  PayloadTooLargeException,
  type CallHandler,
  type ExecutionContext,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MAX_MEDIA_FILE_SIZE_BYTES } from '@common/storage/storage-key.builder';

@Injectable()
export class SettlementUploadInterceptor extends FileInterceptor('evidence', {
  limits: { fileSize: MAX_MEDIA_FILE_SIZE_BYTES, files: 1, fields: 4, fieldSize: 8192 },
}) {
  override async intercept(context: ExecutionContext, next: CallHandler) {
    try {
      return await super.intercept(context, next);
    } catch (error) {
      if (error instanceof PayloadTooLargeException) {
        throw new PayloadTooLargeException('Ảnh bằng chứng kết toán không được vượt quá 15 MB.');
      }
      throw new BadRequestException(
        'Dữ liệu tải lên không hợp lệ. Chỉ được gửi một ảnh bằng chứng và các trường kết toán.',
      );
    }
  }
}
