import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import type { Application } from 'express';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import type { AppConfiguration } from './config/configuration';
import { createOpenApiDocument } from './common/swagger/openapi';
import { ApplicationLogger } from './common/logging/application-logger';

export async function createApplication() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    logger: new ApplicationLogger(),
  });
  const config = app.get(ConfigService<AppConfiguration, true>);

  app.useLogger(new ApplicationLogger());
  app.use(helmet());
  app.setGlobalPrefix(config.get('apiPrefix', { infer: true }));

  if (config.get('trustProxy', { infer: true })) {
    (app.getHttpAdapter().getInstance() as Application).set('trust proxy', 1);
  }

  const origins = config.get('corsOrigins', { infer: true });
  app.enableCors({
    origin: origins.length === 0 ? false : origins,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();

  if (config.get('swaggerEnabled', { infer: true })) {
    const document = createOpenApiDocument(app, {
      appName: config.get('appName', { infer: true }),
      apiPrefix: config.get('apiPrefix', { infer: true }),
      appUrl: config.get('appUrl', { infer: true }),
    });
    SwaggerModule.setup('docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
  }

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
  void bootstrap();
}
