import { currentRequestMetadata } from '@common/request-context/request-context';
import type { Clock } from '@common/clock/clock';
import type { JsonValue } from '@common/types/json';
import { Logger } from '@nestjs/common';
import { Prisma, type IdempotencyRecord } from '@prisma/client';
import { randomUUID } from 'node:crypto';

// Processing lease is independent of the caller's replay-retention deadline.
export const IDEMPOTENCY_CLAIM_LEASE_MS = 5 * 60 * 1000;
const CLAIM_ATTEMPTS = 3;
const logger = new Logger('IdempotencyStore');

/** Narrow Prisma projection used by the shared idempotency-record adapter. */
export type IdempotencyRecordClient = {
  idempotencyRecord: {
    create(args: Prisma.IdempotencyRecordCreateArgs): Promise<{ id: string }>;
    findUnique(
      args: Prisma.IdempotencyRecordFindUniqueArgs,
    ): Promise<Pick<
      IdempotencyRecord,
      'id' | 'createdAt' | 'requestHash' | 'responseBody' | 'completedAt'
    > | null>;
    updateMany(args: Prisma.IdempotencyRecordUpdateManyArgs): Promise<Prisma.BatchPayload>;
    deleteMany(args: Prisma.IdempotencyRecordDeleteManyArgs): Promise<Prisma.BatchPayload>;
  };
};

export interface IdempotencyClaimInput {
  shopId: string;
  scope: string;
  key: string;
  requestHash: string;
  expiresAt: Date;
}

export interface IdempotencyClaimOwner {
  scope: string;
  key: string;
  claimId: string;
}

export type IdempotencyClaimResult =
  | { state: 'CLAIMED'; claimId: string }
  | { state: 'IN_PROGRESS' }
  | { state: 'HASH_MISMATCH' }
  | { state: 'COMPLETED'; responseBody: JsonValue };

export async function claimIdempotencyRecord(
  prisma: IdempotencyRecordClient,
  clock: Clock,
  input: IdempotencyClaimInput,
): Promise<IdempotencyClaimResult> {
  // Bounded contention retry; never recurse indefinitely when another claimant changes a row.
  for (let attempt = 0; attempt < CLAIM_ATTEMPTS; attempt += 1) {
    const now = clock.now();
    const staleBefore = new Date(now.getTime() - IDEMPOTENCY_CLAIM_LEASE_MS);
    await prisma.idempotencyRecord.deleteMany({
      where: {
        shopId: input.shopId,
        scope: input.scope,
        key: input.key,
        expiresAt: { lte: now },
      },
    });

    try {
      const claimId = randomUUID();
      await prisma.idempotencyRecord.create({ data: { ...input, id: claimId, createdAt: now } });
      return { state: 'CLAIMED', claimId };
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002')
        throw error;
    }

    const existing = await prisma.idempotencyRecord.findUnique({
      where: { shopId_scope_key: { shopId: input.shopId, scope: input.scope, key: input.key } },
      select: {
        id: true,
        createdAt: true,
        requestHash: true,
        responseBody: true,
        completedAt: true,
      },
    });
    if (!existing) continue;
    if (existing.requestHash !== input.requestHash) return { state: 'HASH_MISMATCH' };
    if (existing.completedAt)
      return {
        state: 'COMPLETED',
        responseBody: existing.responseBody as JsonValue,
      };
    if (existing.createdAt > staleBefore) return { state: 'IN_PROGRESS' };

    const claimId = randomUUID();
    // Rotating the row ID fences every lease without a schema change. Recovery
    // contends with the row lock held throughout an executing business transaction.
    const recovered = await prisma.idempotencyRecord.updateMany({
      where: {
        id: existing.id,
        shopId: input.shopId,
        scope: input.scope,
        key: input.key,
        requestHash: input.requestHash,
        completedAt: null,
        createdAt: { lte: staleBefore },
      },
      data: { id: claimId, createdAt: now, expiresAt: input.expiresAt },
    });
    if (recovered.count === 1) {
      logger.warn({
        event: 'idempotency.claim.recovered',
        shopId: input.shopId,
        requestId: currentRequestMetadata()?.requestId,
      });
      return { state: 'CLAIMED', claimId };
    }
  }
  return { state: 'IN_PROGRESS' };
}

/**
 * Conditionally updates the ownership row inside the caller's transaction.
 * Pass the same transaction client used for every protected business write.
 */
export async function lockIdempotencyClaim(
  tx: IdempotencyRecordClient,
  shopId: string,
  claim: IdempotencyClaimOwner,
): Promise<boolean> {
  // An UPDATE acquires the PostgreSQL row lock until transaction end. A SELECT
  // would let stale recovery replace the token before business writes complete.
  const locked = await tx.idempotencyRecord.updateMany({
    where: { id: claim.claimId, shopId, scope: claim.scope, key: claim.key, completedAt: null },
    data: { id: claim.claimId },
  });
  return locked.count === 1;
}

/** Completes the claim atomically with the caller's business transaction. */
export async function completeIdempotencyClaim(
  tx: IdempotencyRecordClient,
  input: IdempotencyClaimOwner & {
    shopId: string;
    responseCode: number;
    responseBody: Prisma.InputJsonValue;
    completedAt: Date;
  },
): Promise<boolean> {
  const completed = await tx.idempotencyRecord.updateMany({
    where: {
      id: input.claimId,
      shopId: input.shopId,
      scope: input.scope,
      key: input.key,
      completedAt: null,
    },
    data: {
      responseCode: input.responseCode,
      responseBody: input.responseBody,
      completedAt: input.completedAt,
    },
  });
  return completed.count === 1;
}

/** Deletes only the caller's incomplete claim; stale owners cannot delete successors. */
export async function releaseIdempotencyClaim(
  prisma: IdempotencyRecordClient,
  shopId: string,
  scope: string,
  key: string,
  claimId: string,
): Promise<void> {
  await prisma.idempotencyRecord.deleteMany({
    where: { id: claimId, shopId, scope, key, completedAt: null },
  });
}
