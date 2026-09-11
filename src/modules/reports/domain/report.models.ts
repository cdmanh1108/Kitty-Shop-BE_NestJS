export interface RevenueReportRow {
  day: Date;
  revenue: string;
  expense: string;
  profit: string;
}
export interface ProductPerformanceRow {
  id: string;
  code: string;
  name: string;
  rentalCount: number;
  bookedRevenue: string;
}
export interface CustomerPerformanceRow {
  id: string;
  customerCode: string;
  fullName: string;
  phone: string;
  rentalCount: number;
  bookedValue: string;
}
