export const SETTINGS_REPOSITORY = Symbol('SETTINGS_REPOSITORY');
export interface SettingsRepository {
  list(shopId: string): Promise<unknown[]>;
  upsert(input: { shopId: string; key: string; value: unknown; description?: string; updatedBy: string }): Promise<unknown>;
  getShop(shopId: string): Promise<unknown | null>;
  updateShop(input: { shopId: string; name?: string; phone?: string; email?: string; logoUrl?: string; primaryColor?: string; timezone?: string; currency?: string }): Promise<unknown>;
}
