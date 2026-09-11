import { Module } from '@nestjs/common';
import { SettingsController } from './api/settings.controller';
import { SettingsService } from './application/settings.service';
import { SETTINGS_REPOSITORY } from './domain/settings.repository';
import { PrismaSettingsRepository } from './infrastructure/prisma-settings.repository';

@Module({
  controllers: [SettingsController],
  providers: [
    SettingsService,
    PrismaSettingsRepository,
    { provide: SETTINGS_REPOSITORY, useExisting: PrismaSettingsRepository },
  ],
})
export class SettingsModule {}
