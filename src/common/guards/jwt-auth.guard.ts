import type { Request } from 'express';
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '@database/prisma/prisma.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { isVerifiedAccessPayload } from '../types/verified-access-payload';
import type { JwtAccessPayload } from '../types/current-user';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Vui lòng đăng nhập để tiếp tục.');
    }

    const token = authorization.slice('Bearer '.length).trim();
    let payload: JwtAccessPayload;
    try {
      const verified: unknown = await this.jwtService.verifyAsync(token, {
        algorithms: ['HS256'],
        issuer: 'kitty-api',
        audience: 'kitty-admin',
      });
      if (!isVerifiedAccessPayload(verified)) throw new Error('Thông tin xác thực không hợp lệ.');
      payload = verified;
    } catch {
      throw new UnauthorizedException(
        'Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.',
      );
    }

    const member = await this.prisma.shopMember.findUnique({
      where: { id: payload.mid },
      include: {
        user: true,
        memberRoles: {
          include: {
            role: {
              include: {
                rolePermissions: { include: { permission: true } },
              },
            },
          },
        },
      },
    });

    if (
      !member ||
      member.status !== 'ACTIVE' ||
      member.user.status !== 'ACTIVE' ||
      member.userId !== payload.sub ||
      member.shopId !== payload.sid
    ) {
      throw new UnauthorizedException(
        'Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.',
      );
    }

    const permissions = new Set<string>();
    for (const memberRole of member.memberRoles) {
      for (const rolePermission of memberRole.role.rolePermissions) {
        permissions.add(rolePermission.permission.code);
      }
    }

    request.currentUser = {
      userId: member.userId,
      memberId: member.id,
      shopId: member.shopId,
      email: member.user.email,
      fullName: member.user.fullName,
      permissions: [...permissions],
    };
    return true;
  }
}
