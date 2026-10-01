import { HttpException } from '@nestjs/common';
import { WEB_AUTH_ERROR_MESSAGES } from '../domain/web-auth.errors';

export function webAuthHttpError(code: string, status = 400): never {
  throw new HttpException(
    { code, message: WEB_AUTH_ERROR_MESSAGES[code] ?? 'Không thể hoàn tất yêu cầu.' },
    status,
  );
}
