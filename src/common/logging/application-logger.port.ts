export const APPLICATION_LOGGER = Symbol('APPLICATION_LOGGER');

export interface ApplicationLog {
  log(message: unknown): void;
  error(message: unknown): void;
}

export interface ApplicationLoggerFactory {
  create(context: string): ApplicationLog;
}

export const silentApplicationLog: ApplicationLog = {
  log: () => undefined,
  error: () => undefined,
};
