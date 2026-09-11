export interface ShopMemberRecord {
  id: string;
  shopId: string;
  userId: string;
  employeeCode: string | null;
  displayName: string;
  status: string;
  joinedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface MemberRoleRecord {
  memberId: string;
  roleId: string;
  assignedAt: Date;
}

export interface RoleRecord {
  id: string;
  shopId: string | null;
  code: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
}
