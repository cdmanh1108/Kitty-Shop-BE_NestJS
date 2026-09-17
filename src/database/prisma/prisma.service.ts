import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private connected = false;

  constructor(@Optional() options?: Prisma.PrismaClientOptions) {
    const isProd = process.env.NODE_ENV === 'production';
    const slowThresholdMs = Number(process.env.DB_SLOW_QUERY_THRESHOLD_MS ?? (isProd ? 200 : 100));

    super({
      ...options,
      log: [
        ...(Array.isArray(options?.log) ? options.log : []),
        { emit: 'event', level: 'query' },
        { emit: 'stdout', level: 'error' },
        { emit: 'stdout', level: 'warn' },
      ],
    });

    // Query performance telemetry and slow query visibility
    // Parameter values are deliberately omitted to avoid sensitive customer/search leakage
    // @ts-expect-error Prisma event typing for query event emission
    this.$on('query', (event: { query: string; duration: number; target: string }) => {
      if (event.duration >= slowThresholdMs) {
        this.logger.warn({
          event: 'db.slow_query',
          query: event.query,
          durationMs: event.duration,
          target: event.target,
        });
      }
    });
  }

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
