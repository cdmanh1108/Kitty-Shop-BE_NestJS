import { currentRequestMetadata } from '@common/request-context/request-context';
import type { AuditPort, AuditEntry } from '../domain/audit.port';
import { sanitizeAuditSnapshot, sanitizeAuditText } from './audit-snapshot';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  AUDIT_REPOSITORY,
  type AuditRepository,
  type CreateAuditLogData,
} from '../domain/audit.repository';

export type AuditContext = Pick<
  CreateAuditLogData,
  'shopId' | 'actorUserId' | 'actorMemberId' | 'requestId' | 'ipAddress' | 'userAgent'
>;

@Injectable()
export class AuditService implements AuditPort {
  private readonly logger = new Logger(AuditService.name);

  constructor(@Inject(AUDIT_REPOSITORY) private readonly repository: AuditRepository) {}

  /**
   * Audit logging is deliberately best-effort at the application boundary.
   * Critical domain events are also persisted through the transactional outbox.
   */
  async log(input: AuditEntry): Promise<void> {
    try {
      const metadata = currentRequestMetadata();
      await this.repository.create({
        ...input,
        requestId: metadata?.requestId,
        ipAddress: metadata?.ipAddress,
        userAgent: metadata?.userAgent
          ? sanitizeAuditText(metadata.userAgent).slice(0, 512)
          : undefined,
        oldValues: sanitizeAuditSnapshot(input.oldValues),
        newValues: sanitizeAuditSnapshot(input.newValues),
      });
    } catch (error) {
      this.logger.error({
        event: 'audit.persist.failed',
        action: input.action,
        entityId: input.entityId,
        shopId: input.shopId,
        requestId: currentRequestMetadata()?.requestId,
        error: error instanceof Error ? error : new Error('Unknown exception'),
      });
    }
  }

  list(input: {
    shopId: string;
    page: number;
    limit: number;
    entityType?: string;
    entityId?: string;
  }) {
    return this.repository.list(input);
  }
}
