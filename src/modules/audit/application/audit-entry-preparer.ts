import { currentRequestMetadata } from '@common/request-context/request-context';
import type { AuditEntry } from '../domain/audit.port';
import type { CreateAuditLogData } from '../domain/audit.repository';
import { sanitizeAuditSnapshot, sanitizeAuditText } from './audit-snapshot';

/** Produces persistence-safe audit data independently of delivery semantics. */
export function prepareAuditLogData(input: AuditEntry): CreateAuditLogData {
  const metadata = currentRequestMetadata();
  return {
    ...input,
    requestId: metadata?.requestId,
    ipAddress: metadata?.ipAddress,
    userAgent: metadata?.userAgent
      ? sanitizeAuditText(metadata.userAgent).slice(0, 512)
      : undefined,
    oldValues: sanitizeAuditSnapshot(input.oldValues),
    newValues: sanitizeAuditSnapshot(input.newValues),
  };
}
