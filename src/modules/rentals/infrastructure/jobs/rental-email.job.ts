import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { RentalEmailService } from '../../application/rental-email.service';

@Injectable()
export class RentalEmailJob {
  constructor(private readonly emails: RentalEmailService) {}

  @Cron('*/15 * * * * *')
  execute(): Promise<void> {
    return this.emails.deliverPending();
  }
}
