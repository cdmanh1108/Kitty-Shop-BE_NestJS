import type { CurrentUser } from '@common/types/current-user';
import { AuditService } from '@modules/audit/application/audit.service';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { hash } from 'bcryptjs';
import { MEMBER_REPOSITORY, type MemberRepository } from '../domain/member.repository';
import type { CreateMemberInput, UpdateMemberInput } from './member.contracts';

@Injectable()
export class MemberService {
  constructor(
    @Inject(MEMBER_REPOSITORY) private readonly repository: MemberRepository,
    private readonly audit: AuditService,
  ) {}

  list(user: CurrentUser) {
    return this.repository.list(user.shopId);
  }
  roles(user: CurrentUser) {
    return this.repository.roles(user.shopId);
  }

  async create(user: CurrentUser, input: CreateMemberInput) {
    if (await this.repository.membershipExists(user.shopId, input.email)) {
      throw new ConflictException('This email is already a member of the shop');
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
    if (!member) throw new BadRequestException('One or more roles do not exist');
    await this.audit.log({
      shopId: user.shopId,
      actorUserId: user.userId,
      actorMemberId: user.memberId,
      action: 'CREATE',
      entityType: 'shop_member',
      newValues: { email: input.email, roleCodes: input.roleCodes },
    });
    return member;
  }

  async update(user: CurrentUser, id: string, input: UpdateMemberInput) {
    if (id === user.memberId && input.status === 'INACTIVE') {
      throw new BadRequestException('You cannot deactivate your own current membership');
    }
    const member = await this.repository.update({ shopId: user.shopId, memberId: id, ...input });
    if (!member) throw new NotFoundException('Member or role not found');
    await this.audit.log({
      shopId: user.shopId,
      actorUserId: user.userId,
      actorMemberId: user.memberId,
      action: 'UPDATE',
      entityType: 'shop_member',
      entityId: id,
      newValues: { ...input },
    });
    return member;
  }
}
