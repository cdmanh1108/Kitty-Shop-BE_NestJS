import 'reflect-metadata';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import type { Application } from 'express';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import type { AppConfiguration } from './config/configuration';
import { createOpenApiDocument } from './common/swagger/openapi';
import { ApplicationLogger } from './common/logging/application-logger';

export function configureApplication(app: INestApplication): void {
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
  const isProduction = config.get('nodeEnv', { infer: true }) === 'production';
  app.useGlobalFilters(new AllExceptionsFilter(isProduction));

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
}
