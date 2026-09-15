import 'reflect-metadata';
import { BadRequestException, ValidationPipe, type INestApplication } from '@nestjs/common';
import type { ValidationError } from 'class-validator';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import type { Application } from 'express';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import type { AppConfiguration } from './config/configuration';
import {
  createAdminOpenApiDocument,
  createWebOpenApiDocument,
} from './common/swagger/openapi';
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
      exceptionFactory: (errors: ValidationError[]) => {
        const messages = (items: ValidationError[], parent = ''): string[] =>
          items.flatMap((error) => {
            const field = parent ? `${parent}.${error.property}` : error.property;
            return [
              ...Object.entries(error.constraints ?? {}).map(([constraint, message]) =>
                constraint === 'whitelistValidation'
                  ? `Trường "${field}" không được phép gửi trong yêu cầu.`
                  : constraint === 'unknownValue'
                    ? 'Dữ liệu gửi lên không hợp lệ.'
                    : message,
              ),
              ...messages(error.children ?? [], field),
            ];
          });
        return new BadRequestException(messages(errors));
      },
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  if (config.get('swaggerEnabled', { infer: true })) {
    const swaggerOptions = {
      appName: config.get('appName', { infer: true }),
      apiPrefix: config.get('apiPrefix', { infer: true }),
      appUrl: config.get('appUrl', { infer: true }),
    };

    const adminDocument = createAdminOpenApiDocument(app, swaggerOptions);
    const webDocument = createWebOpenApiDocument(app, swaggerOptions);

    SwaggerModule.setup('docs/admin', app, adminDocument, {
      swaggerOptions: { persistAuthorization: true },
    });
    SwaggerModule.setup('docs/web', app, webDocument, {
      swaggerOptions: { persistAuthorization: false },
    });
    SwaggerModule.setup('docs', app, adminDocument, {
      swaggerOptions: { persistAuthorization: true },
    });
  }
}
