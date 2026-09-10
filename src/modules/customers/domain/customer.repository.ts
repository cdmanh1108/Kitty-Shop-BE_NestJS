import type { PaginatedResult } from '@common/dto/pagination.query.dto';

export interface CustomerRecord {
  id: string;
  customerCode: string;
  fullName: string;
  phone: string;
  normalizedPhone: string;
  email: string | null;
  facebook: string | null;
  zalo: string | null;
  birthday: Date | null;
  gender: string | null;
  customerType: string;
  status: string;
  source: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export const CUSTOMER_REPOSITORY = Symbol('CUSTOMER_REPOSITORY');

export interface CustomerRepository {
  list(input: {
    shopId: string;
    page: number;
    limit: number;
    search?: string;
    status?: string;
    customerType?: string;
  }): Promise<PaginatedResult<CustomerRecord>>;
  findById(shopId: string, id: string): Promise<unknown | null>;
  create(shopId: string, input: Omit<CustomerRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<CustomerRecord>;
  update(shopId: string, id: string, input: Partial<Omit<CustomerRecord, 'id' | 'customerCode' | 'createdAt' | 'updatedAt'>>): Promise<CustomerRecord | null>;
  addNote(input: { shopId: string; customerId: string; content: string; isPinned: boolean; createdBy: string }): Promise<unknown>;
  addAddress(input: { shopId: string; customerId: string; label?: string; recipientName?: string; phone?: string; addressLine: string; ward?: string; district?: string; city?: string; province?: string; isDefault: boolean }): Promise<unknown | null>;
  updateAddress(input: { shopId: string; customerId: string; addressId: string; data: { label?: string; recipientName?: string; phone?: string; addressLine?: string; ward?: string; district?: string; city?: string; province?: string; isDefault?: boolean } }): Promise<unknown | null>;
  deleteAddress(shopId: string, customerId: string, addressId: string): Promise<boolean>;

}
