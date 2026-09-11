import type { MemberDetails, MemberList } from './member.models';
export const MEMBER_REPOSITORY = Symbol('MEMBER_REPOSITORY');

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
}
