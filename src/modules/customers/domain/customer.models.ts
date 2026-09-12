import type { DecimalValue } from '@common/types/decimal';
import type {
  CustomerAddressRecord,
  CustomerNoteRecord,
  CustomerRecord,
} from '@modules/customers/domain/customers.records';

export type CustomerDetails =
  | null
  | (CustomerRecord & {
      tags: Array<{
        id: string;
        shopId: string;
        createdAt: Date;
        name: string;
        color: null | string;
      }>;
      stats: {
        totalOrders: number;
        completedRentalCount: number;
        totalPaid: number;
        depositHeld: number;
        lastRentalAt: Date | null;
      };
      recentOrders: Array<{
        id: string;
        status: string;
        orderNumber: string;
        rentalStartAt: Date;
        rentalEndAt: Date;
        paymentStatus: string;
        grandTotal: DecimalValue;
      }>;
      notes: Array<CustomerNoteRecord>;
      addresses: Array<CustomerAddressRecord>;
    });

export type CustomerAddressResult = null | CustomerAddressRecord;
