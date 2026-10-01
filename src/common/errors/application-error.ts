/** Base for expected application failures. It deliberately carries no transport status. */
export abstract class ApplicationError extends Error {
  constructor(
    message: string,
    readonly code?: string,
    readonly details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = new.target.name;
  }
}
