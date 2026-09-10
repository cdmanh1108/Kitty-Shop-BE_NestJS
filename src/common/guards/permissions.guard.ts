import type { Request } from 'express';
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import type { PermissionCode } from '../constants/permissions';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<PermissionCode[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const granted = new Set(request.currentUser?.permissions ?? []);
    if (!required.every((permission) => granted.has(permission))) {
      throw new ForbiddenException('You do not have permission to perform this action');
    }
    return true;
  }
}
