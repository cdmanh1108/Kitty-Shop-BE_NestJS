import type { ApplicationLoggerFactory } from '../../src/common/logging/application-logger.port';

export function applicationLoggerMock() {
  const logger = {
    log: jest.fn<void, [unknown]>(),
    error: jest.fn<void, [unknown]>(),
  };
  const factory: ApplicationLoggerFactory = {
    create: jest.fn(() => logger),
  };
  return { factory, ...logger };
}
