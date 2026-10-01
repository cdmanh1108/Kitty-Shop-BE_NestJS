import type { MemberDetails, MemberList } from './member.models';
import type { CreateAuditLogData } from '@modules/audit/domain/audit.repository';
export const MEMBER_REPOSITORY = Symbol('MEMBER_REPOSITORY');

export class MemberRoleNotFoundError extends Error {
  constructor() {
    super('Một hoặc nhiều vai trò không tồn tại trong cửa hàng này.');
  }
}

export class MemberRoleCodesEmptyError extends Error {
  constructor() {
    super('Cần có ít nhất một mã vai trò khi thay thế vai trò của thành viên.');
  }
}

export interface MemberRepository {
  list(shopId: string): Promise<MemberList>;
  roles(shopId: string): Promise<Array<{ id: string; code: string; name: string }>>;
  membershipExists(shopId: string, email: string): Promise<boolean>;
  create(input: MemberCreateData): Promise<MemberDetails>;
  update(input: MemberUpdateData): Promise<MemberDetails>;
}

export interface MemberCreateData {
  shopId: string;
  email: string;
  fullName: string;
  passwordHash: string;
  employeeCode?: string;
  roleCodes: string[];
}

export interface MemberUpdateData {
  shopId: string;
  memberId: string;
  status?: string;
  roleCodes?: string[];
  /** Prepared by the application layer and persisted with the member mutation. */
  audit: CreateAuditLogData;
}
