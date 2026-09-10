import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private connected = false;

  async onModuleInit(): Promise<void> {
    if (process.env.SKIP_DATABASE_CONNECT === 'true') {
      this.logger.debug('Skipping database connection for metadata-only bootstrap');
      return;
    }
    await this.$connect();
    this.connected = true;
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.connected) return;
    await this.$disconnect();
    this.connected = false;
  }
}
