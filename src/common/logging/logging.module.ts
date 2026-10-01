import { Global, Module } from '@nestjs/common';
import { APPLICATION_LOGGER } from './application-logger.port';
import { NestApplicationLoggerFactory } from './nest-application-logger.factory';

@Global()
@Module({
  providers: [{ provide: APPLICATION_LOGGER, useClass: NestApplicationLoggerFactory }],
  exports: [APPLICATION_LOGGER],
})
export class LoggingModule {}
