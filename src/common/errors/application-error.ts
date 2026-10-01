export type ApplicationErrorKind =
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'TOO_MANY_REQUESTS'
  | 'UNAVAILABLE'
  | 'INTERNAL';

export interface ApplicationErrorOptions {
  /** Allows a known, safe application failure to expose its message for a 5xx response. */
  exposeOnServerError?: boolean;
  /** Preserve the legacy `{ code, message, ...details }` response for coded application errors. */
  includeCodeAndMessageInDetails?: boolean;
}

/** Base for expected application failures. It deliberately carries no transport status. */
export abstract class ApplicationError extends Error {
  abstract readonly kind: ApplicationErrorKind;

  readonly includeCodeAndMessageInDetails: boolean;
  readonly exposeOnServerError: boolean;

  constructor(
    message: string,
    readonly code?: string,
    readonly details?: Readonly<Record<string, unknown>>,
    options: ApplicationErrorOptions = {},
  ) {
    super(message);
    this.name = new.target.name;
    this.includeCodeAndMessageInDetails = options.includeCodeAndMessageInDetails ?? Boolean(code);
    this.exposeOnServerError = options.exposeOnServerError ?? false;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
