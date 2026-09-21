import { BadRequestException } from '@nestjs/common';
import { MemberService } from '../../src/modules/members/application/member.service';
import type { AuditPort } from '../../src/modules/audit/domain/audit.port';
import {
  MemberRoleNotFoundError,
  type MemberRepository,
} from '../../src/modules/members/domain/member.repository';

describe('MemberService update', () => {
  const user = {
    userId: 'user-1',
    memberId: 'actor-1',
    shopId: 'shop-1',
    email: 'actor@example.test',
    fullName: 'Actor',
    permissions: ['members.manage'],
  };
  const repository = (): jest.Mocked<MemberRepository> => ({
    list: jest.fn(),
    roles: jest.fn(),
    membershipExists: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  });
  const audit = (): jest.Mocked<AuditPort> => ({ log: jest.fn() });

  it('maps a typed invalid-role failure to 400 without post-commit audit logging', async () => {
    const members = repository();
    members.update.mockRejectedValue(new MemberRoleNotFoundError());
    const audits = audit();

    await expect(
      new MemberService(members, audits).update(user, 'target-1', {
        status: 'INACTIVE',
        roleCodes: ['SUPERVISOR', 'ROLE_MISSING'],
      }),
    ).rejects.toMatchObject({
      status: 400,
      response: { code: 'MEMBER_ROLE_NOT_FOUND' },
    });
    expect(audits.log.mock.calls).toHaveLength(0);
  });

  it('passes prepared mandatory audit context to the repository transaction', async () => {
    const members = repository();
    const saved = { id: 'target-1' } as unknown as Awaited<ReturnType<MemberRepository['update']>>;
    members.update.mockResolvedValue(saved);
    const audits = audit();

    await expect(
      new MemberService(members, audits).update(user, 'target-1', {
        roleCodes: ['SUPERVISOR'],
      }),
    ).resolves.toBe(saved);
    expect(members.update.mock.calls[0]?.[0]).toMatchObject({
      shopId: user.shopId,
      memberId: 'target-1',
      audit: {
        action: 'UPDATE',
        entityType: 'shop_member',
        entityId: 'target-1',
        actorUserId: user.userId,
        actorMemberId: user.memberId,
        newValues: { roleCodes: ['SUPERVISOR'] },
      },
    });
    expect(audits.log.mock.calls).toHaveLength(0);
  });

  it('rejects an internal empty role replacement before persistence', async () => {
    const members = repository();
    await expect(
      new MemberService(members, audit()).update(user, 'target-1', {
        roleCodes: [],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(members.update).not.toHaveBeenCalled();
  });
});
