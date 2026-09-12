import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from '@config/configuration';
import { validateEnvironment } from '@config/env.validation';
import { PrismaModule } from '@database/prisma/prisma.module';
import { AuditModule } from '@modules/audit/audit.module';
import { LegacyCatalogImportService } from './legacy-catalog-import.service';

/** CLI context only: no HTTP Catalog, auth guards or scheduled jobs. */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      ignoreEnvFile: process.env.NODE_ENV === 'test',
      load: [configuration],
      validate: validateEnvironment,
    }),
    PrismaModule,
    AuditModule,
  ],
  providers: [LegacyCatalogImportService],
  exports: [LegacyCatalogImportService],
})
export class LegacyCatalogImportModule {}
