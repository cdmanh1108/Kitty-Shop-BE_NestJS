import type { JsonValue } from '@common/types/json';
import type { AuditSnapshot } from '../domain/audit.repository';

const sensitiveKey =
  /password|secret|token|authorization|cookie|credential|database.?url|headers|requestBody/i;
function sanitizeValue(value: JsonValue | undefined, depth: number): JsonValue | undefined {
  if (depth > 6) return '[Truncated]';
  if (typeof value === 'string') return sanitizeAuditText(value);
  if (Array.isArray(value))
    return value.slice(0, 100).map((item) => sanitizeValue(item, depth + 1) ?? null);
  if (value && typeof value === 'object') return sanitizeObject(value, depth + 1);
  return value;
}
function sanitizeObject(value: AuditSnapshot, depth: number): AuditSnapshot {
  return Object.fromEntries(
    Object.entries(value)
      .slice(0, 100)
      .map(([key, item]) => [
        key,
        sensitiveKey.test(key) ? '[Redacted]' : sanitizeValue(item, depth),
      ]),
  );
}
export function sanitizeAuditSnapshot(value: AuditSnapshot | undefined): AuditSnapshot | undefined {
  return value === undefined ? undefined : sanitizeObject(value, 0);
}

export function sanitizeAuditText(value: string): string {
  return value
    .replace(/Bearer\s+[^\s]+/gi, 'Bearer [Redacted]')
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[Redacted]')
    .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi, '$1[Redacted]@')
    .replace(
      /([?&](?:[^=&#\s]*(?:token|secret|password|credential|api[_-]?key)[^=&#\s]*)=)[^&#\s]*/gi,
      '$1[Redacted]',
    )
    .slice(0, 4096);
}
