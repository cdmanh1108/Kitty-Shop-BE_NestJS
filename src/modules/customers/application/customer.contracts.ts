import type { PaginationParams } from '@common/types/pagination';
export interface AddCustomerNoteInput {
  content: string;
  isPinned: boolean;
}

export interface CustomerAddressInput {
  label?: string;
  recipientName?: string;
  phone?: string;
  addressLine: string;
  ward?: string;
  district?: string;
  city?: string;
  province?: string;
  isDefault: boolean;
}

export interface UpdateCustomerAddressInput {
  label?: string;
  recipientName?: string;
  phone?: string;
  addressLine?: string;
  ward?: string;
  district?: string;
  city?: string;
  province?: string;
  isDefault?: boolean;
}

export interface CreateCustomerInput {
  fullName: string;
  phone: string;
  email?: string;
  facebook?: string;
  zalo?: string;
  birthday?: string;
  gender?: string;
  customerType?: string;
  source?: string;
}

export interface CustomerListQuery extends PaginationParams {
  search?: string;
  status?: string;
  customerType?: string;
}

export interface UpdateCustomerInput {
  status?: string;
  fullName?: string;
  phone?: string;
  email?: string;
  facebook?: string;
  zalo?: string;
  birthday?: string;
  gender?: string;
  customerType?: string;
  source?: string;
}
