import type { AuditLogPage } from '../domain/audit.models';
import type { AuditLogPageResDto } from './dto/audit-log.dto';

export function mapAuditLogPage(page: AuditLogPage): AuditLogPageResDto {
  return {
    items: page.items.map((item) => ({
      ...item,
      actorDisplayName: item.actorDisplayName ?? null,
      createdAt: item.createdAt.toISOString(),
    })),
    meta: page.meta,
  };
}
