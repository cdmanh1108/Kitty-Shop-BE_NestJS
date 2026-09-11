import type { PaginatedResult } from '@common/types/pagination';
import type { AuditLogRecord } from '@modules/audit/domain/audit.records';

export type AuditLogPage = PaginatedResult<AuditLogRecord>;
