import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { configureApplication } from './configure-application';
import type { AppConfiguration } from './config/configuration';
import { ApplicationLogger } from './common/logging/application-logger';

export async function createApplication() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    logger: new ApplicationLogger(),
  });
  configureApplication(app);
  app.enableShutdownHooks();
  return app;
}

async function bootstrap(): Promise<void> {
  const app = await createApplication();
  const config = app.get(ConfigService<AppConfiguration, true>);
  const port = config.get('port', { infer: true });
  await app.listen(port, '0.0.0.0');
  Logger.log(
    {
      event: 'application.started',
      port,
      swaggerEnabled: config.get('swaggerEnabled', { infer: true }),
    },
    'Bootstrap',
  );
}

if (require.main === module) {
  bootstrap().catch((error: unknown) => {
    const logger = new ApplicationLogger();
    logger.error(
      {
        event: 'application.start_failed',
        errorClass: error instanceof Error ? error.constructor.name : 'UnknownError',
        error: error instanceof Error ? error : undefined,
      },
      undefined,
      'Bootstrap',
    );
    process.exit(1);
  });
}
