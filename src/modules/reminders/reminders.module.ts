import { ClockModule } from '@common/clock/clock.module';
import { Module } from '@nestjs/common';
import { ReminderController } from './api/reminder.controller';
import { ReminderService } from './application/reminder.service';
import { REMINDER_REFRESH_COORDINATOR } from './domain/reminder-refresh-coordinator';
import { REMINDER_REPOSITORY } from './domain/reminder.repository';
import { PrismaReminderRefreshCoordinator } from './infrastructure/prisma-reminder-refresh.coordinator';
import { PrismaReminderRepository } from './infrastructure/prisma-reminder.repository';
import { ReminderRefreshJob } from './infrastructure/jobs/reminder-refresh.job';

@Module({
  imports: [ClockModule],
  controllers: [ReminderController],
  providers: [
    ReminderService,
    ReminderRefreshJob,
    PrismaReminderRepository,
    PrismaReminderRefreshCoordinator,
    { provide: REMINDER_REPOSITORY, useExisting: PrismaReminderRepository },
    { provide: REMINDER_REFRESH_COORDINATOR, useExisting: PrismaReminderRefreshCoordinator },
  ],
  exports: [ReminderService],
})
export class RemindersModule {}
