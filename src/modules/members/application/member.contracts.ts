export interface CreateMemberInput {
  email: string;
  fullName: string;
  password: string;
  employeeCode?: string;
  roleCodes: Array<string>;
}

export interface UpdateMemberInput {
  status?: string;
  roleCodes?: Array<string>;
}
