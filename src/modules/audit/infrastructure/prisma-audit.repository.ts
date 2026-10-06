import { paginateMeta } from '@common/types/pagination';
import { PrismaService } from '@database/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { AuditRepository, CreateAuditLogData } from '../domain/audit.repository';

@Injectable()
export class PrismaAuditRepository implements AuditRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateAuditLogData): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        ...input,
        oldValues: input.oldValues as Prisma.InputJsonValue | undefined,
        newValues: input.newValues as Prisma.InputJsonValue | undefined,
      },
    });
  }

  async list(input: {
    shopId: string;
    page: number;
    limit: number;
    entityType?: string;
    entityId?: string;
  }) {
    const where = {
      shopId: input.shopId,
      ...(input.entityType ? { entityType: input.entityType } : {}),
      ...(input.entityId ? { entityId: input.entityId } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (input.page - 1) * input.limit,
        take: input.limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    const memberIds = items.flatMap((item) => (item.actorMemberId ? [item.actorMemberId] : []));
    const userIds = items.flatMap((item) =>
      !item.actorMemberId && item.actorUserId ? [item.actorUserId] : [],
    );
    const members =
      memberIds.length || userIds.length
        ? await this.prisma.shopMember.findMany({
            where: {
              shopId: input.shopId,
              OR: [{ id: { in: memberIds } }, { userId: { in: userIds } }],
            },
            select: { id: true, userId: true, displayName: true },
          })
        : [];
    const memberNames = new Map(members.map((member) => [member.id, member.displayName]));
    const userNames = new Map(members.map((member) => [member.userId, member.displayName]));
    return {
      items: items.map((item) => ({
        ...item,
        actorDisplayName: item.actorWebAccountId
          ? null
          : item.actorMemberId
            ? (memberNames.get(item.actorMemberId) ?? null)
            : item.actorUserId
              ? (userNames.get(item.actorUserId) ?? null)
              : null,
      })),
      meta: paginateMeta(input.page, input.limit, total),
    };
  }
}
