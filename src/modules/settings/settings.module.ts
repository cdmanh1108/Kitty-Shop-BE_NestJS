import { Module } from '@nestjs/common';
import { SettingsController } from './api/settings.controller';
import { SettingsService } from './application/settings.service';
import { RENTAL_POLICY_PROVIDER } from './domain/rental-policy';
import { SETTINGS_REPOSITORY } from './domain/settings.repository';
import { PrismaSettingsRepository } from './infrastructure/prisma-settings.repository';

@Module({
  controllers: [SettingsController],
  providers: [
    SettingsService,
    PrismaSettingsRepository,
    { provide: SETTINGS_REPOSITORY, useExisting: PrismaSettingsRepository },
    { provide: RENTAL_POLICY_PROVIDER, useExisting: SettingsService },
  ],
  exports: [RENTAL_POLICY_PROVIDER, SettingsService],
})
export class SettingsModule {}
