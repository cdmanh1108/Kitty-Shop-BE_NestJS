import { Inject, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfiguration } from '@config/configuration';
import { CLOCK, type Clock } from '@common/clock/clock';
import {
  APPLICATION_LOGGER,
  silentApplicationLog,
  type ApplicationLog,
  type ApplicationLoggerFactory,
} from '@common/logging/application-logger.port';
import {
  RENTAL_EMAIL_QUEUE,
  RENTAL_EMAIL_SENDER,
  RentalEmailDeliveryError,
  type RentalEmailQueue,
  type RentalEmailSender,
} from '../domain/rental-email';
import { renderRentalEmail } from './rental-email.template';

@Injectable()
export class RentalEmailService {
  private readonly logger: ApplicationLog;
  private processing = false;

  constructor(
    @Inject(RENTAL_EMAIL_QUEUE) private readonly queue: RentalEmailQueue,
    @Inject(RENTAL_EMAIL_SENDER) private readonly sender: RentalEmailSender,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly config: ConfigService<AppConfiguration, true>,
    @Optional() @Inject(APPLICATION_LOGGER) loggerFactory?: ApplicationLoggerFactory,
  ) {
    this.logger = loggerFactory?.create(RentalEmailService.name) ?? silentApplicationLog;
  }

  async deliverPending(): Promise<void> {
    const settings = this.config.get('rentalEmail', { infer: true });
    if (!settings.enabled || this.processing) return;
    this.processing = true;
    try {
      for (let index = 0; index < 10; index++) {
        const claim = await this.queue.claimNext(this.clock.now());
        if (!claim) break;
        try {
          if (!claim.snapshot) {
            await this.queue.failed(
              claim,
              'Nội dung email đã lưu không hợp lệ.',
              false,
              this.clock.now(),
            );
            continue;
          }
          const email = this.config.get('email', { infer: true });
          const message =
            claim.message ??
            renderRentalEmail(claim.snapshot, {
              webUrl: settings.webUrl,
              from: `${email.fromName} <${email.fromAddress}>`,
              recipient: claim.recipient,
            });
          // Persist the exact provider payload before the first send; retries remain byte-for-byte stable.
          if (!(await this.queue.prepare(claim, message, this.clock.now()))) continue;
          const providerId = await this.sender.send(message, `rental-email-${claim.id}`);
          const recorded = await this.queue.sent(claim, providerId, this.clock.now());
          if (!recorded)
            this.logger.error(
              `Email acceptance requires reconciliation; notificationId=${claim.id}`,
            );
        } catch (error) {
          const deliveryError =
            error instanceof RentalEmailDeliveryError
              ? error
              : new RentalEmailDeliveryError(
                  'Không thể hoàn tất xử lý email. Cần thử lại hoặc đối soát.',
                  true,
                );
          await this.queue.failed(
            claim,
            deliveryError.reason,
            deliveryError.retryable,
            this.clock.now(),
          );
          this.logger.error(
            `Email delivery deferred; notificationId=${claim.id}; attempt=${claim.attemptCount}`,
          );
        }
        // Respect the provider's normal per-second rate without coupling order requests to email delivery.
        await new Promise<void>((resolve) => setTimeout(resolve, 650));
      }
    } catch {
      this.logger.error(
        'Không thể xử lý hàng đợi email đơn thuê. Tác vụ sẽ thử lại ở lượt tiếp theo.',
      );
    } finally {
      this.processing = false;
    }
  }
}
