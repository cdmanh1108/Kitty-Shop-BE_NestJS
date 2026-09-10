export const MEMBER_REPOSITORY = Symbol('MEMBER_REPOSITORY');

export interface MemberRepository {
  list(shopId: string): Promise<unknown[]>;
  roles(shopId: string): Promise<Array<{ id: string; code: string; name: string }>>;
  membershipExists(shopId: string, email: string): Promise<boolean>;
  create(input: { shopId: string; email: string; fullName: string; passwordHash: string; employeeCode?: string; roleCodes: string[] }): Promise<unknown | null>;
  update(input: { shopId: string; memberId: string; status?: string; roleCodes?: string[] }): Promise<unknown | null>;
}
