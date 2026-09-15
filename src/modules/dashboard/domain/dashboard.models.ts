import type { RentalStatus } from '@modules/rentals/domain/rental-status';
export type DashboardRental = {
  id: string;
  code: string;
  customerName: string;
  pickupDate: string;
  status: RentalStatus;
  itemCount: number;
};
export type DashboardAttention = {
  id: string;
  code: string;
  customerName: string;
  returnDate: string;
  status: RentalStatus;
  outstandingAmount: number;
  type: 'OVERDUE' | 'RETURN_SETTLEMENT' | 'OUTSTANDING';
};
export type DashboardSummary = {
  revenueToday: number;
  revenueMonth: number;
  ordersToday: number;
  rentingProducts: number;
  outstandingAmount: number;
  upcomingOrders: DashboardRental[];
  attentionOrders: DashboardAttention[];
  revenueSeries: Array<{ date: string; revenue: number }>;
};
