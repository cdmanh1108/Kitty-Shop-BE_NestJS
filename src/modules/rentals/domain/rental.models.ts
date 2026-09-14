import type { PaginatedResult } from '@common/types/pagination';
import type { RentalConfirmationRecord } from './rental-confirmation';
import type { InventoryItemRecord } from '@modules/catalog/domain/catalog.records';
import type { CustomerRecord } from '@modules/customers/domain/customers.records';
import type { DeliveryJobRecord } from '@modules/deliveries/domain/deliveries.records';
import type { PaymentTransactionRecord } from '@modules/finance/domain/finance.records';
import type {
  RentalItemAllocationRecord,
  RentalOrderChargeRecord,
  RentalOrderItemRecord,
  RentalOrderRecord,
  RentalOrderStatusHistoryRecord,
} from '@modules/rentals/domain/rentals.records';
import type { ShopLocationRecord } from '@modules/settings/domain/settings.records';

import type { RentalReturnRecord, RentalSettlementRecord } from './rental-return';

export type RentalOrderDetails =
  | null
  | (RentalOrderRecord & {
      confirmation: RentalConfirmationRecord | null;
      returnRecord: RentalReturnRecord | null;
      settlement: RentalSettlementRecord | null;
      location: null | ShopLocationRecord;
      statusHistory: Array<RentalOrderStatusHistoryRecord>;
      customer: CustomerRecord;
      items: Array<
        RentalOrderItemRecord & {
          allocations: Array<
            RentalItemAllocationRecord & {
              inventoryItem: InventoryItemRecord;
            }
          >;
        }
      >;
      charges: Array<RentalOrderChargeRecord>;
      payments: Array<PaymentTransactionRecord>;
      deliveries: Array<DeliveryJobRecord>;
    });

export type RentalOrderPage = PaginatedResult<
  Pick<
    RentalOrderRecord,
    | 'id'
    | 'orderNumber'
    | 'customerId'
    | 'rentalStartAt'
    | 'rentalEndAt'
    | 'status'
    | 'paymentStatus'
    | 'depositStatus'
    | 'grandTotal'
  > & {
    customer: {
      id: string;
      phone: string;
      fullName: string;
    };
    itemCount: number;
    productCount: number;
  }
>;
