import type { CurrentUser } from '@common/types/current-user';
import { prepareAuditLogData } from '@modules/audit/application/audit-entry-preparer';
import { AUDIT_PORT, type AuditPort } from '@modules/audit/domain/audit.port';
import { Inject, Injectable } from '@nestjs/common';
import { hash } from 'bcryptjs';
import {
  MEMBER_REPOSITORY,
  MemberRoleCodesEmptyError,
  MemberRoleNotFoundError,
  type MemberRepository,
} from '../domain/member.repository';
import type { CreateMemberInput, UpdateMemberInput } from './member.contracts';
import {
  MemberEmailAlreadyUsedError,
  MemberNotFoundError,
  MemberRoleSelectionError,
  MemberSelfDeactivationError,
} from './member.errors';

@Injectable()
export class MemberService {
  constructor(
    @Inject(MEMBER_REPOSITORY) private readonly repository: MemberRepository,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
  ) {}

  list(user: CurrentUser) {
    return this.repository.list(user.shopId);
  }
  roles(user: CurrentUser) {
    return this.repository.roles(user.shopId);
  }

  async create(user: CurrentUser, input: CreateMemberInput) {
    if (await this.repository.membershipExists(user.shopId, input.email)) {
      throw new MemberEmailAlreadyUsedError();
    }
    const passwordHash = await hash(input.password, 12);
    const member = await this.repository.create({
      shopId: user.shopId,
      email: input.email,
      fullName: input.fullName,
      passwordHash,
      employeeCode: input.employeeCode,
      roleCodes: input.roleCodes,
    });
    if (!member) throw new MemberRoleSelectionError();
    await this.audit.log({
      shopId: user.shopId,
      actorUserId: user.userId,
      actorMemberId: user.memberId,
      action: 'CREATE',
      entityType: 'shop_member',
      entityId: member?.id,
      newValues: { email: input.email, roleCodes: input.roleCodes },
    });
    return member;
  }

  async update(user: CurrentUser, id: string, input: UpdateMemberInput) {
    if (id === user.memberId && input.status === 'INACTIVE') {
      throw new MemberSelfDeactivationError();
    }
    if (input.roleCodes?.length === 0) {
      throw new MemberRoleSelectionError(
        'Danh sách mã vai trò phải có ít nhất một phần tử.',
        'MEMBER_ROLE_CODES_EMPTY',
      );
    }
    let member: Awaited<ReturnType<MemberRepository['update']>>;
    try {
      member = await this.repository.update({
        shopId: user.shopId,
        memberId: id,
        ...input,
        audit: prepareAuditLogData({
          shopId: user.shopId,
          actorUserId: user.userId,
          actorMemberId: user.memberId,
          action: 'UPDATE',
          entityType: 'shop_member',
          entityId: id,
          newValues: { ...input },
        }),
      });
    } catch (error) {
      if (error instanceof MemberRoleCodesEmptyError) {
        throw new MemberRoleSelectionError(
          'Danh sách mã vai trò phải có ít nhất một phần tử.',
          'MEMBER_ROLE_CODES_EMPTY',
        );
      }
      if (error instanceof MemberRoleNotFoundError) {
        throw new MemberRoleSelectionError(error.message, 'MEMBER_ROLE_NOT_FOUND');
      }
      throw error;
    }
    if (!member) throw new MemberNotFoundError();
    return member;
  }
}
