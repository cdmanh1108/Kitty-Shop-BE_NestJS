import type { CustomerAddressRecord, CustomerRecord } from '@modules/customers/domain/customers.records';

export type CustomerDetails =
  | null
  | (Pick<CustomerRecord, 'id' | 'customerCode' | 'fullName' | 'phone' | 'facebook' | 'zalo'> & {
      stats: {
        completedRentalCount: number;
        totalPaid: number;
        depositHeld: number;
        lastRentalAt: Date | null;
      };
      notes: Array<{ id: string; content: string; createdAt: Date }>;
      addresses: Array<Pick<CustomerAddressRecord, 'id' | 'addressLine' | 'isDefault'>>;
    });

export type CustomerAddressResult = null | CustomerAddressRecord;
