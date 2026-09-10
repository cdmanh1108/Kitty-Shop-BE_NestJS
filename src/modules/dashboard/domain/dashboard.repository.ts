export const DASHBOARD_REPOSITORY = Symbol('DASHBOARD_REPOSITORY');

export interface DashboardRepository {
  getShopTimezone(shopId: string): Promise<string>;
  summary(input: { shopId: string; now: Date; dayStart: Date; dayEnd: Date; monthStart: Date; monthEnd: Date }): Promise<unknown>;
}
