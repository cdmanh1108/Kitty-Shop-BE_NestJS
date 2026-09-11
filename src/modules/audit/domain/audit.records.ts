import type { JsonValue } from '@common/types/json';

export interface AuditLogRecord {
  id: string;
  shopId: string;
  actorUserId: string | null;
  actorMemberId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  oldValues: JsonValue | null;
  newValues: JsonValue | null;
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
  createdAt: Date;
}
