import type { JsonValue } from '@common/types/json';

export interface AuditLogRecord {
  id: string;
  shopId: string;
  actorUserId: string | null;
  actorMemberId: string | null;
  actorWebAccountId: string | null;
  /** Current shop member display name, not a historical identity snapshot. */
  actorDisplayName?: string | null;
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
