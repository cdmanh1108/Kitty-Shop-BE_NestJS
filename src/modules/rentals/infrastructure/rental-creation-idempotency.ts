import type { IdempotencyRecordClient } from '@database/prisma/idempotency';
import { completeIdempotencyClaim, lockIdempotencyClaim } from '@database/prisma/idempotency';
import { RentalClaimLostError } from '../domain/rental-errors';
import type { RentalOrderDetails } from '../domain/rental.models';
import type { CreateRentalOrderData } from '../domain/ports/rental-creation.port';
import { toWebRentalCreateResult } from '../domain/web-rental-create-result';
import type { Prisma } from '@prisma/client';

type RentalClaim = NonNullable<CreateRentalOrderData['idempotency']>;

export async function lockRentalCreationClaim(
  tx: IdempotencyRecordClient,
  shopId: string,
  claim: RentalClaim,
): Promise<void> {
  if (!(await lockIdempotencyClaim(tx, shopId, claim))) throw new RentalClaimLostError();
}

/** Stores Rental's replay representation with the booking transaction. */
export async function completeRentalCreationClaim(
  tx: IdempotencyRecordClient,
  shopId: string,
  claim: RentalClaim,
  result: RentalOrderDetails,
): Promise<void> {
  if (!result) throw new RentalClaimLostError();
  const webResult = toWebRentalCreateResult(result);
  const responseBody: Prisma.InputJsonValue =
    claim.responseFormat === 'WEB_RENTAL_ORDER_CREATE_V1'
      ? ({
          version: 1,
          kind: 'web-rental-order-create',
          result: {
            orderCode: webResult.orderCode,
            totalAmount: webResult.totalAmount,
            depositAmount: webResult.depositAmount,
            status: webResult.status,
            paymentStatus: webResult.paymentStatus,
          },
        } satisfies Prisma.InputJsonObject)
      : (JSON.parse(JSON.stringify(result)) as Prisma.InputJsonValue);
  const completed = await completeIdempotencyClaim(tx, {
    shopId,
    ...claim,
    responseCode: 201,
    responseBody,
    completedAt: new Date(),
  });
  if (!completed) throw new RentalClaimLostError();
}
