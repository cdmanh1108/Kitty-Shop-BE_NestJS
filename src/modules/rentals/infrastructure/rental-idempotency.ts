import { currentRequestMetadata } from '@common/request-context/request-context';
import type { Clock } from '@common/clock/clock';
import type { JsonSerialized } from '@common/types/json';
import { Logger } from '@nestjs/common';
import { Prisma, type IdempotencyRecord } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { RentalClaimLostError } from '../domain/rental-errors';
import type { RentalOrderDetails } from '../domain/rental.models';
import type { CreateRentalOrderData, RentalRepository } from '../domain/rental.repository';

// Processing lease is independent of the caller's existing 24-hour replay retention.
export const RENTAL_CLAIM_LEASE_MS = 5 * 60 * 1000;
const logger = new Logger('RentalIdempotency');
// Infrastructure-local projection of only the Prisma operations/results this boundary uses.
// Both PrismaService and the caller's TransactionClient satisfy it; no client is created here.
type RentalIdempotencyClient = {
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
type RentalClaim = NonNullable<CreateRentalOrderData['idempotency']>;

export async function claimIdempotency(
  prisma: RentalIdempotencyClient,
  clock: Clock,
  input: Parameters<RentalRepository['claimIdempotency']>[0],
): ReturnType<RentalRepository['claimIdempotency']> {
  // Bounded contention retry; never recurse indefinitely when another claimant changes a row.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const now = clock.now();
    const staleBefore = new Date(now.getTime() - RENTAL_CLAIM_LEASE_MS);
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
        // This scope stores only the serialized rental detail in its business transaction.
        responseBody: existing.responseBody as JsonSerialized<RentalOrderDetails>,
      };
    if (existing.createdAt > staleBefore) return { state: 'IN_PROGRESS' };

    const claimId = randomUUID();
    // No table references this ID. Rotating it gives every lease a distinct fencing token
    // without a schema change. A stale process cannot execute or release its successor.
    // This UPDATE contends with the row lock held throughout an executing booking.
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
        event: 'rental.idempotency.recovered',
        shopId: input.shopId,
        requestId: currentRequestMetadata()?.requestId,
      });
      return { state: 'CLAIMED', claimId };
    }
  }
  return { state: 'IN_PROGRESS' };
}

export async function lockRentalClaim(
  tx: RentalIdempotencyClient,
  shopId: string,
  claim: RentalClaim,
): Promise<void> {
  // An actual conditional UPDATE acquires the PostgreSQL row lock until transaction end.
  // Merely SELECTing the token would allow recovery between validation and business writes.
  const locked = await tx.idempotencyRecord.updateMany({
    where: { id: claim.claimId, shopId, scope: claim.scope, key: claim.key, completedAt: null },
    data: { id: claim.claimId },
  });
  if (locked.count !== 1) throw new RentalClaimLostError();
}

export async function completeRentalClaim(
  tx: RentalIdempotencyClient,
  shopId: string,
  claim: RentalClaim,
  result: RentalOrderDetails,
): Promise<void> {
  const completed = await tx.idempotencyRecord.updateMany({
    where: { id: claim.claimId, shopId, scope: claim.scope, key: claim.key, completedAt: null },
    data: {
      responseCode: 201,
      responseBody: JSON.parse(JSON.stringify(result)) as Prisma.InputJsonValue,
      completedAt: new Date(),
    },
  });
  if (completed.count !== 1) throw new RentalClaimLostError();
}

export async function releaseIdempotency(
  prisma: RentalIdempotencyClient,
  shopId: string,
  scope: string,
  key: string,
  claimId: string,
): Promise<void> {
  await prisma.idempotencyRecord.deleteMany({
    where: { id: claimId, shopId, scope, key, completedAt: null },
  });
}
