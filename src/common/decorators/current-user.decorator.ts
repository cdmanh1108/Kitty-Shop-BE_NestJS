import type { Request } from 'express';
import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { CurrentUser as CurrentUserType } from '../types/current-user';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): CurrentUserType => {
    const request = context.switchToHttp().getRequest<Request>();
    if (!request.currentUser) {
      throw new Error('Không tìm thấy thông tin người dùng trong yêu cầu.');
    }
    return request.currentUser;
  },
);
