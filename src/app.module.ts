import { MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import configuration, { type AppConfiguration } from '@config/configuration';
import { validateEnvironment } from '@config/env.validation';
import { PrismaModule } from '@database/prisma/prisma.module';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { PermissionsGuard } from '@common/guards/permissions.guard';
import { RequestContextMiddleware } from '@common/middleware/request-context.middleware';
import { AuditModule } from '@modules/audit/audit.module';
import { AuthModule } from '@modules/auth/auth.module';
import { CatalogModule } from '@modules/catalog/catalog.module';
import { CustomersModule } from '@modules/customers/customers.module';
import { DashboardModule } from '@modules/dashboard/dashboard.module';
import { DeliveriesModule } from '@modules/deliveries/deliveries.module';
import { FinanceModule } from '@modules/finance/finance.module';
import { HealthModule } from '@modules/health/health.module';
import { MembersModule } from '@modules/members/members.module';
import { RemindersModule } from '@modules/reminders/reminders.module';
import { RentalsModule } from '@modules/rentals/rentals.module';
import { ReportsModule } from '@modules/reports/reports.module';
import { SettingsModule } from '@modules/settings/settings.module';
import { StorageModule } from '@common/storage/storage.module';
import { TenantModule } from '@common/tenant/tenant.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: '.env',
      ignoreEnvFile: process.env.NODE_ENV === 'test',
      load: [configuration],
      validate: validateEnvironment,
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfiguration, true>) => ({
        errorMessage: 'Bạn gửi yêu cầu quá nhanh. Vui lòng chờ một lúc rồi thử lại.',
        throttlers: [
          {
            ttl: config.get('rateLimitTtlMs', { infer: true }),
            limit: config.get('rateLimitLimit', { infer: true }),
          },
        ],
      }),
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    TenantModule,
    StorageModule,
    AuditModule,
    AuthModule,
    HealthModule,
    DashboardModule,
    CustomersModule,
    CatalogModule,
    RentalsModule,
    FinanceModule,
    DeliveriesModule,
    RemindersModule,
    ReportsModule,
    SettingsModule,
    MembersModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
