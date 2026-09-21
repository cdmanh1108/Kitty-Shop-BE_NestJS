import type { CurrentUser } from '@common/types/current-user';
import { prepareAuditLogData } from '@modules/audit/application/audit-entry-preparer';
import { AUDIT_PORT, type AuditPort } from '@modules/audit/domain/audit.port';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { hash } from 'bcryptjs';
import {
  MEMBER_REPOSITORY,
  MemberRoleCodesEmptyError,
  MemberRoleNotFoundError,
  type MemberRepository,
} from '../domain/member.repository';
import type { CreateMemberInput, UpdateMemberInput } from './member.contracts';

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
      throw new ConflictException('Email này đã được sử dụng bởi một thành viên của cửa hàng.');
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
    if (!member) throw new BadRequestException('Một hoặc nhiều vai trò không tồn tại.');
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
      throw new BadRequestException(
        'Bạn không thể vô hiệu hóa tư cách thành viên hiện tại của chính mình.',
      );
    }
    if (input.roleCodes?.length === 0) {
      throw new BadRequestException({
        code: 'MEMBER_ROLE_CODES_EMPTY',
        message: 'Danh sách mã vai trò phải có ít nhất một phần tử.',
      });
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
        throw new BadRequestException({
          code: 'MEMBER_ROLE_CODES_EMPTY',
          message: 'Danh sách mã vai trò phải có ít nhất một phần tử.',
        });
      }
      if (error instanceof MemberRoleNotFoundError) {
        throw new BadRequestException({
          code: 'MEMBER_ROLE_NOT_FOUND',
          message: error.message,
        });
      }
      throw error;
    }
    if (!member) throw new NotFoundException('Không tìm thấy thành viên hoặc vai trò.');
    return member;
  }
}
