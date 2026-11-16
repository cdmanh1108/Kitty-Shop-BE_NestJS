import type { JsonValue } from '@common/types/json';

export type FinanceIdempotencyClaim =
  | { state: 'CLAIMED'; claimId: string }
  | { state: 'IN_PROGRESS' }
  | { state: 'HASH_MISMATCH' }
  | { state: 'COMPLETED'; responseBody: JsonValue };

export interface FinanceClaimIdempotencyData {
  shopId: string;
  scope: string;
  key: string;
  requestHash: string;
  expiresAt: Date;
}

export interface FinanceIdempotencyOwner {
  scope: string;
  key: string;
  claimId: string;
}
