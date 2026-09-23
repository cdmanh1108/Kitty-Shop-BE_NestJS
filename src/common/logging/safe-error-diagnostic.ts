import { createHash } from 'node:crypto';

const MAX_FRAMES = 4;
const MAX_STACK_LINES = 32;
const FINGERPRINT_VERSION = 'v1';

export type ErrorCauseCategory =
  | 'abort'
  | 'database'
  | 'dependency'
  | 'network'
  | 'timeout'
  | 'unknown'
  | 'validation';

export interface SafeErrorDiagnostic {
  readonly errorType: string;
  readonly errorCode?: string;
  readonly reason?: string;
  readonly causeCategory?: ErrorCauseCategory;
  readonly causeType?: string;
  readonly causeCode?: string;
  readonly frames?: readonly string[];
  readonly fingerprint: string;
}

const safeErrorCodePattern =
  /^(?:P\d{4}|E(?:CONNREFUSED|TIMEDOUT|CONNRESET|NOTFOUND|PIPE|HOSTUNREACH|AI_AGAIN)|ERR_[A-Z0-9_]{1,48}|ABORT_ERR)$/;

function readProperty(value: object, key: string): unknown {
  try {
    return Reflect.get(value, key);
  } catch {
    return undefined;
  }
}

function errorType(error: Error): string {
  const name = readProperty(error, 'name');
  const safeName =
    typeof name === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,99}$/.test(name) ? name : undefined;

  try {
    const constructorName = error.constructor?.name;
    if (
      typeof constructorName === 'string' &&
      /^[A-Za-z][A-Za-z0-9_]{0,99}$/.test(constructorName) &&
      (safeName === undefined || safeName === 'Error')
    )
      return constructorName;
  } catch {
    // A malformed custom Error must not disrupt the original error path.
  }
  return safeName ?? 'Error';
}

function safeErrorCode(error: Error): string | undefined {
  const candidate = readProperty(error, 'errorCode') ?? readProperty(error, 'code');
  if (typeof candidate === 'number')
    return Number.isSafeInteger(candidate) && candidate >= 0 && candidate <= 999_999_999
      ? String(candidate)
      : undefined;
  return typeof candidate === 'string' && safeErrorCodePattern.test(candidate)
    ? candidate
    : undefined;
}

function environmentFailureReason(error: Error): string | undefined {
  const message = readProperty(error, 'message');
  if (typeof message !== 'string') return undefined;
  if (/OTP bypass is forbidden in production/i.test(message))
    return 'CONFIG_AUTH_OTP_BYPASS_FORBIDDEN';

  const environmentKeys = [
    'AUTH_OTP_BYPASS_ENABLED',
    'AUTH_OTP_HASH_SECRET',
    'CORS_ORIGINS',
    'DATABASE_URL',
    'DEFAULT_ADMIN_PASSWORD',
    'JWT_ACCESS_SECRET',
    'LOG_LEVEL',
    'NODE_ENV',
    'OBJECT_STORAGE_ACCESS_KEY_ID',
    'OBJECT_STORAGE_BUCKET',
    'OBJECT_STORAGE_ENDPOINT',
    'OBJECT_STORAGE_PRIVATE_BUCKET',
    'OBJECT_STORAGE_PROVIDER',
    'OBJECT_STORAGE_PUBLIC_BASE_URL',
    'OBJECT_STORAGE_REGION',
    'OBJECT_STORAGE_SECRET_ACCESS_KEY',
    'PORT',
    'SWAGGER_ENABLED',
    'TRUST_PROXY',
    'WEB_JWT_ACCESS_SECRET',
  ] as const;
  const key = environmentKeys.find((candidate) => message.includes(candidate));
  return key ? `CONFIG_${key}_REJECTED` : undefined;
}

function categoryFor(errorTypeValue: string, code: string | undefined): ErrorCauseCategory {
  if (errorTypeValue.startsWith('PrismaClient') || code?.startsWith('P')) return 'database';
  if (errorTypeValue === 'TimeoutError' || code === 'ETIMEDOUT') return 'timeout';
  if (errorTypeValue === 'AbortError' || code === 'ABORT_ERR') return 'abort';
  if (
    code === 'ECONNREFUSED' ||
    code === 'ECONNRESET' ||
    code === 'ENOTFOUND' ||
    code === 'EHOSTUNREACH' ||
    code === 'EAI_AGAIN'
  )
    return 'network';
  if (errorTypeValue === 'ValidationError') return 'validation';
  if (code?.startsWith('ERR_HTTP') || code === 'EPIPE') return 'dependency';
  return 'unknown';
}

function normalizedFrame(path: string, line: string): string | undefined {
  const normalizedPath = path
    .trim()
    .replace(/^file:\/\//i, '')
    .replaceAll('\\', '/');
  if (
    normalizedPath.includes('?') ||
    normalizedPath.includes('#') ||
    normalizedPath.includes('://') ||
    normalizedPath.includes('node_modules') ||
    normalizedPath.startsWith('node:') ||
    normalizedPath.includes('<')
  )
    return undefined;

  const rootMatch = /(?:^|\/)(src|dist|test|scripts|prisma)\//.exec(normalizedPath);
  if (!rootMatch) return undefined;
  const relative = normalizedPath.slice(rootMatch.index + (rootMatch[0].startsWith('/') ? 1 : 0));
  if (
    !/^(?:src|dist|test|scripts|prisma)\/[A-Za-z0-9._/-]+$/.test(relative) ||
    relative.includes('..')
  )
    return undefined;

  const lineNumber = Number(line);
  if (!Number.isSafeInteger(lineNumber) || lineNumber < 1 || lineNumber > 10_000_000)
    return undefined;
  return `${relative}:${lineNumber}`;
}

function safeFrames(error: Error): string[] | undefined {
  const stack = readProperty(error, 'stack');
  if (typeof stack !== 'string') return undefined;

  const frames: string[] = [];
  for (const stackLine of stack.split(/\r?\n/).slice(1, MAX_STACK_LINES + 1)) {
    const location = /^\s*at\s+(.+?)\s*$/.exec(stackLine)?.[1];
    if (!location) continue;
    const parenthesizedLocation = /\(([^()]+)\)$/.exec(location)?.[1];
    const candidate = parenthesizedLocation ?? location;
    const match = /^(.*):(\d+):\d+$/.exec(candidate) ?? /^(.*):(\d+)$/.exec(candidate);
    const path = match?.[1];
    const line = match?.[2];
    if (!path || !line) continue;
    const frame = normalizedFrame(path, line);
    if (frame) frames.push(frame);
    if (frames.length === MAX_FRAMES) break;
  }
  return frames.length > 0 ? frames : undefined;
}

function fallbackFingerprint(material: string): string {
  let hash = 2_166_136_261;
  for (const character of material) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16_777_619);
  }
  return `${FINGERPRINT_VERSION}:fallback-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function fingerprint(material: string): string {
  try {
    return `${FINGERPRINT_VERSION}:${createHash('sha256').update(material).digest('hex').slice(0, 24)}`;
  } catch {
    return fallbackFingerprint(material);
  }
}

export function safeErrorDiagnostic(value: unknown): SafeErrorDiagnostic {
  const error = value instanceof Error ? value : undefined;
  const type = error ? errorType(error) : 'UnknownError';
  const code = error ? safeErrorCode(error) : undefined;
  const reason = error
    ? (environmentFailureReason(error) ??
      (code === 'P1000'
        ? 'DATABASE_AUTHENTICATION_FAILED'
        : code === 'P1001'
          ? 'DATABASE_SERVER_UNREACHABLE'
          : code === 'P1011'
            ? 'DATABASE_TLS_CONNECTION_FAILED'
            : undefined))
    : undefined;
  const causeValue = error ? readProperty(error, 'cause') : undefined;
  const cause = causeValue instanceof Error && causeValue !== error ? causeValue : undefined;
  const causeType = cause ? errorType(cause) : undefined;
  const causeCode = cause ? safeErrorCode(cause) : undefined;
  const causeCategory = cause ? categoryFor(causeType ?? 'Error', causeCode) : undefined;
  const frames = error ? safeFrames(error) : undefined;
  const material = [
    FINGERPRINT_VERSION,
    type,
    code ?? '',
    causeCategory ?? '',
    causeType ?? '',
    causeCode ?? '',
    ...(frames ?? []),
  ].join('\n');

  return {
    errorType: type,
    ...(code ? { errorCode: code } : {}),
    ...(reason ? { reason } : {}),
    ...(causeCategory ? { causeCategory, causeType, ...(causeCode ? { causeCode } : {}) } : {}),
    ...(frames ? { frames } : {}),
    fingerprint: fingerprint(material),
  };
}
