import type {
  CustomerPerformanceRow,
  ProductPerformanceRow,
  RevenueReportRow,
} from './report.models';
export const REPORT_REPOSITORY = Symbol('REPORT_REPOSITORY');
export interface ReportRepository {
  revenue(input: ReportRevenueData): Promise<RevenueReportRow[]>;
  productPerformance(input: ReportProductPerformanceData): Promise<ProductPerformanceRow[]>;
  customerPerformance(input: ReportCustomerPerformanceData): Promise<CustomerPerformanceRow[]>;
  shopTimezone(shopId: string): Promise<string>;
}

export interface ReportRevenueData {
  shopId: string;
  from: Date;
  until: Date;
  timezone: string;
}

export interface ReportProductPerformanceData {
  shopId: string;
  from: Date;
  until: Date;
  limit: number;
}

export interface ReportCustomerPerformanceData {
  shopId: string;
  from: Date;
  until: Date;
  limit: number;
}
