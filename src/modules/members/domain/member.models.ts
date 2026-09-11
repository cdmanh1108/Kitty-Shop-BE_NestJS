import type {
  MemberRoleRecord,
  RoleRecord,
  ShopMemberRecord,
} from '@modules/members/domain/members.records';

export type MemberList = Array<
  ShopMemberRecord & {
    user: {
      phone: null | string;
      status: string;
      fullName: string;
      email: null | string;
      lastLoginAt: null | Date;
    };
    memberRoles: Array<
      MemberRoleRecord & {
        role: {
          id: string;
          name: string;
          code: string;
        };
      }
    >;
  }
>;

export type MemberDetails =
  | null
  | (ShopMemberRecord & {
      user: {
        fullName: string;
        email: null | string;
      };
      memberRoles: Array<
        MemberRoleRecord & {
          role: RoleRecord;
        }
      >;
    });
