import type { CustomerNoteRecord } from '@modules/customers/domain/customers.records';
import type { PaginatedResult } from '@common/types/pagination';
import type { CustomerAddressResult, CustomerDetails } from './customer.models';
import type { CustomerRecord } from './customers.records';

export const CUSTOMER_REPOSITORY = Symbol('CUSTOMER_REPOSITORY');

export interface CustomerRepository {
  list(input: CustomerListCriteria): Promise<PaginatedResult<CustomerRecord>>;
  findById(shopId: string, id: string): Promise<CustomerDetails>;
  create(
    shopId: string,
    input: Omit<
      CustomerRecord,
      'id' | 'createdAt' | 'updatedAt' | 'shopId' | 'metadata' | 'archivedAt'
    >,
  ): Promise<CustomerRecord>;
  update(
    shopId: string,
    id: string,
    input: Partial<
      Omit<
        CustomerRecord,
        'id' | 'customerCode' | 'createdAt' | 'updatedAt' | 'shopId' | 'metadata' | 'archivedAt'
      >
    >,
  ): Promise<CustomerRecord | null>;
  addNote(input: CustomerAddNoteData): Promise<CustomerNoteRecord>;
  addAddress(input: CustomerAddAddressData): Promise<CustomerAddressResult>;
  updateAddress(input: CustomerUpdateAddressData): Promise<CustomerAddressResult>;
  deleteAddress(shopId: string, customerId: string, addressId: string): Promise<boolean>;
}

export interface CustomerListCriteria {
  shopId: string;
  page: number;
  limit: number;
  search?: string;
  status?: string;
  customerType?: string;
}

export interface CustomerAddNoteData {
  shopId: string;
  customerId: string;
  content: string;
  isPinned: boolean;
  createdBy: string;
}

export interface CustomerAddAddressData {
  shopId: string;
  customerId: string;
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

export interface CustomerUpdateAddressData {
  shopId: string;
  customerId: string;
  addressId: string;
  data: {
    label?: string;
    recipientName?: string;
    phone?: string;
    addressLine?: string;
    ward?: string;
    district?: string;
    city?: string;
    province?: string;
    isDefault?: boolean;
  };
}
