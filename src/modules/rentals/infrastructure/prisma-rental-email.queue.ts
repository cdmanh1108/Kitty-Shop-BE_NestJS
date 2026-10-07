import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@database/prisma/prisma.service';
import type {
  ClaimedRentalEmail,
  RentalEmailMessage,
  RentalEmailQueue,
} from '../domain/rental-email';
import { readRentalEmailSnapshot } from './rental-email.snapshot';

const MAX_ATTEMPTS = 8;
const RETRY_WINDOW_MS = 23 * 60 * 60 * 1000;

@Injectable()
export class PrismaRentalEmailQueue implements RentalEmailQueue {
  constructor(private readonly prisma: PrismaService) {}

  async claimNext(now: Date): Promise<ClaimedRentalEmail | null> {
    // Never resend an ambiguous attempt beyond the provider's 24-hour deduplication window.
    await this.prisma.notificationLog.updateMany({
      where: {
        eventId: { not: null },
        channel: 'EMAIL',
        status: { in: ['PROCESSING', 'RETRY'] },
        OR: [
          { firstAttemptAt: { lte: new Date(now.getTime() - RETRY_WINDOW_MS) } },
          { status: 'PROCESSING', leaseUntil: { lte: now }, attemptCount: { gte: MAX_ATTEMPTS } },
        ],
      },
      data: {
        status: 'UNKNOWN',
        ownerToken: null,
        leaseUntil: null,
        failedAt: now,
        failureReason: 'Cần đối soát kết quả gửi trước khi thử lại.',
      },
    });
    const ownerToken = randomUUID();
    const leaseUntil = new Date(now.getTime() + 60_000);
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      WITH candidate AS (
        SELECT n.id FROM notification_logs n
        WHERE n.event_id IS NOT NULL AND n.channel = 'EMAIL'
          AND n.attempt_count < ${MAX_ATTEMPTS}
          AND ((n.status IN ('PENDING', 'RETRY') AND n.available_at <= ${now})
            OR (n.status = 'PROCESSING' AND n.lease_until <= ${now}))
          AND NOT EXISTS (
            SELECT 1 FROM notification_logs previous
            WHERE previous.order_id = n.order_id AND previous.event_id IS NOT NULL
              AND previous.event_sequence < n.event_sequence
              AND previous.status IN ('PENDING', 'PROCESSING', 'RETRY')
          )
        ORDER BY n.created_at, n.event_sequence, n.id
        LIMIT 1 FOR UPDATE OF n SKIP LOCKED
      )
      UPDATE notification_logs n SET status = 'PROCESSING', owner_token = ${ownerToken}::uuid,
        lease_until = ${leaseUntil}, attempt_count = n.attempt_count + 1,
        first_attempt_at = COALESCE(n.first_attempt_at, ${now})
      FROM candidate WHERE n.id = candidate.id RETURNING n.id
    `;
    const id = rows[0]?.id;
    if (!id) return null;
    const row = await this.prisma.notificationLog.findFirst({
      where: { id, ownerToken, status: 'PROCESSING' },
    });
    if (!row?.recipient) return null;
    return {
      id,
      ownerToken,
      recipient: row.recipient,
      attemptCount: row.attemptCount,
      snapshot: row.payload ? readRentalEmailSnapshot(row.payload) : null,
      message:
        row.fromAddress && row.subject && row.html
          ? {
              from: row.fromAddress,
              to: row.recipient,
              subject: row.subject,
              html: row.html,
              text: row.content,
            }
          : null,
    };
  }

  async prepare(
    claim: ClaimedRentalEmail,
    message: RentalEmailMessage,
    now: Date,
  ): Promise<boolean> {
    const result = await this.prisma.notificationLog.updateMany({
      where: {
        id: claim.id,
        ownerToken: claim.ownerToken,
        status: 'PROCESSING',
        leaseUntil: { gt: now },
      },
      data: {
        fromAddress: message.from,
        subject: message.subject,
        html: message.html,
        content: message.text,
      },
    });
    return result.count === 1;
  }

  async sent(claim: ClaimedRentalEmail, providerMessageId: string, now: Date): Promise<boolean> {
    const result = await this.prisma.notificationLog.updateMany({
      where: {
        id: claim.id,
        ownerToken: claim.ownerToken,
        status: 'PROCESSING',
        leaseUntil: { gt: now },
      },
      data: {
        status: 'SENT',
        providerMessageId,
        sentAt: now,
        ownerToken: null,
        leaseUntil: null,
        failureReason: null,
        failedAt: null,
      },
    });
    return result.count === 1;
  }

  async failed(
    claim: ClaimedRentalEmail,
    reason: string,
    retryable: boolean,
    now: Date,
  ): Promise<void> {
    const retry = retryable && claim.attemptCount < MAX_ATTEMPTS;
    await this.prisma.notificationLog.updateMany({
      where: { id: claim.id, ownerToken: claim.ownerToken, status: 'PROCESSING' },
      data: {
        status: retry ? 'RETRY' : retryable ? 'UNKNOWN' : 'FAILED',
        ownerToken: null,
        leaseUntil: null,
        failureReason: reason,
        failedAt: now,
        availableAt: new Date(
          now.getTime() + Math.min(3_600_000, 30_000 * 2 ** (claim.attemptCount - 1)),
        ),
      },
    });
  }
}
