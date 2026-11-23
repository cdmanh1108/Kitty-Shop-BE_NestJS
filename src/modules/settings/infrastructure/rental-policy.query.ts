import type { Prisma } from '@prisma/client';
import { RENTAL_POLICY_SETTING_KEY, type PersistedRentalPolicy } from '../domain/rental-policy';

export async function readRentalPolicySetting(
  db: Pick<Prisma.TransactionClient, 'appSetting'>,
  shopId: string,
) {
  const row = await db.appSetting.findUnique({
    where: { shopId_key: { shopId, key: RENTAL_POLICY_SETTING_KEY } },
    select: { value: true, updatedAt: true },
  });
  return row
    ? { policy: row.value as unknown as PersistedRentalPolicy, updatedAt: row.updatedAt }
    : null;
}
