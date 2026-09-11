import type { CreateAuditLogData } from './audit.repository';

export type AuditEntry = Omit<CreateAuditLogData, 'requestId' | 'ipAddress' | 'userAgent'>;
export const AUDIT_PORT = Symbol('AUDIT_PORT');
/** Best-effort, awaited operational audit. Failures are logged and do not reject mutations. */
export interface AuditPort {
  log(entry: AuditEntry): Promise<void>;
}
