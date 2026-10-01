import { currentRequestMetadata } from '@common/request-context/request-context';
import {
  APPLICATION_LOGGER,
  silentApplicationLog,
  type ApplicationLog,
  type ApplicationLoggerFactory,
} from '@common/logging/application-logger.port';
import type { AuditPort, AuditEntry } from '../domain/audit.port';
import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  AUDIT_REPOSITORY,
  type AuditRepository,
  type CreateAuditLogData,
} from '../domain/audit.repository';
import { prepareAuditLogData } from './audit-entry-preparer';

export type AuditContext = Pick<
  CreateAuditLogData,
  | 'shopId'
  | 'actorUserId'
  | 'actorMemberId'
  | 'actorWebAccountId'
  | 'requestId'
  | 'ipAddress'
  | 'userAgent'
>;

@Injectable()
export class AuditService implements AuditPort {
  private readonly logger: ApplicationLog;

  constructor(
    @Inject(AUDIT_REPOSITORY) private readonly repository: AuditRepository,
    @Optional() @Inject(APPLICATION_LOGGER) loggerFactory?: ApplicationLoggerFactory,
  ) {
    this.logger = loggerFactory?.create(AuditService.name) ?? silentApplicationLog;
  }

  /**
   * Audit logging is deliberately best-effort at the application boundary.
   * Critical domain events are also persisted through the transactional outbox.
   */
  async log(input: AuditEntry): Promise<void> {
    let requestId: string | undefined;
    try {
      const prepared = prepareAuditLogData(input);
      requestId = prepared.requestId;
      await this.repository.create(prepared);
    } catch (error) {
      this.logger.error({
        event: 'audit.persist.failed',
        action: input.action,
        entityId: input.entityId,
        shopId: input.shopId,
        requestId: requestId ?? currentRequestMetadata()?.requestId,
        error: error instanceof Error ? error : new Error('Lỗi không xác định.'),
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
