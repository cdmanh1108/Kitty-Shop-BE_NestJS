import type { JsonValue } from '@common/types/json';
import type { AuditLogPage } from './audit.models';
export type AuditSnapshot = { [key: string]: JsonValue | undefined };

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
  oldValues?: AuditSnapshot;
  newValues?: AuditSnapshot;
}

export const AUDIT_REPOSITORY = Symbol('AUDIT_REPOSITORY');

export interface AuditRepository {
  create(input: CreateAuditLogData): Promise<void>;
  list(input: AuditListCriteria): Promise<AuditLogPage>;
}

export interface AuditListCriteria {
  shopId: string;
  page: number;
  limit: number;
  entityType?: string;
  entityId?: string;
}
