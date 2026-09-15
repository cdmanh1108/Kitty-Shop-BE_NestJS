import type { DashboardSummary } from './dashboard.models';
export const DASHBOARD_REPOSITORY = Symbol('DASHBOARD_REPOSITORY');

export interface DashboardRepository {
  getShopTimezone(shopId: string): Promise<string>;
  summary(input: DashboardSummaryData): Promise<DashboardSummary>;
}

export interface DashboardSummaryData {
  shopId: string;
  now: Date;
  dayStart: Date;
  dayEnd: Date;
  monthStart: Date;
  monthEnd: Date;
  timezone: string;
  seriesStart: Date;
  dueSoonEnd: Date;
}
