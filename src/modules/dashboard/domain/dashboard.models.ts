import type { RentalOrderRecord } from '@modules/rentals/domain/rentals.records';

export type DashboardSummary = {
  revenue: {
    today: number;
    month: number;
  };
  ordersToday: number;
  currentlyRented: number;
  dueToday: number;
  overdue: number;
  pendingReminders: number;
  inventory: { [key: string]: number };
  upcoming: Array<
    RentalOrderRecord & {
      customer: {
        phone: string;
        fullName: string;
      };
      items: Array<{
        quantity: number;
        productNameSnapshot: string;
        variantNameSnapshot: string;
      }>;
    }
  >;
};
