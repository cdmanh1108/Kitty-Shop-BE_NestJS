import { Module } from '@nestjs/common';
import { ReminderController } from './api/reminder.controller';
import { ReminderService } from './application/reminder.service';
import { REMINDER_REPOSITORY } from './domain/reminder.repository';
import { PrismaReminderRepository } from './infrastructure/prisma-reminder.repository';

@Module({
  controllers: [ReminderController],
  providers: [ReminderService, PrismaReminderRepository, { provide: REMINDER_REPOSITORY, useExisting: PrismaReminderRepository }],
  exports: [ReminderService],
})
export class RemindersModule {}
