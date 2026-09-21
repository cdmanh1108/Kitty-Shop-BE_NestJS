import { ConsoleLogger, type LogLevel } from '@nestjs/common';
import { currentRequestMetadata } from '@common/request-context/request-context';

const levels: LogLevel[] = ['fatal', 'error', 'warn', 'log', 'debug', 'verbose'];
const sensitiveKey =
  /password|secret|token|authorization|cookie|database.?url|email|phone|address|useragent|body|headers/i;

const environmentKeys = [
  'AUTH_OTP_BYPASS_ENABLED',
  'AUTH_OTP_HASH_SECRET',
  'CORS_ORIGINS',
  'DATABASE_URL',
  'DEFAULT_ADMIN_PASSWORD',
  'DEFAULT_SHOP_CODE',
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

type SafeErrorSummary = {
  errorType: string;
  errorCode?: string;
  reason?: string;
};

const prismaErrorCode = (error: Error): string | undefined => {
  const candidate =
    (error as Error & { code?: unknown; errorCode?: unknown }).errorCode ??
    (error as Error & { code?: unknown }).code;
  return typeof candidate === 'string' && /^P\d{4}$/.test(candidate) ? candidate : undefined;
};

const environmentFailureReason = (message: string): string | undefined => {
  if (/OTP bypass is forbidden in production/i.test(message))
    return 'CONFIG_AUTH_OTP_BYPASS_FORBIDDEN';

  const key = environmentKeys.find((candidate) => message.includes(candidate));
  return key ? `CONFIG_${key}_REJECTED` : undefined;
};

export function summarizeError(error: Error): SafeErrorSummary {
  const errorCode = prismaErrorCode(error);
  const environmentReason = environmentFailureReason(error.message);

  if (environmentReason) {
    return { errorType: error.constructor.name, errorCode, reason: environmentReason };
  }

  if (errorCode === 'P1000') {
    return {
      errorType: error.constructor.name,
      errorCode,
      reason: 'DATABASE_AUTHENTICATION_FAILED',
    };
  }
  if (errorCode === 'P1001') {
    return { errorType: error.constructor.name, errorCode, reason: 'DATABASE_SERVER_UNREACHABLE' };
  }
  if (errorCode === 'P1011') {
    return {
      errorType: error.constructor.name,
      errorCode,
      reason: 'DATABASE_TLS_CONNECTION_FAILED',
    };
  }

  return errorCode
    ? { errorType: error.constructor.name, errorCode }
    : { errorType: error.constructor.name };
}

export function redactLog(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[Truncated]';
  // Error text can contain SQL parameters, credentials or customer data.
  if (value instanceof Error) return summarizeError(value);
  if (typeof value === 'string') {
    return value
      .replace(/\b(?:postgres(?:ql)?|https?):\/\/[^\s]+/gi, '[REDACTED_URL]')
      .replace(/\bBearer\s+\S+/gi, 'Bearer [REDACTED]')
      .replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+/g, '[REDACTED_TOKEN]')
      .replace(/((?:password|secret|token|authorization|cookie)\s*[=:]\s*)\S+/gi, '$1[REDACTED]')
      .slice(0, 4000);
  }
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => redactLog(item, depth + 1));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 100)
        .map(([key, item]) => [
          key,
          sensitiveKey.test(key) ? '[REDACTED]' : redactLog(item, depth + 1),
        ]),
    );
  }
  return typeof value === 'bigint' ? value.toString() : value;
}

function enrichLog(value: unknown): unknown {
  const redacted = redactLog(value);
  const requestId = currentRequestMetadata()?.requestId;
  if (
    !requestId ||
    !redacted ||
    typeof redacted !== 'object' ||
    Array.isArray(redacted) ||
    'requestId' in redacted
  )
    return redacted;
  return { ...redacted, requestId };
}

export class ApplicationLogger extends ConsoleLogger {
  constructor(
    level = process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'log' : 'debug'),
  ) {
    const index = levels.indexOf(level as LogLevel);
    super({ json: true, colors: false, logLevels: levels.slice(0, (index < 0 ? 3 : index) + 1) });
  }

  protected override printMessages(
    messages: unknown[],
    context?: string,
    logLevel?: LogLevel,
    writeStreamType?: 'stdout' | 'stderr',
  ): void {
    // Do not forward raw exception stacks through Nest's optional stack argument.
    super.printMessages(
      messages.map((message) => enrichLog(message)),
      context,
      logLevel,
      writeStreamType,
    );
  }

  protected override printStackTrace(): void {}
}
