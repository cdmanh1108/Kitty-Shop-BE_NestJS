import { Cron } from '@nestjs/schedule';
import { Injectable } from '@nestjs/common';
import { ReminderService } from '../../application/reminder.service';

@Injectable()
export class ReminderRefreshJob {
  constructor(private readonly reminders: ReminderService) {}

  @Cron('0 */10 * * * *')
  execute(): Promise<void> {
    return this.reminders.refreshAll();
  }
}
