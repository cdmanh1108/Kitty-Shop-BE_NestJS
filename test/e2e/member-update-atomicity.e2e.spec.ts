import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import * as request from 'supertest';
import type { PrismaService } from '../../src/database/prisma/prisma.service';
import { PrismaMemberRepository } from '../../src/modules/members/infrastructure/prisma-member.repository';
import { rentalScenario } from '../fixtures/rental.fixture';
import { createTestUserAndMember, uniqueCode } from '../fixtures/test-factories';
import { generateTestAccessToken } from '../helpers/auth-helper';
import {
  connectTestDatabase,
  disconnectTestDatabase,
  resetTestDatabase,
} from '../helpers/test-database';
import { createTestApp } from '../helpers/test-app';

describe('Member update atomicity', () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;

  beforeAll(async () => {
    prisma = await connectTestDatabase();
    app = await createTestApp();
    server = app.getHttpServer() as Server;
  });

  beforeEach(async () => {
    await resetTestDatabase(prisma);
  });

  afterAll(async () => {
    if (app) await app.close();
    await disconnectTestDatabase();
  });

  async function fixture() {
    const actor = await rentalScenario(prisma);
    const target = await createTestUserAndMember(prisma, actor.shop.id);
    const supervisor = await prisma.role.create({
      data: { shopId: actor.shop.id, code: uniqueCode('SUPERVISOR'), name: 'Supervisor' },
    });
    return {
      actor,
      target,
      supervisor,
      actorToken: generateTestAccessToken(actor.principal),
      targetToken: generateTestAccessToken({
        userId: target.user.id,
        memberId: target.member.id,
        shopId: actor.shop.id,
      }),
    };
  }

  it('rolls back an invalid role request and commits one audit row with a valid replacement', async () => {
    const data = await fixture();
    const beforeMember = await prisma.shopMember.findUniqueOrThrow({
      where: { id: data.target.member.id },
      select: { status: true, userId: true },
    });
    const beforeRoles = await prisma.memberRole.findMany({
      where: { memberId: data.target.member.id },
      select: { roleId: true, assignedAt: true },
      orderBy: { roleId: 'asc' },
    });

    const failed = await request(server)
      .patch('/api/v1/admin/members/' + data.target.member.id)
      .set('Authorization', 'Bearer ' + data.actorToken)
      .send({ status: 'INACTIVE', roleCodes: [data.supervisor.code, 'ROLE_MISSING'] })
      .expect(400);
    expect(failed.body).toMatchObject({ code: 'MEMBER_ROLE_NOT_FOUND' });
    await expect(
      prisma.shopMember.findUniqueOrThrow({
        where: { id: data.target.member.id },
        select: { status: true, userId: true },
      }),
    ).resolves.toEqual(beforeMember);
    await expect(
      prisma.memberRole.findMany({
        where: { memberId: data.target.member.id },
        select: { roleId: true, assignedAt: true },
        orderBy: { roleId: 'asc' },
      }),
    ).resolves.toEqual(beforeRoles);
    await expect(
      prisma.auditLog.count({
        where: { shopId: data.actor.shop.id, action: 'UPDATE', entityId: data.target.member.id },
      }),
    ).resolves.toBe(0);
    await request(server)
      .get('/api/v1/admin/auth/me')
      .set('Authorization', 'Bearer ' + data.targetToken)
      .expect(200);

    const valid = await request(server)
      .patch('/api/v1/admin/members/' + data.target.member.id)
      .set('Authorization', 'Bearer ' + data.actorToken)
      .send({ status: 'INACTIVE', roleCodes: [data.supervisor.code] })
      .expect(200);
    const validBody = JSON.parse(valid.text) as unknown as { status: string };
    expect(validBody.status).toBe('INACTIVE');
    await expect(
      prisma.memberRole.findMany({
        where: { memberId: data.target.member.id },
        select: { roleId: true },
      }),
    ).resolves.toEqual([{ roleId: data.supervisor.id }]);
    await expect(
      prisma.auditLog.findMany({
        where: { shopId: data.actor.shop.id, action: 'UPDATE', entityId: data.target.member.id },
        select: { actorUserId: true, actorMemberId: true, newValues: true },
      }),
    ).resolves.toEqual([
      {
        actorUserId: data.actor.user.id,
        actorMemberId: data.actor.member.id,
        newValues: { status: 'INACTIVE', roleCodes: [data.supervisor.code] },
      },
    ]);
    await request(server)
      .get('/api/v1/admin/auth/me')
      .set('Authorization', 'Bearer ' + data.targetToken)
      .expect(401);
  });

  it('rolls back status and roles when the required audit insert fails', async () => {
    const data = await fixture();
    const previousRoles = await prisma.memberRole.findMany({
      where: { memberId: data.target.member.id },
      select: { roleId: true, assignedAt: true },
      orderBy: { roleId: 'asc' },
    });
    const repository = new PrismaMemberRepository(prisma);

    await expect(
      repository.update({
        shopId: data.actor.shop.id,
        memberId: data.target.member.id,
        status: 'INACTIVE',
        roleCodes: [data.supervisor.code],
        audit: {
          shopId: data.actor.shop.id,
          actorUserId: data.actor.user.id,
          actorMemberId: data.actor.member.id,
          action: 'UPDATE',
          entityType: 'shop_member',
          entityId: data.target.member.id,
          requestId: 'x'.repeat(101),
          newValues: { status: 'INACTIVE', roleCodes: [data.supervisor.code] },
        },
      }),
    ).rejects.toThrow();

    await expect(
      prisma.shopMember.findUniqueOrThrow({
        where: { id: data.target.member.id },
        select: { status: true },
      }),
    ).resolves.toEqual({ status: 'ACTIVE' });
    await expect(
      prisma.memberRole.findMany({
        where: { memberId: data.target.member.id },
        select: { roleId: true, assignedAt: true },
        orderBy: { roleId: 'asc' },
      }),
    ).resolves.toEqual(previousRoles);
    await expect(
      prisma.auditLog.count({
        where: { shopId: data.actor.shop.id, entityId: data.target.member.id },
      }),
    ).resolves.toBe(0);
  });
});
