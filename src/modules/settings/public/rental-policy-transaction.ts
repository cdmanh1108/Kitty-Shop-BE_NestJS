import type { Prisma } from '@prisma/client';
import { buildEffectiveRentalPolicy, validateRentalPolicy } from '../domain/rental-policy';
import { readRentalPolicySetting } from '../infrastructure/rental-policy.query';

export async function readRentalPolicyInTransaction(tx: Prisma.TransactionClient, shopId: string) {
  const saved = await readRentalPolicySetting(tx, shopId);
  const policy = buildEffectiveRentalPolicy(saved?.policy);
  validateRentalPolicy(policy);
  return policy;
}
