import type { PaginatedResult } from '@common/dto/pagination.query.dto';

export interface CreateAuditLogData {
  shopId: string;
  actorUserId?: string;
  actorMemberId?: string;
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
  action: string;
  entityType: string;
  entityId?: string;
  oldValues?: object;
  newValues?: object;
}

export const AUDIT_REPOSITORY = Symbol('AUDIT_REPOSITORY');

export interface AuditRepository {
  create(input: CreateAuditLogData): Promise<void>;
  list(input: { shopId: string; page: number; limit: number; entityType?: string; entityId?: string }): Promise<PaginatedResult<unknown>>;
}
