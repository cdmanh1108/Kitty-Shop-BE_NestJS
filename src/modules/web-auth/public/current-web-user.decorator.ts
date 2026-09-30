import { createParamDecorator, ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { WebAuthPrincipal } from './web-auth-principal';
import type { WebAuthRequest } from './web-auth-request';

export const CurrentWebUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): WebAuthPrincipal => {
    const user = context.switchToHttp().getRequest<WebAuthRequest>().webUser;
    if (!user) throw new ForbiddenException('Không tìm thấy phiên đăng nhập hợp lệ.');
    return user;
  },
);
