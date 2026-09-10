import { ConsoleLogger, type LogLevel } from '@nestjs/common';

const levels: LogLevel[] = ['fatal', 'error', 'warn', 'log', 'debug', 'verbose'];
const sensitiveKey =
  /password|secret|token|authorization|cookie|database.?url|email|phone|address|useragent|body|headers/i;

export function redactLog(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[Truncated]';
  // Error text can contain SQL parameters, credentials or customer data.
  if (value instanceof Error) return { errorType: value.constructor.name };
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
      messages.map((message) => redactLog(message)),
      context,
      logLevel,
      writeStreamType,
    );
  }

  protected override printStackTrace(): void {}
}
