export const REPORT_REPOSITORY = Symbol('REPORT_REPOSITORY');
export interface ReportRepository {
  revenue(input: { shopId: string; from: Date; until: Date; timezone: string }): Promise<unknown[]>;
  productPerformance(input: { shopId: string; from: Date; until: Date; limit: number }): Promise<unknown[]>;
  customerPerformance(input: { shopId: string; from: Date; until: Date; limit: number }): Promise<unknown[]>;
  shopTimezone(shopId: string): Promise<string>;
}
