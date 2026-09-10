import { Injectable } from '@nestjs/common';
import { PrismaService } from '@database/prisma/prisma.service';
import type { MemberRepository } from '../domain/member.repository';

@Injectable()
export class PrismaMemberRepository implements MemberRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(shopId: string) {
    return this.prisma.shopMember.findMany({
      where: { shopId },
      include: {
        user: { select: { email: true, phone: true, fullName: true, status: true, lastLoginAt: true } },
        memberRoles: { include: { role: { select: { id: true, code: true, name: true } } } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  roles(shopId: string) {
    return this.prisma.role.findMany({ where: { shopId }, select: { id: true, code: true, name: true }, orderBy: { name: 'asc' } });
  }

  async membershipExists(shopId: string, email: string): Promise<boolean> {
    return (await this.prisma.shopMember.count({ where: { shopId, user: { email: email.toLowerCase() } } })) > 0;
  }

  create(input: { shopId: string; email: string; fullName: string; passwordHash: string; employeeCode?: string; roleCodes: string[] }) {
    return this.prisma.$transaction(async (tx) => {
      const roles = await tx.role.findMany({ where: { shopId: input.shopId, code: { in: input.roleCodes } } });
      if (roles.length !== new Set(input.roleCodes).size) return null;
      let user = await tx.user.findUnique({ where: { email: input.email.toLowerCase() } });
      if (!user) {
        user = await tx.user.create({ data: { email: input.email.toLowerCase(), fullName: input.fullName, passwordHash: input.passwordHash } });
      }
      const member = await tx.shopMember.create({ data: { shopId: input.shopId, userId: user.id, employeeCode: input.employeeCode, displayName: input.fullName } });
      await tx.memberRole.createMany({ data: roles.map((role) => ({ memberId: member.id, roleId: role.id })) });
      return tx.shopMember.findUnique({ where: { id: member.id }, include: { user: { select: { email: true, fullName: true } }, memberRoles: { include: { role: true } } } });
    });
  }

  update(input: { shopId: string; memberId: string; status?: string; roleCodes?: string[] }) {
    return this.prisma.$transaction(async (tx) => {
      const member = await tx.shopMember.findFirst({ where: { id: input.memberId, shopId: input.shopId } });
      if (!member) return null;
      if (input.status) await tx.shopMember.update({ where: { id: member.id }, data: { status: input.status } });
      if (input.roleCodes) {
        const roles = await tx.role.findMany({ where: { shopId: input.shopId, code: { in: input.roleCodes } } });
        if (roles.length !== new Set(input.roleCodes).size) return null;
        await tx.memberRole.deleteMany({ where: { memberId: member.id } });
        await tx.memberRole.createMany({ data: roles.map((role) => ({ memberId: member.id, roleId: role.id })) });
      }
      return tx.shopMember.findUnique({ where: { id: member.id }, include: { user: { select: { email: true, fullName: true } }, memberRoles: { include: { role: true } } } });
    });
  }
}
