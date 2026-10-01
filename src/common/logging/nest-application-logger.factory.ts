import { Injectable } from '@nestjs/common';
import { ApplicationLogger } from './application-logger';
import type { ApplicationLog, ApplicationLoggerFactory } from './application-logger.port';

@Injectable()
export class NestApplicationLoggerFactory implements ApplicationLoggerFactory {
  create(context: string): ApplicationLog {
    const logger = new ApplicationLogger();
    logger.setContext(context);
    return {
      log: (message) => logger.log(message),
      error: (message) => logger.error(message),
    };
  }
}
