import { Module } from '@nestjs/common';
import { HealthController } from './api/health.controller';
import { HealthService } from './application/health.service';
import { HEALTH_REPOSITORY } from './domain/health.repository';
import { PrismaHealthRepository } from './infrastructure/prisma-health.repository';

@Module({
  controllers: [HealthController],
  providers: [HealthService, { provide: HEALTH_REPOSITORY, useClass: PrismaHealthRepository }],
})
export class HealthModule {}
