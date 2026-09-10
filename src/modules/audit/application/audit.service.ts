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
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(@Inject(AUDIT_REPOSITORY) private readonly repository: AuditRepository) {}

  /**
   * Audit logging is deliberately best-effort at the application boundary.
   * Critical domain events are also persisted through the transactional outbox.
   */
  async log(input: CreateAuditLogData): Promise<void> {
    try {
      await this.repository.create(input);
    } catch (error) {
      this.logger.error({
        event: 'audit.persist.failed',
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
