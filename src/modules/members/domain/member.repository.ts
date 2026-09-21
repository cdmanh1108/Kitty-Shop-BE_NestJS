import type { MemberDetails, MemberList } from './member.models';
import type { CreateAuditLogData } from '@modules/audit/domain/audit.repository';
export const MEMBER_REPOSITORY = Symbol('MEMBER_REPOSITORY');

export class MemberRoleNotFoundError extends Error {
  constructor() {
    super('One or more roles do not exist in this shop.');
  }
}

export class MemberRoleCodesEmptyError extends Error {
  constructor() {
    super('At least one role code is required when replacing member roles.');
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
